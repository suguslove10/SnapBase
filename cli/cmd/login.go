package cmd

import (
	"fmt"
	"net/url"
	"os/exec"
	"runtime"
	"time"

	"github.com/spf13/cobra"

	"github.com/suguslove10/snapbase-cli/internal/api"
	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate with SnapBase",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Initiating SnapBase CLI authentication...")

		// Step 1: Get auth session from backend
		var initResp struct {
			Code       string `json:"code"`
			PollToken  string `json:"poll_token"`
			ExpiresAt  string `json:"expires_at"`
		}
		if err := api.Get("/cli/auth/init", "", &initResp); err != nil {
			return fmt.Errorf("failed to start auth: %w", err)
		}

		// Step 2: Build browser URL
		frontendURL := cfg.DefaultFrontendURL
		if v, err := cfg.Load(); err == nil && v.APIURL != "" {
			// Derive frontend URL from API URL for custom setups
		}
		authURL := frontendURL + "/cli-auth?token=" + url.QueryEscape(initResp.PollToken) +
			"&code=" + url.QueryEscape(initResp.Code)

		fmt.Printf("\n  Verification code: \033[1;36m%s\033[0m\n\n", initResp.Code)
		fmt.Printf("  Opening browser to: %s\n\n", authURL)
		fmt.Println("  If the browser doesn't open, copy the URL above manually.")
		fmt.Println()

		// Open browser
		openBrowser(authURL)

		// Step 3: Poll for completion
		fmt.Print("  Waiting for authorization")
		deadline := time.Now().Add(5 * time.Minute)
		for time.Now().Before(deadline) {
			time.Sleep(2 * time.Second)
			fmt.Print(".")

			var pollResp struct {
				Status string `json:"status"`
				JWT    string `json:"jwt"`
			}
			if err := api.Get("/cli/auth/poll/"+initResp.PollToken, "", &pollResp); err != nil {
				continue
			}

			if pollResp.Status == "complete" && pollResp.JWT != "" {
				fmt.Println()

				// Get user info
				var me struct {
					Email string `json:"email"`
				}
				api.Get("/auth/me", pollResp.JWT, &me)

				// Save config
				c := &cfg.Config{
					Token:  pollResp.JWT,
					Email:  me.Email,
					APIURL: cfg.APIURL(),
				}
				if err := cfg.Save(c); err != nil {
					return fmt.Errorf("failed to save credentials: %w", err)
				}

				fmt.Printf("\n  ✅ Logged in as \033[1;32m%s\033[0m\n\n", me.Email)
				return nil
			}
		}

		fmt.Println()
		return fmt.Errorf("authentication timed out — please try again")
	},
}

func openBrowser(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "linux":
		cmd = "xdg-open"
		args = []string{url}
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	default:
		return
	}

	exec.Command(cmd, args...).Start()
}
