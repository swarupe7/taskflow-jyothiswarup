// Centralized axios instance — equivalent to creating an Express middleware
// that adds the Authorization header to every outgoing request.
import axios, { AxiosError } from 'axios';
import type {
  AuthResponse,
  CreateProjectPayload,
  CreateTaskPayload,
  LoginPayload,
  Project,
  ProjectSummary,
  ProjectWithTasks,
  RegisterPayload,
  Task,
  UpdateProjectPayload,
  UpdateTaskPayload,
} from '../types';

// Use a relative base URL so all API calls go through the Vite proxy (dev)
// or nginx (production) rather than directly to the backend port.
// Every path below already starts with /api/... which is the proxy trigger.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT from localStorage to every request.
// This runs before every API call — no need to pass the token manually.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('taskflow_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: redirect to /login on 401 (token expired/invalid).
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear stale auth data and force re-login
      localStorage.removeItem('taskflow_token');
      localStorage.removeItem('taskflow_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Helper to extract error message from API response ────────────────────────
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; fields?: Record<string, string> };
    if (data?.fields) {
      // Combine all field-level errors into one readable string
      return Object.entries(data.fields)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(', ');
    }
    return data?.error || error.message;
  }
  return 'An unexpected error occurred';
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  register: (payload: RegisterPayload) =>
    api.post<AuthResponse>('/api/auth/register', payload).then((r) => r.data),

  login: (payload: LoginPayload) =>
    api.post<AuthResponse>('/api/auth/login', payload).then((r) => r.data),
};

// ─── Projects endpoints ───────────────────────────────────────────────────────

export const projectsApi = {
  list: () =>
    api.get<{ projects: ProjectSummary[] }>('/api/projects').then((r) => r.data.projects),

  create: (payload: CreateProjectPayload) =>
    api.post<Project>('/api/projects', payload).then((r) => r.data),

  getById: (id: string) =>
    api.get<ProjectWithTasks>(`/api/projects/${id}`).then((r) => r.data),

  update: (id: string, payload: UpdateProjectPayload) =>
    api.patch<Project>(`/api/projects/${id}`, payload).then((r) => r.data),

  delete: (id: string) => api.delete(`/api/projects/${id}`),

  getStats: (id: string) =>
    api.get<{ by_status: Record<string, number>; by_assignee: Record<string, number> }>(
      `/api/projects/${id}/stats`
    ).then((r) => r.data),
};

// ─── Users endpoints ──────────────────────────────────────────────────────────

export const usersApi = {
  list: () =>
    api.get<{ users: import('../types').User[] }>('/api/users').then((r) => r.data.users),
};

// ─── Tasks endpoints ──────────────────────────────────────────────────────────

export const tasksApi = {
  listByProject: (projectId: string, filters?: { status?: string; assignee?: string }) =>
    api
      .get<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`, { params: filters })
      .then((r) => r.data.tasks),

  create: (projectId: string, payload: CreateTaskPayload) =>
    api.post<Task>(`/api/projects/${projectId}/tasks`, payload).then((r) => r.data),

  update: (id: string, payload: UpdateTaskPayload) =>
    api.patch<Task>(`/api/tasks/${id}`, payload).then((r) => r.data),

  delete: (id: string) => api.delete(`/api/tasks/${id}`),
};
