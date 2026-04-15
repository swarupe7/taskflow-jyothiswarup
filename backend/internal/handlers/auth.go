package handlers

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/jyothiswarup/taskflow/backend/internal/auth"
	"github.com/jyothiswarup/taskflow/backend/internal/models"
	"github.com/jyothiswarup/taskflow/backend/internal/store"
)

// AuthHandler holds the dependencies needed by auth route handlers.
// Go lesson: this is the standard "handler struct" pattern — like a class in Node/Express
// where you inject dependencies via the constructor. Here, UserStore is an interface,
// so we're not tied to any specific DB implementation.
type AuthHandler struct {
	users store.UserStore
}

// NewAuthHandler creates an AuthHandler with the given user store.
func NewAuthHandler(users store.UserStore) *AuthHandler {
	return &AuthHandler{users: users}
}

// Register handles POST /auth/register
// Go lesson: methods on structs use receiver syntax: func (h *AuthHandler) Register(...)
// This is Go's version of a class method.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// Validate required fields — collect all errors at once for a better UX
	fields := map[string]string{}
	if strings.TrimSpace(req.Name) == "" {
		fields["name"] = "is required"
	}
	if strings.TrimSpace(req.Email) == "" {
		fields["email"] = "is required"
	}
	if len(req.Password) < 8 {
		fields["password"] = "must be at least 8 characters"
	}
	if len(fields) > 0 {
		writeValidationError(w, fields)
		return
	}

	// Check if email is already in use
	existing, err := h.users.GetUserByEmail(req.Email)
	if err != nil {
		slog.Error("register: db error checking email", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if existing != nil {
		writeValidationError(w, map[string]string{"email": "already in use"})
		return
	}

	// Hash the password before storing — plaintext passwords are an automatic disqualifier
	hashed, err := auth.HashPassword(req.Password)
	if err != nil {
		slog.Error("register: bcrypt error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	user := &models.User{
		Name:     strings.TrimSpace(req.Name),
		Email:    strings.ToLower(strings.TrimSpace(req.Email)),
		Password: hashed,
	}

	if err := h.users.CreateUser(user); err != nil {
		slog.Error("register: db error creating user", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Generate a 24-hour JWT
	token, err := auth.GenerateToken(user.ID, user.Email)
	if err != nil {
		slog.Error("register: jwt error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	slog.Info("user registered", "user_id", user.ID, "email", user.Email)
	writeJSON(w, http.StatusCreated, models.AuthResponse{Token: token, User: *user})
}

// Login handles POST /auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// Validate required fields
	fields := map[string]string{}
	if strings.TrimSpace(req.Email) == "" {
		fields["email"] = "is required"
	}
	if req.Password == "" {
		fields["password"] = "is required"
	}
	if len(fields) > 0 {
		writeValidationError(w, fields)
		return
	}

	// Look up user by email
	user, err := h.users.GetUserByEmail(strings.ToLower(strings.TrimSpace(req.Email)))
	if err != nil {
		slog.Error("login: db error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Always return the same error for both "user not found" and "wrong password"
	// to avoid email enumeration attacks
	if user == nil || auth.CheckPassword(req.Password, user.Password) != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := auth.GenerateToken(user.ID, user.Email)
	if err != nil {
		slog.Error("login: jwt error", "err", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	slog.Info("user logged in", "user_id", user.ID)
	writeJSON(w, http.StatusOK, models.AuthResponse{Token: token, User: *user})
}
