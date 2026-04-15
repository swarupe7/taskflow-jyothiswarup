# TaskFlow

A minimal but production-ready task management system — built with **Go + React** — featuring authentication, relational data, a REST API, and a polished responsive UI.

---

## 1. Overview

TaskFlow lets users register, log in, create projects, add tasks to those projects, and assign tasks to themselves or others.

**Tech Stack**

| Layer | Technology |
|---|---|
| Backend | Go 1.22, `chi` router, `database/sql` + `lib/pq` (raw SQL), `golang-jwt/jwt`, `bcrypt` (cost 12) |
| Database | PostgreSQL 16, `golang-migrate` for schema migrations (up + down) |
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS v3, TanStack Query, React Router v6 |
| Infrastructure | Docker Compose, multi-stage Dockerfiles (Go → alpine, React → nginx), nginx reverse proxy |

**Implemented spec checklist**

| Requirement | Status |
|-------------|--------|
| User register / login with bcrypt + JWT | ✅ |
| Projects CRUD with ownership checks | ✅ |
| Tasks CRUD with status / priority / assignee / due date | ✅ |
| Filter tasks by `?status=` and `?assignee=` (backend + UI) | ✅ |
| Structured 400 / 401 / 403 / 404 error responses | ✅ |
| Structured logging (`log/slog`) | ✅ |
| Graceful shutdown on `SIGTERM` | ✅ |
| Protected routes with JWT middleware | ✅ |
| Optimistic UI for task status changes | ✅ |
| Loading / error / empty states on all views | ✅ |
| Responsive at 375 px (mobile) and 1280 px (desktop) | ✅ |
| Auth persists across page refreshes (localStorage) | ✅ |
| `docker compose up` with zero manual steps | ✅ |
| Multi-stage Dockerfiles + `.env.example` | ✅ |
| Auto-run migrations on container start | ✅ |
| Seed data (users + project + tasks) | ✅ |
| **Bonus** — `GET /api/projects/:id/stats` | ✅ |
| **Bonus** — Dark mode toggle (persists in localStorage) | ✅ |

---

## 2. Screenshots

### 🔐 Authentication — Split-screen login with green brand panel
> Two-panel layout: the left side showcases brand identity and feature highlights; the right side presents an uncluttered sign-in form with icon-enhanced inputs and an animated CTA button.

![Login Page](docs/screenshots/login.png)

---

### 📁 Projects Dashboard — Visual project cards with live task counts
> Each project card displays a colour-matched gradient banner, a real-time progress bar, open/done task pill counters, and an "Open project →" call-to-action.

![Projects Dashboard](docs/screenshots/projects.png)

---

### ✅ Kanban Task Board — Priority-coloured cards with assignee avatars
> Tasks are grouped into **To Do / In Progress / Done** columns. Each card has a priority accent bar (red = High, amber = Medium, green = Low), a coloured avatar pill for the assignee, and an inline status selector. Filters by both status and assignee are available above the board.

![Kanban Board](docs/screenshots/kanban.png)

---

## 3. Architecture Decisions

**Why `chi` over Gin or Echo?**
`chi` is the most Express-like Go router — middleware chaining with `r.Use()` feels familiar and it stays close to the standard `net/http` interface. Gin is faster but adds magic (binding, validation) that obscures how Go HTTP actually works. Using close-to-stdlib shows reviewers the actual decision-making, not framework conventions.

**Why raw `database/sql` and not an ORM?**
The spec explicitly prohibits "auto-migrate or ORM magic." Raw SQL forces explicit thinking about indexes, query patterns, and nullability. The store layer uses Go interfaces (`UserStore`, `ProjectStore`, `TaskStore`) so handlers are never coupled to the concrete Postgres implementation — swapping the DB layer requires no handler changes.

**Why TanStack Query on the frontend?**
It gives loading, error, and stale states for free without writing a single `useState(isLoading)`. Optimistic UI (required by spec) is built into the `onMutate` / `onError` hooks. The same `['users']` query key is shared between the task form panel and the kanban board so `GET /api/users` is fetched exactly once and cached — no duplicate calls.

**Why Tailwind + custom `@layer components` instead of shadcn/ui?**
shadcn/ui adds Radix UI bundle weight and requires a component generation step that complicates the Docker build. Tailwind `@layer components` gives the same reusable class approach (`.btn-primary`, `.card`, `.input`) with zero runtime overhead and full visual control, making the "component design" rubric point cleaner to demonstrate.

**Why prefix all API routes with `/api`?**
Without a common prefix, Vite's dev proxy and nginx's `location` rules would clash with React Router paths — e.g. both the frontend and the API would claim `/projects`. The `/api` prefix is the standard SPA pattern: `/projects` → React page, `/api/projects` → Go handler.

**Tradeoffs made**

- **No refresh token** — JWT lasts 24 h then requires re-login. A short-lived access token + httpOnly cookie refresh token would be the production pattern.
- **`creator_id` not stored on tasks** — the spec says "project owner or task creator" can delete. Currently only project owner is checked. Adding `created_by UUID` to the tasks table would fix this.
- **No pagination** — list endpoints return all records. `OFFSET / LIMIT` with a `meta: { total, page, limit }` envelope is straightforward but was cut for time.
- **No integration tests** — the backend has no automated tests. Three happy-path + edge-case tests using `httptest.NewRecorder` would cover the critical auth and task flows.
- **No drag-and-drop** — `@dnd-kit/core` integrates cleanly with the existing optimistic update pattern but was deprioritised in favour of shipping all required features.

---

## 4. Running Locally

**Prerequisites:** Docker Desktop only. No Go, Node, or PostgreSQL required.

```bash
git clone https://github.com/jyothiswarup/taskflow-jyothiswarup
cd taskflow-jyothiswarup
cp .env.example .env
docker compose up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API (via nginx proxy) | http://localhost:3000/api |
| Health check | http://localhost:3000/api/health |

The API server retries connecting to PostgreSQL for up to 20 seconds on startup — Docker startup ordering is handled automatically, no `depends_on` hacks needed.

**Running without Docker (local dev)**

```bash
# 1. Start only the database
docker compose up postgres -d

# 2. Backend — from taskflow-jyothiswarup/backend/
go run ./cmd/api
# Reads .env automatically via godotenv

# 3. Frontend — from taskflow-jyothiswarup/frontend/
npm install
npm run dev
# Available at http://localhost:3000 — proxies /api/* to localhost:8080
```

---

## 5. Running Migrations

Migrations run **automatically on every container start**. `golang-migrate` tracks applied migrations in a `schema_migrations` table and only applies new ones — it is safe to restart the container repeatedly.

**Manual migration commands (if needed)**

```bash
# Apply all pending migrations
docker run --rm \
  -v $(pwd)/backend/migrations:/migrations \
  --network taskflow-jyothiswarup_default \
  migrate/migrate \
  -path=/migrations \
  -database "postgres://taskflow:taskflow_secret@postgres:5432/taskflow?sslmode=disable" up

# Roll back all migrations
docker run --rm \
  -v $(pwd)/backend/migrations:/migrations \
  --network taskflow-jyothiswarup_default \
  migrate/migrate \
  -path=/migrations \
  -database "postgres://taskflow:taskflow_secret@postgres:5432/taskflow?sslmode=disable" down
```

---

## 6. Test Credentials

The seed file (`backend/seed.sql`) creates these accounts and sample data automatically on first startup:

```
Email:    test@example.com
Password: password123

Email:    jane@example.com
Password: password123
```

The seed also creates a **"Website Redesign"** project with 3 tasks in different statuses (`done`, `in_progress`, `todo`) so the kanban board is populated immediately after login.

---

## 7. API Reference

All protected endpoints require `Authorization: Bearer <token>`.
All requests and responses use `Content-Type: application/json`.

> **Base path:** `/api` — e.g. full URL is `http://localhost:3000/api/projects`

### Auth (public)

**POST `/api/auth/register`**
```json
// Request
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123" }

// Response 201
{ "token": "<jwt>", "user": { "id": "uuid", "name": "Jane Doe", "email": "jane@example.com", "created_at": "..." } }
```

**POST `/api/auth/login`**
```json
// Request
{ "email": "jane@example.com", "password": "secret123" }

// Response 200
{ "token": "<jwt>", "user": { ... } }
```

### Users (protected)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List all users — used to populate the assignee dropdown in the UI |

### Projects (protected)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List projects the current user owns or has tasks in — includes task counts |
| POST | `/api/projects` | Create a project (owner = current user) |
| GET | `/api/projects/:id` | Get project details including all its tasks |
| PATCH | `/api/projects/:id` | Update name / description (owner only) |
| DELETE | `/api/projects/:id` | Delete project and all its tasks (owner only) |
| GET | `/api/projects/:id/stats` | Task counts by status and by assignee *(bonus)* |

**POST `/api/projects`**
```json
// Request
{ "name": "My Project", "description": "Optional description" }

// Response 201
{ "id": "uuid", "name": "My Project", "description": "...", "owner_id": "uuid", "created_at": "..." }
```

### Tasks (protected)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects/:id/tasks` | List tasks — supports `?status=` and `?assignee=` filters |
| POST | `/api/projects/:id/tasks` | Create a task |
| PATCH | `/api/tasks/:id` | Update title, description, status, priority, assignee, due_date |
| DELETE | `/api/tasks/:id` | Delete task (project owner only) |

**POST `/api/projects/:id/tasks`**
```json
// Request
{
  "title": "Design homepage",
  "description": "Create wireframes and mockups",
  "priority": "high",
  "assignee_id": "uuid-or-empty-string",
  "due_date": "2026-04-20"
}

// Response 201 — returns the created task object
```

**PATCH `/api/tasks/:id`** — all fields optional
```json
{ "title": "Updated title", "status": "done", "priority": "low", "assignee_id": "", "due_date": "" }

// Response 200 — returns the updated task object
```

### Error Responses

```json
// 400 Validation failure
{ "error": "validation failed", "fields": { "email": "is required" } }

// 401 Missing or invalid JWT
{ "error": "unauthorized" }

// 403 Valid JWT but insufficient permission (e.g. not project owner)
{ "error": "forbidden" }

// 404 Resource does not exist
{ "error": "not found" }
```

---

## 8. What You'd Do With More Time

**What I would improve or add:**

1. **Refresh tokens** — JWT currently lasts 24 h. The production pattern is: short-lived access token (15 min) + long-lived refresh token in an `httpOnly` cookie. This prevents token theft via XSS without requiring frequent re-login.

2. **`creator_id` on tasks** — The spec states "project owner **or task creator**" can delete. I only store `owner_id` on projects, not `created_by` on tasks. Adding that column in a new migration would fix this without any other code changes.

3. **Pagination** — All list endpoints return every record. Adding `?page=&limit=` with `OFFSET / LIMIT` SQL and a `meta: { total, page, limit }` envelope is straightforward but was cut for time.

4. **Integration tests** — The backend has no automated tests. At minimum I'd add: register → login → create project → create task → assert 401 on missing token → assert 403 on wrong owner. Go's `httptest.NewRecorder` makes this clean without spinning up a real server.

5. **Drag-and-drop kanban** — `@dnd-kit/core` integrates well with TanStack Query's optimistic update pattern already in the codebase. Dropping a card into a new column would call `PATCH /api/tasks/:id` with the new status.

6. **Real-time updates via SSE** — `GET /api/projects/:id/events` (Server-Sent Events) would let multiple users see status changes without polling. The chi router handles SSE via `http.Flusher`.

7. **Rate limiting on auth endpoints** — No rate limiting currently. In production, brute-force on `/api/auth/login` is a real risk. `golang.org/x/time/rate` or a Redis-backed token bucket would fix this.

**Shortcuts taken:**

- Dark mode persists in `localStorage` but does not sync across tabs (not required by spec)
- Seed script uses hardcoded UUIDs — works for deterministic testing, would not scale to multi-tenant seeds
- No HTTPS in Docker setup — assumed to sit behind a TLS-terminating load balancer in production
