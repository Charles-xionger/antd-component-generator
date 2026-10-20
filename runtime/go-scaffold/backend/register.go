package backend

import (
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Register(mux *http.ServeMux, pool *pgxpool.Pool, logger *slog.Logger) {
	mux.HandleFunc("GET /api/runtime", func(w http.ResponseWriter, _ *http.Request) {
		platformWriteJSON(w, http.StatusOK, map[string]string{"runtime": "go-1.24"})
	})
	operations := Operations(pool, logger)
	mux.HandleFunc("POST /api/operations/{operationId}", func(w http.ResponseWriter, r *http.Request) {
		operationID := r.PathValue("operationId")
		operation, ok := operations[operationID]
		if !ok {
			platformWriteJSON(w, http.StatusNotFound, map[string]string{"error": "未知操作: " + operationID})
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			platformWriteJSON(w, http.StatusBadRequest, map[string]string{"error": "无法读取请求数据"})
			return
		}
		if len(body) == 0 {
			body = []byte("{}")
		}
		result, err := operation(r.Context(), body)
		if err != nil {
			var operationError *OperationError
			if errors.As(err, &operationError) {
				platformWriteJSON(w, operationError.Status, map[string]string{"error": operationError.Message})
				return
			}
			logger.Error("operation failed", "operation_id", operationID, "error", err)
			platformWriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "操作执行失败"})
			return
		}
		platformWriteJSON(w, http.StatusOK, result)
	})
}
