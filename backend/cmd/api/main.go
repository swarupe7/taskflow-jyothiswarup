// main.go is the entry point — like server.js in Node.
// The "main" package is special in Go: it's the package that gets compiled into an executable.
// All other packages (handlers, store, etc.) are libraries used by main.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq" // blank import: registers the "postgres" driver with database/sql

	"github.com/jyothiswarup/taskflow/backend/internal/handlers"
	appMiddleware "github.com/jyothiswarup/taskflow/backend/internal/middleware"
	"github.com/jyothiswarup/taskflow/backend/internal/store"
)

func main() {
	// ─── Load environment variables ──────────────────────────────────────────
	// Go lesson: unlike Node.js where `require('dotenv').config()` is common,
	// Go has no built-in .env loading. We use godotenv — same concept.
	//
	// APP_ENV controls behaviour:
	//   APP_ENV=local  → load .env file automatically (local dev, no Docker needed)
	//   anything else  → rely on real env vars (Docker/production sets them directly)
	//
	// This means locally you only need: APP_ENV=local go run ./cmd/api
	// Everything else is read from your .env file automatically.
	loadEnv()

	// ─── Structured logging setup ─────────────────────────────────────────────
	// slog is built into Go 1.21+. In Node you'd use winston or pino.
	// Text format is friendlier for local dev; JSON is better for production log aggregators.
	var logHandler slog.Handler
	if os.Getenv("APP_ENV") == "local" {
		// Human-readable output for local development
		logHandler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	} else {
		// Machine-readable JSON for production (Docker / cloud)
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	}
	slog.SetDefault(slog.New(logHandler))

	slog.Info("starting TaskFlow API", "port", os.Getenv("PORT"), "env", os.Getenv("APP_ENV"))

	// ─── Read required environment variables ─────────────────────────────────
	// Go lesson: os.Getenv returns "" if not set — no process.env.VAR with optional chaining.
	// We validate required vars upfront so the app fails loudly at startup, not mid-request.
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required — check your .env file or environment")
		os.Exit(1)
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		slog.Error("JWT_SECRET is required — check your .env file or environment")
		os.Exit(1)
	}

	// ─── Database connection ──────────────────────────────────────────────────
	// sql.Open doesn't actually connect — it just registers the driver config.
	// db.Ping() (inside openDB) verifies the connection is actually alive.
	db, err := openDB(dbURL)
	if err != nil {
		slog.Error("failed to connect to database", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	slog.Info("database connection established")

	// ─── Run migrations ───────────────────────────────────────────────────────
	// Migrations run automatically on every startup.
	// golang-migrate tracks which have run in the schema_migrations table
	// and only applies new ones — it's idempotent (safe to run repeatedly).
	if err := runMigrations(db); err != nil {
		slog.Error("failed to run migrations", "err", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")

	// ─── Wire up stores (dependency injection) ────────────────────────────────
	// PostgresStore satisfies UserStore, ProjectStore, and TaskStore interfaces.
	// Handlers receive the interface type — not the concrete struct.
	pgStore := store.NewPostgresStore(db)

	// ─── Wire up handlers ─────────────────────────────────────────────────────
	authHandler := handlers.NewAuthHandler(pgStore)
	projectHandler := handlers.NewProjectHandler(pgStore)
	taskHandler := handlers.NewTaskHandler(pgStore, pgStore)
	userHandler := handlers.NewUserHandler(pgStore)

	// ─── Router setup ─────────────────────────────────────────────────────────
	// chi is like Express Router. Middleware is chained with r.Use().
	r := chi.NewRouter()

	r.Use(chiMiddleware.RequestID)
	r.Use(chiMiddleware.RealIP)
	r.Use(chiMiddleware.Recoverer)
	r.Use(chiMiddleware.Logger)

	// CORS: allow the React dev server and the nginx-served frontend
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// All routes are mounted under /api so the Vite proxy (and nginx) can distinguish
	// API calls from React Router paths — e.g. /api/projects vs /projects (UI page).
	r.Route("/api", func(r chi.Router) {

		// ─── Public routes (no auth required) ────────────────────────────
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/login", authHandler.Login)

		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))
		})

		// ─── Protected routes (JWT required) ──────────────────────────────
		r.Group(func(r chi.Router) {
			r.Use(appMiddleware.RequireAuth)

			// Users — for assignee dropdown
			r.Get("/users", userHandler.List)

			// Projects
			r.Get("/projects", projectHandler.List)
			r.Post("/projects", projectHandler.Create)
			r.Get("/projects/{id}", projectHandler.GetByID)
			r.Patch("/projects/{id}", projectHandler.Update)
			r.Delete("/projects/{id}", projectHandler.Delete)
			r.Get("/projects/{id}/stats", projectHandler.GetStats)

			// Tasks nested under projects
			r.Get("/projects/{id}/tasks", taskHandler.ListByProject)
			r.Post("/projects/{id}/tasks", taskHandler.Create)

			// Tasks accessed directly (update / delete)
			r.Patch("/tasks/{id}", taskHandler.Update)
			r.Delete("/tasks/{id}", taskHandler.Delete)
		})
	})

	// ─── HTTP server with graceful shutdown ───────────────────────────────────
	// Go lesson: graceful shutdown is built into net/http via server.Shutdown(ctx).
	// We use OS signal channels to wait for SIGTERM/SIGINT (Ctrl+C or docker stop).
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start the server in a goroutine so it doesn't block the shutdown logic below.
	// Go lesson: "go func()" launches a goroutine — lightweight concurrent execution.
	go func() {
		slog.Info("server listening", "port", port, "url", "http://localhost:"+port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	// Block here until SIGTERM or SIGINT (Ctrl+C)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	slog.Info("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("forced shutdown", "err", err)
	}
	slog.Info("server stopped")
}

// loadEnv tries to load a .env file automatically — just like Node's require('dotenv').config().
//
// Key behaviour (same as Node dotenv):
//   - If a var is ALREADY set in the shell/Docker, godotenv will NOT override it.
//   - If no .env file is found, it silently continues (prod/Docker sets vars directly).
//
// Search order: looks in the current directory first, then walks up the tree.
// This means it works whether you run from backend/ or backend/cmd/api/.
func loadEnv() {
	candidates := []string{
		".env",          // running from backend/  ← most common case
		"../../.env",    // running from backend/cmd/api/
		"../.env",       // one level up
		"../../../.env", // three levels up (edge case)
	}

	// Also check next to the compiled binary (for `go build` + run scenarios)
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates,
			filepath.Join(filepath.Dir(exe), ".env"),
			filepath.Join(filepath.Dir(exe), "../.env"),
		)
	}

	for _, path := range candidates {
		if _, statErr := os.Stat(path); statErr == nil {
			// Found a .env file — load it (won't override vars already in environment)
			if err := godotenv.Load(path); err == nil {
				// Use fmt here because slog isn't set up yet at this point
				fmt.Printf("loaded .env from: %s\n", path)
				return
			}
		}
	}

	// No .env found — that's fine in Docker/prod where vars come from the environment
	fmt.Println("no .env file found — relying on environment variables")
}

// openDB creates and validates a PostgreSQL connection pool with retry logic.
func openDB(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Retry loop handles Docker startup ordering (API might start before Postgres is ready)
	for i := 0; i < 10; i++ {
		if err = db.Ping(); err == nil {
			return db, nil
		}
		slog.Warn("waiting for database...", "attempt", i+1, "err", err)
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("could not connect to database after retries: %w", err)
}

// runMigrations applies all pending up migrations using golang-migrate.
func runMigrations(db *sql.DB) error {
	driver, err := postgres.WithInstance(db, &postgres.Config{})
	if err != nil {
		return fmt.Errorf("creating migration driver: %w", err)
	}

	// MIGRATIONS_PATH controls where migration files are read from.
	//   Docker:  /migrations  (files are COPYed into the container by Dockerfile)
	//   Local:   file://migrations  (relative to where `go run` is executed)
	migrationsPath := os.Getenv("MIGRATIONS_PATH")
	if migrationsPath == "" {
		migrationsPath = "file:///migrations" // Docker default
	}

	m, err := migrate.NewWithDatabaseInstance(migrationsPath, "postgres", driver)
	if err != nil {
		return fmt.Errorf("creating migrator (path=%s): %w", migrationsPath, err)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("running migrations: %w", err)
	}
	return nil
}
