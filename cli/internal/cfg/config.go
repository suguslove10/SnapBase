package cfg

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	Token   string `json:"token"`
	Email   string `json:"email"`
	APIURL  string `json:"api_url"`
}

const DefaultAPIURL = "https://api.getsnapbase.com"
const DefaultFrontendURL = "https://getsnapbase.com"

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".snapbase", "config.json"), nil
}

func Load() (*Config, error) {
	path, err := configPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	if c.APIURL == "" {
		c.APIURL = DefaultAPIURL
	}
	return &c, nil
}

func Save(c *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func Delete() error {
	path, err := configPath()
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func APIURL() string {
	if v := os.Getenv("SNAPBASE_API_URL"); v != "" {
		return v
	}
	c, err := Load()
	if err != nil || c.APIURL == "" {
		return DefaultAPIURL
	}
	return c.APIURL
}
