// Package models defines the core data structures (structs) shared across
// the application. In Go, structs are the equivalent of JS objects with a
// defined shape — similar to TypeScript interfaces but with actual types.
package models

import (
	"database/sql"
	"time"
)

// User represents a registered account in the system.
// The `json:"..."` struct tags control how fields are serialized to JSON —
// this is Go's built-in equivalent of manually mapping field names.
type User struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Password  string    `json:"-"` // "-" means: never include in JSON responses
	CreatedAt time.Time `json:"created_at"`
}

// Project represents a container for tasks, owned by a user.
type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"` // pointer = nullable (can be nil)
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
}

// ProjectSummary is returned by GET /projects — includes task counts for the dashboard cards.
type ProjectSummary struct {
	Project
	TaskCount     int `json:"task_count"`
	DoneCount     int `json:"done_count"`
	PendingCount  int `json:"pending_count"`
}

// ProjectWithTasks is returned by GET /projects/:id — includes nested tasks.
type ProjectWithTasks struct {
	Project
	Tasks []Task `json:"tasks"`
}

// Task represents a unit of work within a project.
type Task struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	Description *string        `json:"description"`
	Status      string         `json:"status"`   // "todo" | "in_progress" | "done"
	Priority    string         `json:"priority"` // "low" | "medium" | "high"
	ProjectID   string         `json:"project_id"`
	AssigneeID  sql.NullString `json:"assignee_id"` // nullable UUID
	DueDate     *string        `json:"due_date"`    // nullable date string "YYYY-MM-DD"
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// --- Request/Response DTOs (Data Transfer Objects) ---
// These are the shapes of incoming JSON request bodies.

// RegisterRequest is the body for POST /auth/register.
type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginRequest is the body for POST /auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse is returned after successful register or login.
type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// CreateProjectRequest is the body for POST /projects.
type CreateProjectRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

// UpdateProjectRequest is the body for PATCH /projects/:id.
type UpdateProjectRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

// CreateTaskRequest is the body for POST /projects/:id/tasks.
type CreateTaskRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Priority    string  `json:"priority"`
	AssigneeID  *string `json:"assignee_id"`
	DueDate     *string `json:"due_date"`
}

// UpdateTaskRequest is the body for PATCH /tasks/:id.
// All fields are pointers so we can distinguish "not provided" from "set to empty".
type UpdateTaskRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	Priority    *string `json:"priority"`
	AssigneeID  *string `json:"assignee_id"`
	DueDate     *string `json:"due_date"`
}

// ErrorResponse is the standard error body: {"error": "...", "fields": {...}}
type ErrorResponse struct {
	Error  string            `json:"error"`
	Fields map[string]string `json:"fields,omitempty"` // omitempty = skip if nil/empty
}
