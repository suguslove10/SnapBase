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
	// Using GPT-4o-mini — fast, cheap, great for structured JSON output.
	aiModel  = "gpt-4o-mini"
	openAIURL = "https://api.openai.com/v1/chat/completions"
)

// InsightResult is the structured response stored in the DB and returned to the frontend.
type InsightResult struct {
	Summary         string           `json:"summary"`
	HealthScore     int              `json:"health_score"`
	Tables          []TableInsight   `json:"tables"`
	Recommendations []Recommendation `json:"recommendations"`
	Anomalies       []Anomaly        `json:"anomalies"`
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

type openAIRequest struct {
	Model          string          `json:"model"`
	Messages       []openAIMessage `json:"messages"`
	MaxTokens      int             `json:"max_tokens"`
	ResponseFormat struct {
		Type string `json:"type"`
	} `json:"response_format"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

const systemPrompt = `You are an expert database architect. Analyze the provided database schema and return a JSON object with actionable insights. Your response must be valid JSON only — no markdown, no extra text.

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

// AnalyzeSchema calls OpenAI and returns structured insights for the given schema string.
func AnalyzeSchema(apiKey, schema string) (*InsightResult, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY is not configured")
	}

	reqBody := openAIRequest{
		Model:     aiModel,
		MaxTokens: 2048,
		Messages: []openAIMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: fmt.Sprintf("Analyze this database schema:\n\n%s", schema)},
		},
	}
	reqBody.ResponseFormat.Type = "json_object"

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest("POST", openAIURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai api request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var oaResp openAIResponse
	if err := json.Unmarshal(respBytes, &oaResp); err != nil {
		return nil, fmt.Errorf("failed to parse openai response: %w", err)
	}

	if oaResp.Error != nil {
		return nil, fmt.Errorf("openai api error: %s", oaResp.Error.Message)
	}
	if len(oaResp.Choices) == 0 {
		return nil, fmt.Errorf("openai returned empty response")
	}

	text := oaResp.Choices[0].Message.Content

	var result InsightResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("response is not valid JSON: %w\nraw: %s", err, text)
	}

	return &result, nil
}
