// Package store — postgres.go is the concrete PostgreSQL implementation
// of all store interfaces. All raw SQL lives here, keeping handlers clean.
package store

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/jyothiswarup/taskflow/backend/internal/models"
)

// PostgresStore holds the DB connection pool and implements all store interfaces.
// In Go, a single struct can satisfy multiple interfaces — no explicit "implements" keyword.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new store with the given DB connection pool.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// ─── User Store ───────────────────────────────────────────────────────────────

// CreateUser inserts a new user row. The user struct is passed by pointer
// so we can write back the generated ID and created_at from the DB.
func (s *PostgresStore) CreateUser(user *models.User) error {
	query := `
		INSERT INTO users (name, email, password)
		VALUES ($1, $2, $3)
		RETURNING id, created_at`
	// QueryRow runs the query and expects exactly one result row
	return s.db.QueryRow(query, user.Name, user.Email, user.Password).
		Scan(&user.ID, &user.CreatedAt)
}

// GetUserByEmail looks up a user by email for login validation.
func (s *PostgresStore) GetUserByEmail(email string) (*models.User, error) {
	user := &models.User{}
	query := `SELECT id, name, email, password, created_at FROM users WHERE email = $1`
	err := s.db.QueryRow(query, email).
		Scan(&user.ID, &user.Name, &user.Email, &user.Password, &user.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil // not found → return nil, nil (caller decides what to do)
	}
	return user, err
}

// ListUsers returns all registered users (id, name, email only — no password).
// Used by the frontend to populate the assignee dropdown.
func (s *PostgresStore) ListUsers() ([]models.User, error) {
	query := `SELECT id, name, email, created_at FROM users ORDER BY name ASC`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// GetUserByID fetches a user by their UUID, used by JWT middleware.
func (s *PostgresStore) GetUserByID(id string) (*models.User, error) {
	user := &models.User{}
	query := `SELECT id, name, email, created_at FROM users WHERE id = $1`
	err := s.db.QueryRow(query, id).
		Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return user, err
}

// ─── Project Store ────────────────────────────────────────────────────────────

// CreateProject inserts a new project and writes back the generated ID/timestamp.
func (s *PostgresStore) CreateProject(project *models.Project) error {
	query := `
		INSERT INTO projects (name, description, owner_id)
		VALUES ($1, $2, $3)
		RETURNING id, created_at`
	return s.db.QueryRow(query, project.Name, project.Description, project.OwnerID).
		Scan(&project.ID, &project.CreatedAt)
}

// GetProjectsByUser returns projects with task counts for the dashboard cards.
func (s *PostgresStore) GetProjectsByUser(userID string) ([]models.ProjectSummary, error) {
	// Single query: get projects + count tasks by status using conditional aggregation
	query := `
		SELECT
			p.id, p.name, p.description, p.owner_id, p.created_at,
			COUNT(t.id)                                    AS task_count,
			COUNT(t.id) FILTER (WHERE t.status = 'done')  AS done_count,
			COUNT(t.id) FILTER (WHERE t.status != 'done') AS pending_count
		FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.owner_id = $1
		   OR p.id IN (SELECT DISTINCT project_id FROM tasks WHERE assignee_id = $1)
		GROUP BY p.id, p.name, p.description, p.owner_id, p.created_at
		ORDER BY p.created_at DESC`

	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []models.ProjectSummary
	for rows.Next() {
		var ps models.ProjectSummary
		if err := rows.Scan(
			&ps.ID, &ps.Name, &ps.Description, &ps.OwnerID, &ps.CreatedAt,
			&ps.TaskCount, &ps.DoneCount, &ps.PendingCount,
		); err != nil {
			return nil, err
		}
		summaries = append(summaries, ps)
	}
	return summaries, rows.Err()
}

// GetProjectByID fetches a single project row (no tasks).
func (s *PostgresStore) GetProjectByID(id string) (*models.Project, error) {
	p := &models.Project{}
	query := `SELECT id, name, description, owner_id, created_at FROM projects WHERE id = $1`
	err := s.db.QueryRow(query, id).
		Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return p, err
}

// GetProjectWithTasks fetches a project and all its tasks in one go.
func (s *PostgresStore) GetProjectWithTasks(id string) (*models.ProjectWithTasks, error) {
	p, err := s.GetProjectByID(id)
	if err != nil || p == nil {
		return nil, err
	}

	tasks, err := s.GetTasksByProject(id, nil, nil)
	if err != nil {
		return nil, err
	}

	return &models.ProjectWithTasks{Project: *p, Tasks: tasks}, nil
}

// UpdateProject applies partial updates (only fields present in the request).
func (s *PostgresStore) UpdateProject(id string, req *models.UpdateProjectRequest) (*models.Project, error) {
	// Build the SET clause dynamically — only update fields that were provided
	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, *req.Name)
		argIdx++
	}
	if req.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}

	if len(setClauses) == 0 {
		// Nothing to update — just return the current state
		return s.GetProjectByID(id)
	}

	args = append(args, id)
	query := fmt.Sprintf(
		"UPDATE projects SET %s WHERE id = $%d RETURNING id, name, description, owner_id, created_at",
		strings.Join(setClauses, ", "),
		argIdx,
	)

	p := &models.Project{}
	err := s.db.QueryRow(query, args...).
		Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return p, err
}

// DeleteProject removes a project (tasks cascade-delete via FK constraint).
func (s *PostgresStore) DeleteProject(id string) error {
	_, err := s.db.Exec("DELETE FROM projects WHERE id = $1", id)
	return err
}

// ─── Task Store ───────────────────────────────────────────────────────────────

// CreateTask inserts a new task and writes back the generated ID/timestamps.
func (s *PostgresStore) CreateTask(task *models.Task) error {
	query := `
		INSERT INTO tasks (title, description, status, priority, project_id, assignee_id, due_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at`

	// Convert *string assignee_id to sql.NullString for the nullable DB column
	var assigneeID sql.NullString
	if task.AssigneeID.Valid {
		assigneeID = task.AssigneeID
	}

	return s.db.QueryRow(
		query,
		task.Title, task.Description, task.Status, task.Priority,
		task.ProjectID, assigneeID, task.DueDate,
	).Scan(&task.ID, &task.CreatedAt, &task.UpdatedAt)
}

// GetTasksByProject fetches tasks for a project with optional filters.
func (s *PostgresStore) GetTasksByProject(projectID string, status, assigneeID *string) ([]models.Task, error) {
	// Build the WHERE clause dynamically based on which filters were passed
	conditions := []string{"project_id = $1"}
	args := []interface{}{projectID}
	argIdx := 2

	if status != nil && *status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *status)
		argIdx++
	}
	if assigneeID != nil && *assigneeID != "" {
		conditions = append(conditions, fmt.Sprintf("assignee_id = $%d", argIdx))
		args = append(args, *assigneeID)
		argIdx++
	}

	query := fmt.Sprintf(`
		SELECT id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at
		FROM tasks
		WHERE %s
		ORDER BY created_at DESC`,
		strings.Join(conditions, " AND "),
	)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []models.Task
	for rows.Next() {
		var t models.Task
		var dueDateStr sql.NullString
		if err := rows.Scan(
			&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.ProjectID, &t.AssigneeID, &dueDateStr, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if dueDateStr.Valid {
			t.DueDate = &dueDateStr.String
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// GetTaskByID fetches a single task by its ID.
func (s *PostgresStore) GetTaskByID(id string) (*models.Task, error) {
	t := &models.Task{}
	var dueDateStr sql.NullString
	query := `
		SELECT id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at
		FROM tasks WHERE id = $1`
	err := s.db.QueryRow(query, id).Scan(
		&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.ProjectID, &t.AssigneeID, &dueDateStr, &t.CreatedAt, &t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if dueDateStr.Valid {
		t.DueDate = &dueDateStr.String
	}
	return t, nil
}

// UpdateTask applies partial updates to a task.
func (s *PostgresStore) UpdateTask(id string, req *models.UpdateTaskRequest) (*models.Task, error) {
	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1

	if req.Title != nil {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", argIdx))
		args = append(args, *req.Title)
		argIdx++
	}
	if req.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *req.Status)
		argIdx++
	}
	if req.Priority != nil {
		setClauses = append(setClauses, fmt.Sprintf("priority = $%d", argIdx))
		args = append(args, *req.Priority)
		argIdx++
	}
	if req.AssigneeID != nil {
		setClauses = append(setClauses, fmt.Sprintf("assignee_id = $%d", argIdx))
		// Allow setting assignee_id to NULL by passing an empty string
		if *req.AssigneeID == "" {
			args = append(args, nil)
		} else {
			args = append(args, *req.AssigneeID)
		}
		argIdx++
	}
	if req.DueDate != nil {
		setClauses = append(setClauses, fmt.Sprintf("due_date = $%d", argIdx))
		if *req.DueDate == "" {
			args = append(args, nil)
		} else {
			args = append(args, *req.DueDate)
		}
		argIdx++
	}

	if len(setClauses) == 0 {
		return s.GetTaskByID(id)
	}

	// Always update the updated_at timestamp
	setClauses = append(setClauses, fmt.Sprintf("updated_at = $%d", argIdx))
	args = append(args, time.Now())
	argIdx++

	args = append(args, id)
	query := fmt.Sprintf(
		`UPDATE tasks SET %s WHERE id = $%d
		 RETURNING id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at`,
		strings.Join(setClauses, ", "),
		argIdx,
	)

	t := &models.Task{}
	var dueDateStr sql.NullString
	err := s.db.QueryRow(query, args...).Scan(
		&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.ProjectID, &t.AssigneeID, &dueDateStr, &t.CreatedAt, &t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if dueDateStr.Valid {
		t.DueDate = &dueDateStr.String
	}
	return t, nil
}

// DeleteTask removes a task by its ID.
func (s *PostgresStore) DeleteTask(id string) error {
	_, err := s.db.Exec("DELETE FROM tasks WHERE id = $1", id)
	return err
}

// GetProjectStats returns task count by status and by assignee for a project.
func (s *PostgresStore) GetProjectStats(projectID string) (map[string]interface{}, error) {
	// Count tasks grouped by status
	statusQuery := `
		SELECT status, COUNT(*) as count
		FROM tasks WHERE project_id = $1
		GROUP BY status`

	rows, err := s.db.Query(statusQuery, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	statusCounts := map[string]int{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		statusCounts[status] = count
	}

	// Count tasks grouped by assignee name
	assigneeQuery := `
		SELECT COALESCE(u.name, 'Unassigned') as assignee, COUNT(*) as count
		FROM tasks t
		LEFT JOIN users u ON u.id = t.assignee_id
		WHERE t.project_id = $1
		GROUP BY u.name`

	rows2, err := s.db.Query(assigneeQuery, projectID)
	if err != nil {
		return nil, err
	}
	defer rows2.Close()

	assigneeCounts := map[string]int{}
	for rows2.Next() {
		var assignee string
		var count int
		if err := rows2.Scan(&assignee, &count); err != nil {
			return nil, err
		}
		assigneeCounts[assignee] = count
	}

	return map[string]interface{}{
		"by_status":   statusCounts,
		"by_assignee": assigneeCounts,
	}, nil
}
