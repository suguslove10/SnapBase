package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "snapbase",
	Short: "SnapBase CLI — manage database backups from the terminal",
	Long: `SnapBase CLI lets you trigger backups, manage connections,
run syncs, and check backup status from the command line.

Get started: snapbase login`,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(loginCmd)
	rootCmd.AddCommand(logoutCmd)
	rootCmd.AddCommand(connectionsCmd)
	rootCmd.AddCommand(backupCmd)
	rootCmd.AddCommand(restoreCmd)
	rootCmd.AddCommand(schedulesCmd)
	rootCmd.AddCommand(statusCmd)
}
