// ProjectsPage — shows all projects the user owns or is assigned tasks in.
// Demonstrates TanStack Query for automatic loading/error states.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, FolderOpen, Calendar, Trash2, Pencil, CheckCircle2, Circle, ArrowRight, ListTodo, Sprout } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { projectsApi, getApiErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { Modal } from '../components/Modal';
import type { Project, ProjectSummary } from '../types';

// Six gradient palettes that cycle across cards — keeps the board lively
const CARD_PALETTES = [
  { accent: 'from-emerald-400 to-green-500',   light: 'bg-emerald-50', ring: 'hover:border-emerald-300' },
  { accent: 'from-teal-400 to-cyan-500',        light: 'bg-teal-50',    ring: 'hover:border-teal-300'    },
  { accent: 'from-violet-400 to-purple-500',    light: 'bg-violet-50',  ring: 'hover:border-violet-300'  },
  { accent: 'from-amber-400 to-orange-500',     light: 'bg-amber-50',   ring: 'hover:border-amber-300'   },
  { accent: 'from-rose-400 to-pink-500',        light: 'bg-rose-50',    ring: 'hover:border-rose-300'    },
  { accent: 'from-blue-400 to-indigo-500',      light: 'bg-blue-50',    ring: 'hover:border-blue-300'    },
];

// ─── Form schema ──────────────────────────────────────────────────────────────
const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
});

type ProjectForm = z.infer<typeof projectSchema>;

// ─── Create/Edit Project Modal ─────────────────────────────────────────────────
function ProjectFormModal({
  isOpen,
  onClose,
  project,
}: {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: project?.name ?? '', description: project?.description ?? '' },
  });

  // TanStack Query mutation — handles loading state and cache invalidation automatically
  const createMutation = useMutation({
    mutationFn: (data: ProjectForm) => projectsApi.create(data),
    onSuccess: () => {
      // Invalidate the projects list query so it refetches fresh data
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      reset();
      onClose();
    },
    onError: (err) => setServerError(getApiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProjectForm) => projectsApi.update(project!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (err) => setServerError(getApiErrorMessage(err)),
  });

  async function onSubmit(data: ProjectForm) {
    setServerError('');
    if (project) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={project ? 'Edit project' : 'New project'}>
      {serverError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Project name</label>
          <input type="text" placeholder="e.g. Website Redesign" className="input" {...register('name')} />
          {errors.name && <p className="field-error">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea
            placeholder="What is this project about?"
            className="input resize-none"
            rows={3}
            {...register('description')}
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Projects Page ────────────────────────────────────────────────────────
export function ProjectsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<Project | undefined>();

  // TanStack Query automatically handles loading/error states and caching
  const { data: projects, isLoading, error, refetch } = useQuery<ProjectSummary[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault(); // prevent the Link from navigating
    if (confirm('Delete this project and all its tasks?')) {
      deleteMutation.mutate(id);
    }
  }

  // ── Loading state ──
  if (isLoading) return <LoadingSpinner fullPage />;

  // ── Error state ──
  if (error) return <ErrorMessage message={getApiErrorMessage(error)} onRetry={() => refetch()} />;

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Page hero header ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-emerald-500 to-teal-500 px-8 py-10 shadow-xl">
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sprout className="w-5 h-5 text-green-200" />
              <span className="text-green-200 text-sm font-medium tracking-wide uppercase">
                Welcome back, {user?.name}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Your Projects</h1>
            <p className="text-green-100 text-sm mt-1">
              {projects?.length
                ? `${projects.length} project${projects.length !== 1 ? 's' : ''} — keep growing 🌱`
                : 'Start something new today'}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-brand-700 text-sm font-bold shadow-md hover:shadow-lg hover:bg-green-50 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            New project
          </button>
        </div>
      </div>

      {/* ── Project grid ───────────────────────────────────────────────── */}
      {projects && projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-100 to-emerald-100 flex items-center justify-center mb-4 shadow-inner">
            <FolderOpen className="w-9 h-9 text-brand-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300">No projects yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-6 max-w-xs">
            Plant your first seed — create a project and start managing tasks.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary px-6 py-2.5 text-base">
            <Plus className="w-4 h-4" /> New project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects?.map((project, idx) => {
            const palette = CARD_PALETTES[idx % CARD_PALETTES.length];
            const total   = project.task_count ?? 0;
            const done    = project.done_count ?? 0;
            const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className={`group block rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900
                            hover:shadow-xl ${palette.ring} dark:hover:border-gray-500
                            transition-all duration-200 overflow-hidden animate-fade-in`}
              >
                {/* ── Gradient header banner ── */}
                <div className={`h-20 bg-gradient-to-br ${palette.accent} relative px-5 pt-4`}>
                  {/* Decorative blobs */}
                  <div className="absolute top-2 right-3 w-14 h-14 rounded-full bg-white/15 pointer-events-none" />
                  <div className="absolute -bottom-3 -left-3 w-10 h-10 rounded-full bg-white/10 pointer-events-none" />

                  {/* Project initial circle */}
                  <span className="relative z-10 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/25 backdrop-blur-sm text-white font-extrabold text-lg shadow">
                    {project.name.charAt(0).toUpperCase()}
                  </span>

                  {/* Owner actions — appear on hover */}
                  {project.owner_id === user?.id && (
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => { e.preventDefault(); setEditProject(project); }}
                        className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 backdrop-blur-sm text-white transition-colors"
                        aria-label="Edit project"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, project.id)}
                        className="p-1.5 rounded-lg bg-white/20 hover:bg-red-400/60 backdrop-blur-sm text-white transition-colors"
                        aria-label="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Card body ── */}
                <div className="p-5 space-y-3">
                  {/* Title */}
                  <h3 className="font-bold text-base leading-snug line-clamp-1 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {project.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2.5rem]">
                    {project.description ?? (
                      <span className="italic text-gray-300 dark:text-gray-600">No description</span>
                    )}
                  </p>

                  {/* Progress bar + percentage */}
                  {total > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Progress</span>
                        <span className="font-semibold text-gray-600 dark:text-gray-300">{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${palette.accent} transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Task count pills */}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {total === 0 ? (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${palette.light} dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium`}>
                        <ListTodo className="w-3 h-3" />
                        No tasks yet — click to add
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium">
                          <Circle className="w-3 h-3" />
                          {project.pending_count} open
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          {done}/{total} done
                        </span>
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="w-3 h-3" />
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 group-hover:gap-2 transition-all">
                      Open project
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create project modal */}
      <ProjectFormModal isOpen={showCreate} onClose={() => setShowCreate(false)} />

      {/* Edit project modal */}
      {editProject && (
        <ProjectFormModal
          isOpen={!!editProject}
          onClose={() => setEditProject(undefined)}
          project={editProject}
        />
      )}
    </div>
  );
}
