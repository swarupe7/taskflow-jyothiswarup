// Package handlers contains HTTP handler functions.
// Each handler function has the signature: func(w http.ResponseWriter, r *http.Request)
// This is Go's equivalent of Express route handlers: (req, res) => { ... }
package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jyothiswarup/taskflow/backend/internal/models"
)

// writeJSON serializes any value to JSON and writes it with the given status code.
// This helper keeps all handlers DRY — one place for Content-Type and encoding.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError sends the standard error response body.
// 400 errors include a "fields" map; other errors just have "error".
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, models.ErrorResponse{Error: message})
}

// writeValidationError sends a 400 with field-level error details.
func writeValidationError(w http.ResponseWriter, fields map[string]string) {
	writeJSON(w, http.StatusBadRequest, models.ErrorResponse{
		Error:  "validation failed",
		Fields: fields,
	})
}

// decodeJSON parses the request body into the target struct.
// Returns false and writes a 400 if parsing fails.
func decodeJSON(w http.ResponseWriter, r *http.Request, target interface{}) bool {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}
