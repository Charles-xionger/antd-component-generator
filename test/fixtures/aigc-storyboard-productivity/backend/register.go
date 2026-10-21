package backend

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type server struct {
	db     *pgxpool.Pool
	logger *slog.Logger
}

type namedEntity struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type taskInput struct {
	ID        string `json:"id"`
	ProjectID string `json:"projectId"`
	Title     string `json:"title"`
}

type workLogInput struct {
	ID               string  `json:"id"`
	IdempotencyKey   string  `json:"idempotencyKey"`
	PersonID         string  `json:"personId"`
	ProjectID        string  `json:"projectId"`
	TaskID           string  `json:"taskId"`
	WorkDate         string  `json:"workDate"`
	Hours            float64 `json:"hours"`
	CompletedShots   int     `json:"completedShots"`
	ComplexityWeight float64 `json:"complexityWeight"`
}

type dashboardInput struct {
	ProjectID string `json:"projectId"`
	PersonID  string `json:"personId"`
	DateFrom  string `json:"dateFrom"`
	DateTo    string `json:"dateTo"`
}

func Register(mux *http.ServeMux, db *pgxpool.Pool, logger *slog.Logger) {
	s := &server{db: db, logger: logger}
	mux.HandleFunc("POST /api/operations/{operationId}", s.invoke)
}

func (s *server) invoke(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.PathValue("operationId") {
	case "person.create":
		s.createNamed(w, r, "people")
	case "project.create":
		s.createNamed(w, r, "productions")
	case "task.create":
		s.createTask(w, r)
	case "worklog.create":
		s.createWorkLog(w, r)
	case "dashboard.query":
		s.dashboard(w, r)
	default:
		writeError(w, http.StatusNotFound, "unknown operation")
	}
}

func decode(r *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func newID() string {
	buffer := make([]byte, 16)
	_, _ = rand.Read(buffer)
	return hex.EncodeToString(buffer)
}

func databaseStatus(err error) int {
	var pgError *pgconn.PgError
	if errors.As(err, &pgError) {
		switch pgError.Code {
		case "23503", "23514":
			return http.StatusBadRequest
		case "23505":
			return http.StatusConflict
		}
	}
	return http.StatusInternalServerError
}

func (s *server) createNamed(w http.ResponseWriter, r *http.Request, table string) {
	var input namedEntity
	if err := decode(r, &input); err != nil || strings.TrimSpace(input.Name) == "" {
		writeError(w, http.StatusBadRequest, "id and name are required")
		return
	}
	if input.ID == "" {
		input.ID = newID()
	}
	query := "INSERT INTO " + table + " (id, name) VALUES ($1, $2)"
	if _, err := s.db.Exec(r.Context(), query, input.ID, input.Name); err != nil {
		writeError(w, databaseStatus(err), "entity could not be created")
		return
	}
	writeJSON(w, http.StatusCreated, input)
}

func (s *server) createTask(w http.ResponseWriter, r *http.Request) {
	var input taskInput
	if err := decode(r, &input); err != nil || input.ProjectID == "" || strings.TrimSpace(input.Title) == "" {
		writeError(w, http.StatusBadRequest, "projectId and title are required")
		return
	}
	if input.ID == "" {
		input.ID = newID()
	}
	_, err := s.db.Exec(r.Context(), "INSERT INTO storyboard_tasks (id, production_id, title) VALUES ($1, $2, $3)", input.ID, input.ProjectID, input.Title)
	if err != nil {
		writeError(w, databaseStatus(err), "task could not be created")
		return
	}
	writeJSON(w, http.StatusCreated, input)
}

func (s *server) createWorkLog(w http.ResponseWriter, r *http.Request) {
	var input workLogInput
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid work log")
		return
	}
	if input.ID == "" {
		input.ID = newID()
	}
	if input.IdempotencyKey == "" || input.PersonID == "" || input.ProjectID == "" || input.TaskID == "" || input.WorkDate == "" || input.Hours < 0 || input.CompletedShots < 0 || input.ComplexityWeight <= 0 {
		writeError(w, http.StatusBadRequest, "invalid work log values")
		return
	}
	_, err := s.db.Exec(r.Context(), `INSERT INTO work_logs
		(id, idempotency_key, person_id, production_id, task_id, work_date, hours, completed_shots, complexity_weight)
		VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)`,
		input.ID, input.IdempotencyKey, input.PersonID, input.ProjectID, input.TaskID, input.WorkDate, input.Hours, input.CompletedShots, input.ComplexityWeight)
	if err != nil {
		writeError(w, databaseStatus(err), "work log could not be created")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": input.ID})
}

func ratio(capacity, hours float64) float64 {
	if hours == 0 {
		return 0
	}
	return capacity / hours
}

func (s *server) dashboard(w http.ResponseWriter, r *http.Request) {
	var input dashboardInput
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid dashboard filters")
		return
	}
	const where = `($1 = '' OR wl.production_id = $1)
		AND ($2 = '' OR wl.person_id = $2)
		AND ($3 = '' OR wl.work_date >= NULLIF($3, '')::date)
		AND ($4 = '' OR wl.work_date <= NULLIF($4, '')::date)`
	var totalHours, effectiveCapacity float64
	err := s.db.QueryRow(r.Context(), `SELECT COALESCE(SUM(wl.hours), 0), COALESCE(SUM(wl.completed_shots * wl.complexity_weight), 0) FROM work_logs wl WHERE `+where,
		input.ProjectID, input.PersonID, input.DateFrom, input.DateTo).Scan(&totalHours, &effectiveCapacity)
	if err != nil {
		s.logger.Error("dashboard metrics failed", "error", err)
		writeError(w, http.StatusInternalServerError, "dashboard query failed")
		return
	}
	rows, err := s.db.Query(context.Background(), `SELECT p.id, p.name, SUM(wl.hours), SUM(wl.completed_shots * wl.complexity_weight)
		FROM work_logs wl JOIN people p ON p.id = wl.person_id WHERE `+where+` GROUP BY p.id, p.name ORDER BY p.name`,
		input.ProjectID, input.PersonID, input.DateFrom, input.DateTo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "person aggregation failed")
		return
	}
	defer rows.Close()
	byPerson := make([]map[string]any, 0)
	for rows.Next() {
		var id, name string
		var hours, capacity float64
		if err := rows.Scan(&id, &name, &hours, &capacity); err != nil {
			writeError(w, http.StatusInternalServerError, "person aggregation failed")
			return
		}
		byPerson = append(byPerson, map[string]any{"personId": id, "personName": name, "totalHours": hours, "effectiveCapacity": capacity, "capacityPerHour": ratio(capacity, hours)})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"metrics":  map[string]float64{"totalHours": totalHours, "effectiveCapacity": effectiveCapacity, "capacityPerHour": ratio(effectiveCapacity, totalHours)},
		"byPerson": byPerson,
	})
}
