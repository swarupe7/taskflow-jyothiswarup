-- Seed data — runs after 000001_init.up.sql so all tables already exist.
-- Password for all seed users: password123 (bcrypt cost 12)

INSERT INTO users (id, name, email, password, created_at)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Test User',
    'test@example.com',
    '$2a$12$ChcU3YaZsprV/BwF2PS6bO5Sc.4mntcgUiBECR8IwKwPfZDwPcpnu',
    NOW()
) ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, name, email, password, created_at)
VALUES (
    'a0000000-0000-0000-0000-000000000002',
    'Jane Doe',
    'jane@example.com',
    '$2a$12$ChcU3YaZsprV/BwF2PS6bO5Sc.4mntcgUiBECR8IwKwPfZDwPcpnu',
    NOW()
) ON CONFLICT (email) DO NOTHING;

INSERT INTO projects (id, name, description, owner_id, created_at)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'Website Redesign',
    'Q2 project to redesign the company website with a modern look',
    'a0000000-0000-0000-0000-000000000001',
    NOW()
) ON CONFLICT DO NOTHING;

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
