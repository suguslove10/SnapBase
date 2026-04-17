package backup

import (
	"fmt"
	"os"
)

// mysqlDefaultsFile writes a temporary MySQL credentials file and returns its path
// along with a cleanup function. Use --defaults-file=<path> instead of -p<password>
// on the command line to avoid exposing the password in process listings (ps aux).
//
// Usage:
//
//	credsFile, cleanup, err := mysqlDefaultsFile(password)
//	if err != nil { return err }
//	defer cleanup()
//	cmd := exec.Command("mysql", "--defaults-file="+credsFile, ...)
func mysqlDefaultsFile(password string) (string, func(), error) {
	f, err := os.CreateTemp("", "mysql-creds-*.cnf")
	if err != nil {
		return "", func() {}, fmt.Errorf("failed to create mysql credentials file: %w", err)
	}
	path := f.Name()
	// Restrict permissions so only the current user can read it
	if err := os.Chmod(path, 0600); err != nil {
		f.Close()
		os.Remove(path)
		return "", func() {}, fmt.Errorf("failed to chmod credentials file: %w", err)
	}
	_, err = fmt.Fprintf(f, "[client]\npassword=%s\n", password)
	f.Close()
	if err != nil {
		os.Remove(path)
		return "", func() {}, fmt.Errorf("failed to write credentials file: %w", err)
	}
	cleanup := func() { os.Remove(path) }
	return path, cleanup, nil
}
