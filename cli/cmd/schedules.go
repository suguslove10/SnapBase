package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/suguslove10/snapbase-cli/internal/api"
	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var schedulesCmd = &cobra.Command{
	Use:   "schedules",
	Short: "Manage backup schedules",
}

var schedulesListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all schedules",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := cfg.Load()
		if err != nil {
			return fmt.Errorf("not logged in — run: snapbase login")
		}

		var schedules []struct {
			ID             int        `json:"id"`
			ConnectionName string     `json:"connection_name"`
			CronExpression string     `json:"cron_expression"`
			Enabled        bool       `json:"enabled"`
			LastRun        *time.Time `json:"last_run"`
			NextRun        *time.Time `json:"next_run"`
		}
		if err := api.Get("/schedules", c.Token, &schedules); err != nil {
			return err
		}

		if len(schedules) == 0 {
			fmt.Println("No schedules found.")
			return nil
		}

		printTable(
			[]string{"ID", "Connection", "Cron", "Enabled", "Next Run"},
			func(print func(...string)) {
				for _, s := range schedules {
					enabled := "yes"
					if !s.Enabled {
						enabled = "no"
					}
					nextRun := "—"
					if s.NextRun != nil {
						nextRun = s.NextRun.Format("2006-01-02 15:04")
					}
					print(fmt.Sprintf("%d", s.ID), s.ConnectionName, s.CronExpression, enabled, nextRun)
				}
			},
		)
		return nil
	},
}

func init() {
	schedulesCmd.AddCommand(schedulesListCmd)
}
