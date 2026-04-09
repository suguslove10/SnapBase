package insights

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	claudeModel   = "claude-haiku-4-5-20251001"
	claudeAPIURL  = "https://api.anthropic.com/v1/messages"
	anthropicVer  = "2023-06-01"
)

// InsightResult is the structured response stored in the DB and returned to the frontend.
type InsightResult struct {
	Summary         string               `json:"summary"`
	HealthScore     int                  `json:"health_score"`
	Tables          []TableInsight       `json:"tables"`
	Recommendations []Recommendation     `json:"recommendations"`
	Anomalies       []Anomaly            `json:"anomalies"`
}

type TableInsight struct {
	Name        string `json:"name"`
	Observation string `json:"observation"`
	Severity    string `json:"severity"` // info, warning, error
}

type Recommendation struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Impact      string `json:"impact"`   // high, medium, low
	Category    string `json:"category"` // performance, security, naming, design
}

type Anomaly struct {
	Description string `json:"description"`
	Severity    string `json:"severity"` // warning, error
}

type claudeRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []claudeMessage `json:"messages"`
	System    string          `json:"system"`
}

type claudeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// AnalyzeSchema calls Claude and returns structured insights for the given schema string.
func AnalyzeSchema(apiKey, schema string) (*InsightResult, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY is not configured")
	}

	systemPrompt := `You are an expert database architect. Analyze the provided database schema and return a JSON object with actionable insights. Your response must be valid JSON only — no markdown, no extra text.

Required JSON structure:
{
  "summary": "2-3 sentence overview of the schema",
  "health_score": <integer 0-100>,
  "tables": [
    {"name": "<table>", "observation": "<one sentence>", "severity": "<info|warning|error>"}
  ],
  "recommendations": [
    {"title": "<short title>", "description": "<detailed suggestion>", "impact": "<high|medium|low>", "category": "<performance|security|naming|design>"}
  ],
  "anomalies": [
    {"description": "<issue description>", "severity": "<warning|error>"}
  ]
}

Focus on: missing indexes, naming inconsistencies, security risks (e.g. storing plaintext secrets), missing foreign keys, tables with no timestamps, very wide tables, potential N+1 patterns from lack of indexes.`

	userMsg := fmt.Sprintf("Analyze this database schema:\n\n%s", schema)

	reqBody := claudeRequest{
		Model:     claudeModel,
		MaxTokens: 2048,
		System:    systemPrompt,
		Messages:  []claudeMessage{{Role: "user", Content: userMsg}},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest("POST", claudeAPIURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", anthropicVer)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("claude api request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var claudeResp claudeResponse
	if err := json.Unmarshal(respBytes, &claudeResp); err != nil {
		return nil, fmt.Errorf("failed to parse claude response: %w", err)
	}

	if claudeResp.Error != nil {
		return nil, fmt.Errorf("claude api error: %s", claudeResp.Error.Message)
	}
	if len(claudeResp.Content) == 0 {
		return nil, fmt.Errorf("claude returned empty response")
	}

	text := claudeResp.Content[0].Text

	var result InsightResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("claude response is not valid JSON: %w\nraw: %s", err, text)
	}

	return &result, nil
}
