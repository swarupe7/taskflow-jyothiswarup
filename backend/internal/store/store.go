// Package store defines the interfaces for all database operations.
// Using interfaces here (Go's version of dependency injection) means:
// - Handlers depend on the interface, not the concrete DB implementation
// - Easy to swap out or mock in tests
// This is idiomatic Go: "accept interfaces, return structs"
package store

import "github.com/jyothiswarup/taskflow/backend/internal/models"

// UserStore defines all user-related DB operations.
type UserStore interface {
	CreateUser(user *models.User) error
	GetUserByEmail(email string) (*models.User, error)
	GetUserByID(id string) (*models.User, error)
	// ListUsers returns all users — used to populate the assignee dropdown in the UI
	ListUsers() ([]models.User, error)
}

// ProjectStore defines all project-related DB operations.
type ProjectStore interface {
	CreateProject(project *models.Project) error
	// GetProjectsByUser returns projects with task counts for the dashboard cards
	GetProjectsByUser(userID string) ([]models.ProjectSummary, error)
	GetProjectByID(id string) (*models.Project, error)
	GetProjectWithTasks(id string) (*models.ProjectWithTasks, error)
	UpdateProject(id string, req *models.UpdateProjectRequest) (*models.Project, error)
	DeleteProject(id string) error
}

// TaskStore defines all task-related DB operations.
type TaskStore interface {
	CreateTask(task *models.Task) error
	GetTasksByProject(projectID string, status, assigneeID *string) ([]models.Task, error)
	GetTaskByID(id string) (*models.Task, error)
	UpdateTask(id string, req *models.UpdateTaskRequest) (*models.Task, error)
	DeleteTask(id string) error
	// GetProjectStats returns task counts grouped by status and assignee
	GetProjectStats(projectID string) (map[string]interface{}, error)
}
