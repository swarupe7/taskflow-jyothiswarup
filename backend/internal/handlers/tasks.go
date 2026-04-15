package handlers

import (
	"database/sql"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jyothiswarup/taskflow/backend/internal/middleware"
	"github.com/jyothiswarup/taskflow/backend/internal/models"
	"github.com/jyothiswarup/taskflow/backend/internal/store"
)

// TaskHandler handles all /tasks and /projects/:id/tasks routes.
type TaskHandler struct {
	tasks    store.TaskStore
	projects store.ProjectStore
}

// NewTaskHandler creates a TaskHandler with task and project stores.
// We need the project store to verify project membership/ownership.
func NewTaskHandler(tasks store.TaskStore, projects store.ProjectStore) *TaskHandler {
	return &TaskHandler{tasks: tasks, projects: projects}
}

// ListByProject handles GET /projects/:id/tasks
// Supports ?status= and ?assignee= query filters.
func (h *TaskHandler) ListByProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")

	// Verify the project exists before listing tasks
	project, err := h.projects.GetProjectByID(projectID)
	if err != nil {
		slog.Error("tasks.list: db error fetching project", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if project == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// Read optional query parameters — r.URL.Query().Get returns "" if missing
	status := r.URL.Query().Get("status")
	assigneeID := r.URL.Query().Get("assignee")

	var statusPtr, assigneePtr *string
	if status != "" {
		statusPtr = &status
	}
	if assigneeID != "" {
		assigneePtr = &assigneeID
	}

	tasks, err := h.tasks.GetTasksByProject(projectID, statusPtr, assigneePtr)
	if err != nil {
		slog.Error("tasks.list: db error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if tasks == nil {
		tasks = []models.Task{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"tasks": tasks})
}

// Create handles POST /projects/:id/tasks
func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r)

	// Verify the project exists
	project, err := h.projects.GetProjectByID(projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if project == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// Only project owner or members with access can add tasks
	// For simplicity, any authenticated user can add tasks to any project they can see
	_ = userID // kept for future role-based access control

	var req models.CreateTaskRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		writeValidationError(w, map[string]string{"title": "is required"})
		return
	}

	// Validate status and priority enums
	priority := req.Priority
	if priority == "" {
		priority = "medium" // sensible default
	}
	validPriorities := map[string]bool{"low": true, "medium": true, "high": true}
	if !validPriorities[priority] {
		writeValidationError(w, map[string]string{"priority": "must be low, medium, or high"})
		return
	}

	task := &models.Task{
		Title:       strings.TrimSpace(req.Title),
		Description: req.Description,
		Status:      "todo", // new tasks always start as todo
		Priority:    priority,
		ProjectID:   projectID,
		DueDate:     req.DueDate,
	}

	// Convert optional assignee_id string to sql.NullString
	if req.AssigneeID != nil && *req.AssigneeID != "" {
		task.AssigneeID = sql.NullString{String: *req.AssigneeID, Valid: true}
	}

	if err := h.tasks.CreateTask(task); err != nil {
		slog.Error("tasks.create: db error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	slog.Info("task created", "task_id", task.ID, "project_id", projectID)
	writeJSON(w, http.StatusCreated, task)
}

// Update handles PATCH /tasks/:id
// Supports partial updates — only fields present in the body are modified.
func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	task, err := h.tasks.GetTaskByID(id)
	if err != nil {
		slog.Error("tasks.update: db error fetching task", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	var req models.UpdateTaskRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// Validate status enum if provided
	if req.Status != nil {
		validStatuses := map[string]bool{"todo": true, "in_progress": true, "done": true}
		if !validStatuses[*req.Status] {
			writeValidationError(w, map[string]string{"status": "must be todo, in_progress, or done"})
			return
		}
	}

	// Validate priority enum if provided
	if req.Priority != nil {
		validPriorities := map[string]bool{"low": true, "medium": true, "high": true}
		if !validPriorities[*req.Priority] {
			writeValidationError(w, map[string]string{"priority": "must be low, medium, or high"})
			return
		}
	}

	updated, err := h.tasks.UpdateTask(id, &req)
	if err != nil {
		slog.Error("tasks.update: db error updating task", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

// Delete handles DELETE /tasks/:id
// Only the project owner or task creator can delete.
func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r)

	task, err := h.tasks.GetTaskByID(id)
	if err != nil {
		slog.Error("tasks.delete: db error fetching task", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// Fetch the parent project to check if user is the project owner
	project, err := h.projects.GetProjectByID(task.ProjectID)
	if err != nil || project == nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Only project owner can delete tasks (per spec: "project owner or task creator")
	// Since we don't store creator_id on tasks, we use owner check
	if project.OwnerID != userID {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := h.tasks.DeleteTask(id); err != nil {
		slog.Error("tasks.delete: db error deleting task", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
