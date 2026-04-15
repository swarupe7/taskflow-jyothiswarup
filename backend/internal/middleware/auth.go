// Package middleware provides HTTP middleware for the chi router.
// Go lesson: middleware is just a function that wraps an http.Handler.
// It's the same pattern as Express middleware: (req, res, next) => ...
// In Go it looks like: func(next http.Handler) http.Handler { ... }
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/jyothiswarup/taskflow/backend/internal/auth"
)

// contextKey is a custom type for context keys to avoid collisions.
// Go lesson: using a custom type (not just a string) for context keys is
// idiomatic — it prevents different packages from accidentally overwriting each other's values.
type contextKey string

const (
	// UserIDKey is the key used to store/retrieve the authenticated user's ID from context
	UserIDKey contextKey = "userID"
	// UserEmailKey stores the user's email in context
	UserEmailKey contextKey = "userEmail"
)

// RequireAuth is a middleware that validates the JWT Bearer token.
// Protected routes are wrapped with this middleware in the router setup.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract the Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeUnauthorized(w, "missing authorization header")
			return
		}

		// Expect the format "Bearer <token>"
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			writeUnauthorized(w, "invalid authorization header format")
			return
		}

		tokenStr := parts[1]
		claims, err := auth.ValidateToken(tokenStr)
		if err != nil {
			writeUnauthorized(w, "invalid or expired token")
			return
		}

		// Store the user ID and email in the request context so handlers can read it
		// This is Go's equivalent of Express's res.locals
		ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
		ctx = context.WithValue(ctx, UserEmailKey, claims.Email)

		// Call the next handler in the chain with the enriched context
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserID extracts the authenticated user's ID from the request context.
// Returns empty string if not present (shouldn't happen on protected routes).
func GetUserID(r *http.Request) string {
	id, _ := r.Context().Value(UserIDKey).(string)
	return id
}

// writeUnauthorized sends a 401 JSON response.
func writeUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"error":"unauthorized"}`))
}
