package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/suguslove10/snapbase-cli/internal/api"
	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var connectionsCmd = &cobra.Command{
	Use:   "connections",
	Short: "Manage database connections",
}

var connectionsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all connections",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := cfg.Load()
		if err != nil {
			return fmt.Errorf("not logged in — run: snapbase login")
		}

		var conns []struct {
			ID       int     `json:"id"`
			Name     string  `json:"name"`
			Type     string  `json:"type"`
			Host     string  `json:"host"`
			Database string  `json:"database"`
		}
		if err := api.Get("/connections", c.Token, &conns); err != nil {
			return err
		}

		if len(conns) == 0 {
			fmt.Println("No connections found.")
			return nil
		}

		printTable(
			[]string{"ID", "Name", "Type", "Host / Path"},
			func(print func(...string)) {
				for _, c := range conns {
					hostPath := c.Host
					if c.Type == "sqlite" {
						hostPath = c.Database
					}
					print(fmt.Sprintf("%d", c.ID), c.Name, c.Type, hostPath)
				}
			},
		)
		return nil
	},
}

func init() {
	connectionsCmd.AddCommand(connectionsListCmd)
}
