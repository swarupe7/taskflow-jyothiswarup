// TaskFormPanel — slide-in side panel for creating or editing a task.
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, UserCircle } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { tasksApi, usersApi, getApiErrorMessage } from '../lib/api';
import type { Task, TaskPriority, TaskStatus } from '../types';

// ─── Zod schema ───────────────────────────────────────────────────────────────
const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee_id: z.string().optional(),
  due_date: z.string().optional(),
});

type TaskForm = z.infer<typeof taskSchema>;

interface TaskFormPanelProps {
  projectId: string;
  task?: Task;
  onClose: () => void;
  onSuccess: () => void;
}

export function TaskFormPanel({ projectId, task, onClose, onSuccess }: TaskFormPanelProps) {
  const [serverError, setServerError] = useState('');
  const isEdit = !!task;

  // Fetch all platform users to populate the assignee dropdown
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
    staleTime: 5 * 60_000, // cache for 5 min — users list changes rarely
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'todo',
      priority: task?.priority ?? 'medium',
      assignee_id: task?.assignee_id?.Valid ? task.assignee_id.String : '',
      due_date: task?.due_date ?? '',
    },
  });

  // Reset when switching between create/edit
  useEffect(() => {
    reset({
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'todo',
      priority: task?.priority ?? 'medium',
      assignee_id: task?.assignee_id?.Valid ? task.assignee_id.String : '',
      due_date: task?.due_date ?? '',
    });
  }, [task, reset]);

  const createMutation = useMutation({
    mutationFn: (data: TaskForm) =>
      tasksApi.create(projectId, {
        title: data.title,
        description: data.description || undefined,
        priority: data.priority as TaskPriority,
        assignee_id: data.assignee_id || undefined,
        due_date: data.due_date || undefined,
      }),
    onSuccess,
    onError: (err) => setServerError(getApiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: TaskForm) =>
      tasksApi.update(task!.id, {
        title: data.title,
        description: data.description,
        status: data.status as TaskStatus,
        priority: data.priority as TaskPriority,
        // Send empty string to unassign, undefined to leave unchanged
        assignee_id: data.assignee_id,
        due_date: data.due_date,
      }),
    onSuccess,
    onError: (err) => setServerError(getApiErrorMessage(err)),
  });

  function onSubmit(data: TaskForm) {
    setServerError('');
    if (isEdit) updateMutation.mutate(data);
    else createMutation.mutate(data);
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Side panel */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit task' : 'New task'}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-5">
          {serverError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {serverError}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="label">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="What needs to be done?"
              className="input"
              {...register('title')}
            />
            {errors.title && <p className="field-error">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="label">
              Description{' '}
              <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <textarea
              placeholder="Add more context…"
              className="input resize-none"
              rows={3}
              {...register('description')}
            />
          </div>

          {/* Status — edit mode only */}
          {isEdit && (
            <div>
              <label className="label">Status</label>
              <select className="input" {...register('status')}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="label">Priority</label>
            <select className="input" {...register('priority')}>
              <option value="low">🟢 Low</option>
              <option value="medium">🟡 Medium</option>
              <option value="high">🔴 High</option>
            </select>
          </div>

          {/* ── Assignee dropdown — replaces the UUID text input ── */}
          <div>
            <label className="label">
              Assignee{' '}
              <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>

            {loadingUsers ? (
              <div className="input flex items-center gap-2 text-gray-400 text-sm">
                <span className="animate-spin">⟳</span> Loading users…
              </div>
            ) : (
              <div className="relative">
                {/* User icon inside the select */}
                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  className="input pl-9 appearance-none"
                  {...register('assignee_id')}
                >
                  {/* Empty option = unassigned */}
                  <option value="">— Unassigned —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Due date */}
          <div>
            <label className="label">
              Due date{' '}
              <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </label>
            <input type="date" className="input" {...register('due_date')} />
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 dark:bg-gray-900/80">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="btn-primary flex-1"
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </aside>
    </>
  );
}
