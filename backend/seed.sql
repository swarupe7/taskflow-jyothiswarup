-- Seed data for TaskFlow
-- Test user password is: password123
-- Hash generated with bcrypt cost 12

-- Insert a test user with a known password
INSERT INTO users (id, name, email, password, created_at)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Test User',
    'test@example.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY3bHBxBXqCkPaG',
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Insert a second user for assignee testing
INSERT INTO users (id, name, email, password, created_at)
VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'Jane Doe',
    'jane@example.com',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY3bHBxBXqCkPaG',
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Insert a sample project owned by the test user
INSERT INTO projects (id, name, description, owner_id, created_at)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'Website Redesign',
    'Q2 project to redesign the company website with a modern look',
    'a0000000-0000-0000-0000-000000000001',
    NOW()
) ON CONFLICT DO NOTHING;

-- Insert three tasks with different statuses
INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at)
VALUES
    (
        'c0000000-0000-0000-0000-000000000001',
        'Design new homepage layout',
        'Create wireframes and high-fidelity mockups for the homepage',
        'done',
        'high',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001',
        '2026-04-10',
        NOW(),
        NOW()
    ),
    (
        'c0000000-0000-0000-0000-000000000002',
        'Implement responsive navigation',
        'Build the mobile-first navigation component with hamburger menu',
        'in_progress',
        'medium',
        'b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000002',
        '2026-04-20',
        NOW(),
        NOW()
    ),
    (
        'c0000000-0000-0000-0000-000000000003',
        'Write content for About page',
        'Draft and review all text content for the new About page',
        'todo',
        'low',
        'b0000000-0000-0000-0000-000000000001',
        NULL,
        '2026-04-30',
        NOW(),
        NOW()
    )
ON CONFLICT DO NOTHING;
