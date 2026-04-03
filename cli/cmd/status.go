package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/suguslove10/snapbase-cli/internal/api"
	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show account and usage information",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := cfg.Load()
		if err != nil {
			return fmt.Errorf("not logged in — run: snapbase login")
		}

		var me struct {
			Email string `json:"email"`
			Name  string `json:"name"`
		}
		api.Get("/auth/me", c.Token, &me)

		var usage struct {
			Plan                    string `json:"plan"`
			StorageUsedFormatted    string `json:"storage_used_formatted"`
			StorageLimitFormatted   string `json:"storage_limit_formatted"`
			ConnectionsUsed         int    `json:"connections_used"`
			ConnectionsLimit        int    `json:"connections_limit"`
			BackupsThisMonth        int    `json:"backups_this_month"`
		}
		api.Get("/billing/usage", c.Token, &usage)

		var schedules []interface{}
		api.Get("/schedules", c.Token, &schedules)

		fmt.Println()
		fmt.Printf("  \033[1;37mSnapBase Account\033[0m\n")
		fmt.Printf("  ─────────────────────────────────\n")
		if me.Name != "" {
			fmt.Printf("  Name:        %s\n", me.Name)
		}
		fmt.Printf("  Email:       %s\n", me.Email)
		fmt.Printf("  Plan:        %s\n", usage.Plan)
		fmt.Printf("  Storage:     %s / %s\n", usage.StorageUsedFormatted, usage.StorageLimitFormatted)
		if usage.ConnectionsLimit == -1 {
			fmt.Printf("  Connections: %d / ∞\n", usage.ConnectionsUsed)
		} else {
			fmt.Printf("  Connections: %d / %d\n", usage.ConnectionsUsed, usage.ConnectionsLimit)
		}
		fmt.Printf("  Schedules:   %d active\n", len(schedules))
		fmt.Println()

		return nil
	},
}
