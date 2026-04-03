package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

func do(method, path string, token string, body interface{}) ([]byte, int, error) {
	baseURL := cfg.APIURL()

	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, baseURL+"/api"+path, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return respBody, resp.StatusCode, nil
}

func Get(path, token string, out interface{}) error {
	body, status, err := do("GET", path, token, nil)
	if err != nil {
		return err
	}
	if status >= 400 {
		var errResp map[string]string
		json.Unmarshal(body, &errResp)
		if msg, ok := errResp["error"]; ok {
			return fmt.Errorf("%s", msg)
		}
		return fmt.Errorf("HTTP %d", status)
	}
	if out != nil {
		return json.Unmarshal(body, out)
	}
	return nil
}

func Post(path, token string, reqBody, out interface{}) error {
	body, status, err := do("POST", path, token, reqBody)
	if err != nil {
		return err
	}
	if status >= 400 {
		var errResp map[string]string
		json.Unmarshal(body, &errResp)
		if msg, ok := errResp["error"]; ok {
			return fmt.Errorf("%s", msg)
		}
		return fmt.Errorf("HTTP %d", status)
	}
	if out != nil {
		return json.Unmarshal(body, out)
	}
	return nil
}
