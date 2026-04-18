package migrations

import "embed"

// SQL holds bundled migration files (apply in lexical order by filename).
//
//go:embed *.sql
var SQL embed.FS
