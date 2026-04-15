// ProjectDetailPage — shows a single project with its tasks, filters, and task actions.
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, BarChart2, ClipboardList, Calendar, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { projectsApi, tasksApi, usersApi, getApiErrorMessage } from '../lib/api';
import type { User as UserType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { PriorityBadge } from '../components/Badge';
import { TaskFormPanel } from '../components/TaskFormPanel';
import type { Task, TaskStatus } from '../types';
import { STATUS_LABELS } from '../types';
import { useAuth } from '../hooks/useAuth';

// Format ISO date string to readable "Apr 23, 2026" — avoids the ugly ISO dump
function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// Priority → left accent bar colour + subtle card tint
const PRIORITY_ACCENT: Record<string, { bar: string; glow: string }> = {
  high:   { bar: 'bg-red-400',    glow: 'shadow-red-100 dark:shadow-red-900/20'    },
  medium: { bar: 'bg-amber-400',  glow: 'shadow-amber-100 dark:shadow-amber-900/20' },
  low:    { bar: 'bg-emerald-400',glow: 'shadow-emerald-100 dark:shadow-emerald-900/20' },
};

// Status → styled pill colours
const STATUS_PILL: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  done:        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

// Generates a deterministic HSL colour from a string (used for assignee avatar)
function stringToHsl(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 52%)`;
}

// ─── Single task card ─────────────────────────────────────────────────────────
function TaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  isOwner,
  usersMap,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  isOwner: boolean;
  usersMap: Map<string, UserType>;
}) {
  const assigneeId   = task.assignee_id?.Valid ? task.assignee_id.String : null;
  const assigneeName = assigneeId ? (usersMap.get(assigneeId)?.name ?? 'Unknown') : null;
  const formattedDate = formatDate(task.due_date);
  const isOverdue    = task.due_date && task.status !== 'done' && new Date(task.due_date) < new Date();
  const accent       = PRIORITY_ACCENT[task.priority] ?? PRIORITY_ACCENT.medium;
  const isDone       = task.status === 'done';

  return (
    <div className={`group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md hover:shadow-xl ${accent.glow} transition-all duration-200 overflow-hidden`}>

      {/* ── Left priority accent bar ── */}
      <div className={`absolute left-0 top-0 h-full w-1 ${accent.bar} rounded-l-2xl`} />

      <div className="pl-4 pr-4 pt-4 pb-3 space-y-3">

        {/* Row 1: title + actions */}
        <div className="flex items-start justify-between gap-2">
          <p className={`font-semibold text-sm leading-snug flex-1 ${
            isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'
          }`}>
            {task.title}
          </p>

          {/* Edit / Delete — fade in on card hover */}
          {isOwner && (
            <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5">
              <button
                onClick={() => onEdit(task)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-gray-800 transition-colors"
                aria-label="Edit task"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                aria-label="Delete task"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Row 2: description */}
        {task.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Row 3: priority badge + assignee avatar */}
        <div className="flex items-center justify-between gap-2">
          <PriorityBadge priority={task.priority} />

          {/* Assignee avatar with initials + coloured background */}
          {assigneeName ? (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white shrink-0 max-w-[140px]"
              style={{ backgroundColor: stringToHsl(assigneeName) }}
              title={assigneeName}
            >
              {/* Initials circle */}
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/25 text-white font-bold text-[10px] shrink-0">
                {assigneeName.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{assigneeName}</span>
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600">Unassigned</span>
          )}
        </div>

        {/* Row 4: footer — due date + status select */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800 gap-2">

          {/* Due date */}
          {formattedDate ? (
            <span className={`flex items-center gap-1 text-xs shrink-0 ${
              isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'
            }`}>
              <Calendar className="w-3 h-3" />
              {isOverdue ? '⚠ ' : ''}{formattedDate}
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600">No due date</span>
          )}

          {/* Styled status select */}
          <div className="relative shrink-0">
            <select
              value={task.status}
              onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
              className={`appearance-none text-xs font-semibold pl-2.5 pr-6 py-1 rounded-full cursor-pointer
                          border-0 focus:outline-none focus:ring-2 focus:ring-brand-400
                          transition-colors ${STATUS_PILL[task.status]}`}
              aria-label="Change task status"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            {/* Custom dropdown chevron */}
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────
const COLUMN_STYLES: Record<TaskStatus, { header: string; dot: string; empty: string }> = {
  todo: {
    header: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
    dot: 'bg-gray-400',
    empty: 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600',
  },
  in_progress: {
    header: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    empty: 'border-blue-200 dark:border-blue-800 text-blue-200 dark:text-blue-800',
  },
  done: {
    header: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    dot: 'bg-green-500',
    empty: 'border-green-200 dark:border-green-800 text-green-200 dark:text-green-800',
  },
};

// ─── Main Project Detail Page ──────────────────────────────────────────────────
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();
  const [statusFilter, setStatusFilter]     = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [showStats, setShowStats] = useState(false);

  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.getById(id!),
    enabled: !!id,
  });

  // Fetch all users once and build an id→user map for O(1) name lookups on each card
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    staleTime: 5 * 60_000,
  });
  const usersMap = new Map<string, UserType>(users.map((u) => [u.id, u]));

  // Filtered task query — runs when either filter is active
  const hasFilter = !!statusFilter || !!assigneeFilter;
  const { data: filteredTasks } = useQuery({
    queryKey: ['tasks', id, statusFilter, assigneeFilter],
    queryFn: () => tasksApi.listByProject(id!, {
      ...(statusFilter   ? { status:   statusFilter   } : {}),
      ...(assigneeFilter ? { assignee: assigneeFilter } : {}),
    }),
    enabled: !!id && hasFilter,
  });

  const { data: stats } = useQuery({
    queryKey: ['project-stats', id],
    queryFn: () => projectsApi.getStats(id!),
    enabled: !!id && showStats,
  });

  // Optimistic UI: update cache immediately, roll back on error
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      tasksApi.update(taskId, { status }),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['project', id] });
      const previousProject = queryClient.getQueryData(['project', id]);
      queryClient.setQueryData(['project', id], (old: typeof project) => {
        if (!old) return old;
        return { ...old, tasks: old.tasks.map((t) => t.id === taskId ? { ...t, status } : t) };
      });
      return { previousProject };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousProject) queryClient.setQueryData(['project', id], context.previousProject);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['project', id] }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', id] }),
  });

  function handleDelete(taskId: string) {
    if (confirm('Delete this task?')) deleteTaskMutation.mutate(taskId);
  }

  if (isLoading) return <LoadingSpinner fullPage />;
  if (error) return <ErrorMessage message={getApiErrorMessage(error)} onRetry={() => refetch()} />;
  if (!project) return <ErrorMessage message="Project not found" />;

  const isOwner = project.owner_id === user?.id;
  const displayTasks = hasFilter && filteredTasks ? filteredTasks : project.tasks;

  const tasksByStatus: Record<TaskStatus, Task[]> = {
    todo: displayTasks.filter((t) => t.status === 'todo'),
    in_progress: displayTasks.filter((t) => t.status === 'in_progress'),
    done: displayTasks.filter((t) => t.status === 'done'),
  };

  const totalTasks = displayTasks.length;
  const doneTasks = tasksByStatus.done.length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <Link to="/projects" className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{project.name}</h1>
          {project.description && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{project.description}</p>
          )}
          {/* Progress bar */}
          {totalTasks > 0 && (
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {doneTasks}/{totalTasks} done
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowStats((s) => !s)} className="btn-secondary text-sm">
            <BarChart2 className="w-4 h-4" />
            <span className="hidden sm:block">Stats</span>
          </button>
          <button
            onClick={() => { setEditTask(undefined); setShowTaskPanel(true); }}
            className="btn-primary text-sm"
          >
            <Plus className="w-4 h-4" />
            Add task
          </button>
        </div>
      </div>

      {/* Stats panel */}
      {showStats && stats && (
        <div className="card p-4 grid grid-cols-3 gap-6">
          {Object.entries(stats.by_status).map(([status, count]) => (
            <div key={status} className="text-center">
              <div className="text-3xl font-bold text-brand-600">{count as number}</div>
              <div className="text-xs text-gray-500 mt-1">{STATUS_LABELS[status as TaskStatus] ?? status}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar — status tabs + assignee dropdown */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['', 'todo', 'in_progress', 'done'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                statusFilter === s
                  ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600'
              }`}
            >
              {s === '' ? `All (${totalTasks})` : `${STATUS_LABELS[s as TaskStatus]} (${tasksByStatus[s as TaskStatus]?.length ?? 0})`}
            </button>
          ))}
        </div>

        {/* Assignee filter dropdown — populated from the users map */}
        {users.length > 0 && (
          <div className="relative">
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className={`text-xs pl-3 pr-7 py-1.5 rounded-full border font-medium cursor-pointer
                          focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all appearance-none
                          ${assigneeFilter
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600'
                          }`}
              aria-label="Filter by assignee"
            >
              <option value="">All assignees</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {/* Chevron indicator */}
            <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}

        {/* Clear all filters button — appears only when a filter is active */}
        {(statusFilter || assigneeFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setAssigneeFilter(''); }}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-500 hover:border-red-300 transition-all font-medium"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Kanban board */}
      {displayTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="w-14 h-14 text-gray-200 dark:text-gray-700 mb-4" />
          <h3 className="font-semibold text-gray-600 dark:text-gray-300 text-lg">No tasks yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-5">Break your project into tasks and start tracking progress</p>
          <button onClick={() => setShowTaskPanel(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add your first task
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((status) => {
            const style = COLUMN_STYLES[status];
            const count = tasksByStatus[status].length;
            return (
              <div key={status} className="flex flex-col gap-3">
                {/* Column header */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${style.header}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                  <span className="font-semibold text-sm">{STATUS_LABELS[status]}</span>
                  <span className="ml-auto text-xs opacity-60 font-normal">{count}</span>
                </div>

                {/* Task cards */}
                {count === 0 ? (
                  <div className={`border-2 border-dashed rounded-xl p-8 text-center text-sm ${style.empty}`}>
                    No tasks
                  </div>
                ) : (
                  tasksByStatus[status].map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isOwner={isOwner}
                      usersMap={usersMap}
                      onEdit={(t) => { setEditTask(t); setShowTaskPanel(true); }}
                      onDelete={handleDelete}
                      onStatusChange={(taskId, newStatus) =>
                        updateTaskMutation.mutate({ taskId, status: newStatus })
                      }
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Task create/edit side panel */}
      {showTaskPanel && (
        <TaskFormPanel
          projectId={id!}
          task={editTask}
          onClose={() => { setShowTaskPanel(false); setEditTask(undefined); }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['project', id] });
            setShowTaskPanel(false);
            setEditTask(undefined);
          }}
        />
      )}
    </div>
  );
}
