package backend

import (
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Operations is replaced by generated business operations during assembly.
// The default keeps the versioned scaffold independently buildable.
func Operations(_ *pgxpool.Pool, _ *slog.Logger) map[string]Operation {
	return map[string]Operation{}
}
