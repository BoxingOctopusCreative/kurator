package migrate

import (
	"strings"
	"testing"
)

func TestSplitMigrationStatements_simpleSemicolons(t *testing.T) {
	sql := "SELECT 1; SELECT 2;"
	got := splitMigrationStatements(sql)
	want := []string{"SELECT 1", "SELECT 2"}
	if len(got) != len(want) {
		t.Fatalf("got %d parts: %q, want %d", len(got), got, len(want))
	}
	for i := range want {
		if strings.TrimSpace(got[i]) != want[i] {
			t.Fatalf("part %d: got %q want %q", i, got[i], want[i])
		}
	}
}

func TestSplitMigrationStatements_semicolonInSingleQuotes(t *testing.T) {
	sql := `SELECT ';'; SELECT 2`
	got := splitMigrationStatements(sql)
	if len(got) != 2 {
		t.Fatalf("got %d parts: %q", len(got), got)
	}
	if !strings.Contains(got[0], "';'") {
		t.Fatalf("first part should keep quoted semicolon: %q", got[0])
	}
}

func TestSplitMigrationStatements_dollarQuotedDO(t *testing.T) {
	sql := `CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $tag$
BEGIN
  IF true THEN
    NULL;
  END IF;
END
$tag$;

SELECT 3`
	got := splitMigrationStatements(sql)
	if len(got) != 3 {
		t.Fatalf("got %d parts:\n%s", len(got), strings.Join(got, "\n---\n"))
	}
	if !strings.Contains(got[1], "DO $tag$") || !strings.Contains(got[1], "NULL;") {
		t.Fatalf("DO block should be one statement, got:\n%q", got[1])
	}
	if strings.TrimSpace(got[2]) != "SELECT 3" {
		t.Fatalf("third part: %q", got[2])
	}
}
