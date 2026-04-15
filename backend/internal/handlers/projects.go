package handlers

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jyothiswarup/taskflow/backend/internal/middleware"
	"github.com/jyothiswarup/taskflow/backend/internal/models"
	"github.com/jyothiswarup/taskflow/backend/internal/store"
)

// ProjectHandler handles all /projects routes.
type ProjectHandler struct {
	projects store.ProjectStore
}

// NewProjectHandler creates a ProjectHandler with the given project store.
func NewProjectHandler(projects store.ProjectStore) *ProjectHandler {
	return &ProjectHandler{projects: projects}
}

// List handles GET /projects
// Returns all projects the current user owns or has tasks assigned to them in.
func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	projects, err := h.projects.GetProjectsByUser(userID)
	if err != nil {
		slog.Error("projects.list: db error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Return an empty array instead of null when there are no projects
	if projects == nil {
		projects = []models.ProjectSummary{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"projects": projects})
}

// Create handles POST /projects
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	var req models.CreateProjectRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		writeValidationError(w, map[string]string{"name": "is required"})
		return
	}

	project := &models.Project{
		Name:        strings.TrimSpace(req.Name),
		Description: req.Description,
		OwnerID:     userID,
	}

	if err := h.projects.CreateProject(project); err != nil {
		slog.Error("projects.create: db error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	slog.Info("project created", "project_id", project.ID, "owner_id", userID)
	writeJSON(w, http.StatusCreated, project)
}

// GetByID handles GET /projects/:id
// Returns the project with all its tasks.
func (h *ProjectHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	// chi.URLParam extracts path parameters — equivalent to req.params.id in Express
	id := chi.URLParam(r, "id")

	project, err := h.projects.GetProjectWithTasks(id)
	if err != nil {
		slog.Error("projects.getById: db error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if project == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// Ensure tasks array is never null in the response
	if project.Tasks == nil {
		project.Tasks = []models.Task{}
	}

	writeJSON(w, http.StatusOK, project)
}

// Update handles PATCH /projects/:id (owner only)
func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r)

	// Fetch the project to check ownership before modifying
	existing, err := h.projects.GetProjectByID(id)
	if err != nil {
		slog.Error("projects.update: db error fetching project", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// 403 Forbidden (not 404) — the resource exists but the user can't modify it.
	// The spec explicitly calls out the 401 vs 403 distinction.
	if existing.OwnerID != userID {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	var req models.UpdateProjectRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	updated, err := h.projects.UpdateProject(id, &req)
	if err != nil {
		slog.Error("projects.update: db error updating project", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

// Delete handles DELETE /projects/:id (owner only)
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.GetUserID(r)

	existing, err := h.projects.GetProjectByID(id)
	if err != nil {
		slog.Error("projects.delete: db error fetching project", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if existing.OwnerID != userID {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := h.projects.DeleteProject(id); err != nil {
		slog.Error("projects.delete: db error deleting project", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// 204 No Content: successful deletion with no response body
	w.WriteHeader(http.StatusNoContent)
}

// GetStats handles GET /projects/:id/stats (bonus endpoint)
func (h *ProjectHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	project, err := h.projects.GetProjectByID(id)
	if err != nil || project == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	// Use a type assertion to access GetProjectStats — the ProjectHandler only
	// holds a ProjectStore interface, so we need to check if it also implements TaskStore
	type statsGetter interface {
		GetProjectStats(projectID string) (map[string]interface{}, error)
	}
	if sg, ok := h.projects.(statsGetter); ok {
		stats, err := sg.GetProjectStats(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		writeJSON(w, http.StatusOK, stats)
	} else {
		writeError(w, http.StatusNotImplemented, "stats not available")
	}
}
