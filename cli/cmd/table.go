package cmd

import (
	"fmt"
	"strings"
)

// printTable renders a simple fixed-width ASCII table to stdout.
func printTable(headers []string, populate func(print func(...string))) {
	var rows [][]string

	populate(func(cols ...string) {
		rows = append(rows, cols)
	})

	// Calculate column widths
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, row := range rows {
		for i, col := range row {
			if i < len(widths) && len(col) > widths[i] {
				widths[i] = len(col)
			}
		}
	}

	sep := "  "

	// Print header
	fmt.Println()
	header := ""
	for i, h := range headers {
		header += fmt.Sprintf("%-*s", widths[i], h)
		if i < len(headers)-1 {
			header += sep
		}
	}
	fmt.Printf("  \033[1;37m%s\033[0m\n", header)

	// Divider
	div := ""
	for i, w := range widths {
		div += strings.Repeat("─", w)
		if i < len(widths)-1 {
			div += sep
		}
	}
	fmt.Printf("  %s\n", div)

	// Rows
	for _, row := range rows {
		line := ""
		for i, col := range row {
			if i < len(widths) {
				line += fmt.Sprintf("%-*s", widths[i], col)
				if i < len(row)-1 {
					line += sep
				}
			}
		}
		fmt.Printf("  %s\n", line)
	}
	fmt.Println()
}
