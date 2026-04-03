package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/suguslove10/snapbase-cli/internal/api"
	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var backupCmd = &cobra.Command{
	Use:   "backup",
	Short: "Trigger or list backups",
}

var backupTriggerCmd = &cobra.Command{
	Use:   "run <connection-name>",
	Short: "Trigger an immediate backup",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := cfg.Load()
		if err != nil {
			return fmt.Errorf("not logged in — run: snapbase login")
		}

		connName := args[0]

		// Find connection by name
		var conns []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
			Type string `json:"type"`
		}
		if err := api.Get("/connections", c.Token, &conns); err != nil {
			return err
		}

		var connID int
		var connType string
		for _, conn := range conns {
			if conn.Name == connName {
				connID = conn.ID
				connType = conn.Type
				break
			}
		}
		if connID == 0 {
			return fmt.Errorf("connection %q not found", connName)
		}

		fmt.Printf("Triggering backup for \033[1;36m%s\033[0m (%s)...\n", connName, connType)

		if err := api.Post(fmt.Sprintf("/backups/trigger/%d", connID), c.Token, nil, nil); err != nil {
			return fmt.Errorf("failed to trigger backup: %w", err)
		}

		// Poll until job completes
		fmt.Print("  Running backup")
		deadline := time.Now().Add(10 * time.Minute)
		for time.Now().Before(deadline) {
			time.Sleep(3 * time.Second)
			fmt.Print(".")

			var jobs []struct {
				ConnectionID int    `json:"connection_id"`
				Status       string `json:"status"`
				SizeBytes    *int64 `json:"size_bytes"`
				ErrorMessage string `json:"error_message"`
			}
			api.Get("/backups", c.Token, &jobs)

			for _, j := range jobs {
				if j.ConnectionID == connID && (j.Status == "success" || j.Status == "failed") {
					fmt.Println()
					if j.Status == "success" {
						size := ""
						if j.SizeBytes != nil {
							size = " — " + formatBytes(*j.SizeBytes)
						}
						fmt.Printf("\n  ✅ Backup completed%s\n\n", size)
					} else {
						fmt.Printf("\n  ❌ Backup failed: %s\n\n", j.ErrorMessage)
					}
					return nil
				}
			}
		}

		fmt.Println()
		fmt.Println("\n  ⏳ Backup is still running — check dashboard for status")
		return nil
	},
}

var backupListCmd = &cobra.Command{
	Use:   "list [connection-name]",
	Short: "List recent backups",
	Args:  cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := cfg.Load()
		if err != nil {
			return fmt.Errorf("not logged in — run: snapbase login")
		}

		var jobs []struct {
			ID             int        `json:"id"`
			ConnectionName string     `json:"connection_name"`
			Status         string     `json:"status"`
			SizeBytes      *int64     `json:"size_bytes"`
			StartedAt      *time.Time `json:"started_at"`
		}
		if err := api.Get("/backups", c.Token, &jobs); err != nil {
			return err
		}

		// Filter by connection name if provided
		if len(args) > 0 {
			filter := args[0]
			var filtered []struct {
				ID             int        `json:"id"`
				ConnectionName string     `json:"connection_name"`
				Status         string     `json:"status"`
				SizeBytes      *int64     `json:"size_bytes"`
				StartedAt      *time.Time `json:"started_at"`
			}
			for _, j := range jobs {
				if j.ConnectionName == filter {
					filtered = append(filtered, j)
				}
			}
			jobs = filtered
		}

		if len(jobs) == 0 {
			fmt.Println("No backups found.")
			return nil
		}

		printTable(
			[]string{"ID", "Connection", "Started", "Size", "Status"},
			func(print func(...string)) {
				for _, j := range jobs {
					started := "—"
					if j.StartedAt != nil {
						started = j.StartedAt.Format("2006-01-02 15:04")
					}
					size := "—"
					if j.SizeBytes != nil {
						size = formatBytes(*j.SizeBytes)
					}
					print(fmt.Sprintf("%d", j.ID), j.ConnectionName, started, size, j.Status)
				}
			},
		)
		return nil
	},
}

func formatBytes(b int64) string {
	if b == 0 {
		return "0 B"
	}
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB"}
	i := 0
	size := float64(b)
	for size >= float64(k) && i < len(sizes)-1 {
		size /= float64(k)
		i++
	}
	return fmt.Sprintf("%.2f %s", size, sizes[i])
}

func init() {
	backupCmd.AddCommand(backupTriggerCmd)
	backupCmd.AddCommand(backupListCmd)
}
