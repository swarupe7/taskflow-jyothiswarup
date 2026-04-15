package handlers

import (
	"log/slog"
	"net/http"

	"github.com/jyothiswarup/taskflow/backend/internal/models"
	"github.com/jyothiswarup/taskflow/backend/internal/store"
)

// UserHandler handles user-related endpoints.
type UserHandler struct {
	users store.UserStore
}

// NewUserHandler creates a UserHandler with the given user store.
func NewUserHandler(users store.UserStore) *UserHandler {
	return &UserHandler{users: users}
}

// List handles GET /users
// Returns all users (id + name + email) so the frontend can build an assignee dropdown.
// Password is never included — the User model has json:"-" on the password field.
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.users.ListUsers()
	if err != nil {
		slog.Error("users.list: db error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Return an empty array rather than null when there are no users
	if users == nil {
		users = []models.User{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"users": users})
}
