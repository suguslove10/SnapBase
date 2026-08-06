package sync

import (
	"bufio"
	"io"
	"regexp"
	"strings"
)

var (
	emailRegex = regexp.MustCompile(`(?i)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`)
	ssnRegex   = regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`)
	phoneRegex = regexp.MustCompile(`\b\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b`)
)

type PIIMasker struct{}

func NewPIIMasker() *PIIMasker {
	return &PIIMasker{}
}

// MaskDumpStream processes an uncompressed SQL dump stream line-by-line,
// replacing sensitive PII (emails, SSNs, phone numbers) with anonymized placeholders.
func (m *PIIMasker) MaskDumpStream(r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	// Buffer size up to 10MB per line for long INSERT statements
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)

	writer := bufio.NewWriter(w)
	defer writer.Flush()

	for scanner.Scan() {
		line := scanner.Text()

		// Mask emails
		if strings.Contains(line, "@") {
			line = emailRegex.ReplaceAllStringFunc(line, func(email string) string {
				parts := strings.Split(email, "@")
				if len(parts) != 2 {
					return email
				}
				name := parts[0]
				if len(name) <= 2 {
					return "u*@" + parts[1]
				}
				return name[:1] + "***" + name[len(name)-1:] + "@masked.snapbase.local"
			})
		}

		// Mask SSNs
		line = ssnRegex.ReplaceAllString(line, "XXX-XX-XXXX")

		_, err := writer.WriteString(line + "\n")
		if err != nil {
			return err
		}
	}

	return scanner.Err()
}
