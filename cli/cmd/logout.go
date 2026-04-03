package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Clear saved credentials",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := cfg.Delete(); err != nil {
			return fmt.Errorf("failed to remove credentials: %w", err)
		}
		fmt.Println("✅ Logged out successfully.")
		return nil
	},
}
