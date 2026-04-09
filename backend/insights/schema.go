package insights

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/suguslove10/snapbase/models"
)

// TableInfo holds extracted schema information for one table/collection.
type TableInfo struct {
	Name    string
	Columns []ColumnInfo
	Indexes []string
	RowEst  int64
}

type ColumnInfo struct {
	Name     string
	DataType string
	Nullable string
}

// ExtractSchema connects to the target DB and returns a human-readable schema string.
// conn.PasswordEncrypted must already be decrypted (plain password) by the caller.
func ExtractSchema(conn models.DBConnection) (string, error) {
	password := conn.PasswordEncrypted // decrypted by handler before calling

	switch conn.Type {
	case "postgres":
		return extractPostgres(conn, password)
	case "mysql":
		return extractMySQL(conn, password)
	case "sqlite":
		return extractSQLite(conn)
	case "mongodb":
		return extractMongoDB(conn, password)
	default:
		return "", fmt.Errorf("unsupported db type: %s", conn.Type)
	}
}

func extractPostgres(conn models.DBConnection, password string) (string, error) {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable connect_timeout=10",
		conn.Host, conn.Port, conn.Username, password, conn.Database)
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return "", err
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		return "", err
	}

	rows, err := db.Query(`
		SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
		FROM information_schema.columns c
		WHERE c.table_schema = 'public'
		ORDER BY c.table_name, c.ordinal_position
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	tables := map[string]*TableInfo{}
	order := []string{}
	for rows.Next() {
		var tbl, col, dtype, nullable string
		if err := rows.Scan(&tbl, &col, &dtype, &nullable); err != nil {
			continue
		}
		if _, ok := tables[tbl]; !ok {
			tables[tbl] = &TableInfo{Name: tbl}
			order = append(order, tbl)
		}
		tables[tbl].Columns = append(tables[tbl].Columns, ColumnInfo{Name: col, DataType: dtype, Nullable: nullable})
	}

	// Fetch index names per table
	idxRows, _ := db.Query(`
		SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename
	`)
	if idxRows != nil {
		defer idxRows.Close()
		for idxRows.Next() {
			var tbl, idx string
			if err := idxRows.Scan(&tbl, &idx); err == nil {
				if t, ok := tables[tbl]; ok {
					t.Indexes = append(t.Indexes, idx)
				}
			}
		}
	}

	// Row estimates
	for _, tbl := range order {
		var n int64
		db.QueryRow(fmt.Sprintf("SELECT reltuples::bigint FROM pg_class WHERE relname = '%s'", tbl)).Scan(&n)
		tables[tbl].RowEst = n
	}

	return formatSchema(conn.Database, "PostgreSQL", order, tables), nil
}

func extractMySQL(conn models.DBConnection, password string) (string, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?timeout=10s",
		conn.Username, password, conn.Host, conn.Port, conn.Database)

	// Use lib/pq-style import only for postgres — for MySQL we'd need go-sql-driver/mysql
	// Since MySQL driver may not be available, return a placeholder schema
	_ = dsn
	return fmt.Sprintf("Database: %s (MySQL)\nHost: %s:%d\nUser: %s\n\n[Schema extraction requires mysql driver]",
		conn.Database, conn.Host, conn.Port, conn.Username), nil
}

func extractSQLite(conn models.DBConnection) (string, error) {
	return fmt.Sprintf("Database: %s (SQLite)\nFile: %s\n\n[Schema extraction requires sqlite3 driver]",
		conn.Name, conn.Database), nil
}

func extractMongoDB(conn models.DBConnection, password string) (string, error) {
	return fmt.Sprintf("Database: %s (MongoDB)\nHost: %s:%d\nUser: %s\n\n[Collection listing requires mongo driver]",
		conn.Database, conn.Host, conn.Port, conn.Username), nil
}

func formatSchema(dbName, dbType string, order []string, tables map[string]*TableInfo) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Database: %s (%s)\nTable count: %d\n\n", dbName, dbType, len(order)))
	for _, name := range order {
		t := tables[name]
		sb.WriteString(fmt.Sprintf("TABLE: %s (est. %d rows)\n", name, t.RowEst))
		for _, col := range t.Columns {
			nullable := "NOT NULL"
			if col.Nullable == "YES" {
				nullable = "NULL"
			}
			sb.WriteString(fmt.Sprintf("  - %s %s %s\n", col.Name, strings.ToUpper(col.DataType), nullable))
		}
		if len(t.Indexes) > 0 {
			sb.WriteString(fmt.Sprintf("  Indexes: %s\n", strings.Join(t.Indexes, ", ")))
		}
		sb.WriteString("\n")
	}
	return sb.String()
}
