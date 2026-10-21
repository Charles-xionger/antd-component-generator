package backend

import (
	"context"
	"encoding/json"
	"net/http"
)

// Operation is the stable boundary between generated business logic and the
// platform-owned HTTP runtime.
type Operation func(context.Context, json.RawMessage) (any, error)

type OperationError struct {
	Status  int
	Message string
}

func (e *OperationError) Error() string { return e.Message }

func NewOperationError(status int, message string) error {
	return &OperationError{Status: status, Message: message}
}

func platformWriteJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
