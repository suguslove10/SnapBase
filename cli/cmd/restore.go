package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/suguslove10/snapbase-cli/internal/api"
	"github.com/suguslove10/snapbase-cli/internal/cfg"
)

var restoreCmd = &cobra.Command{
	Use:   "restore <backup-id>",
	Short: "Restore a backup to its original connection",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := cfg.Load()
		if err != nil {
			return fmt.Errorf("not logged in — run: snapbase login")
		}

		backupID := args[0]

		// Get backup info
		var jobs []struct {
			ID             int    `json:"id"`
			ConnectionName string `json:"connection_name"`
		}
		if err := api.Get("/backups", c.Token, &jobs); err != nil {
			return err
		}

		var connName string
		for _, j := range jobs {
			if fmt.Sprintf("%d", j.ID) == backupID {
				connName = j.ConnectionName
				break
			}
		}

		if connName == "" {
			return fmt.Errorf("backup %s not found", backupID)
		}

		fmt.Printf("\033[1;33m⚠  This will restore backup #%s to connection: %s\033[0m\n", backupID, connName)
		fmt.Print("Restore to this connection? [y/N]: ")

		reader := bufio.NewReader(os.Stdin)
		answer, _ := reader.ReadString('\n')
		answer = strings.TrimSpace(strings.ToLower(answer))

		if answer != "y" && answer != "yes" {
			fmt.Println("Restore cancelled.")
			return nil
		}

		fmt.Printf("Triggering restore for backup #%s...\n", backupID)

		if err := api.Post(fmt.Sprintf("/backups/%s/restore", backupID), c.Token, nil, nil); err != nil {
			return fmt.Errorf("failed to trigger restore: %w", err)
		}

		fmt.Printf("\n  ✅ Restore started — check the dashboard for progress.\n\n")
		return nil
	},
}
