// RegisterPage — two-panel layout matching the green brand theme.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Sprout, Mail, Lock, User, ArrowRight, CheckCircle2 } from 'lucide-react';
import { authApi, getApiErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

const registerSchema = z.object({
  name:            z.string().min(2, 'Name must be at least 2 characters'),
  email:           z.string().email('Enter a valid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

const FEATURES = [
  'Kanban-style task boards',
  'Real-time progress tracking',
  'Team collaboration & assignments',
];

export function RegisterPage() {
  const navigate  = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError]   = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterForm) {
    setServerError('');
    try {
      const result = await authApi.register({ name: data.name, email: data.email, password: data.password });
      login(result);
      navigate('/projects');
    } catch (err) {
      setServerError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left: green brand panel (hidden on mobile) ─────────────────────── */}
      <div className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative bg-gradient-to-br from-brand-700 via-brand-500 to-emerald-400 flex-col justify-between p-12 overflow-hidden">

        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white/10 -translate-y-1/3 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full bg-white/10 translate-y-1/3 -translate-x-1/3 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm">
            <Sprout className="w-5 h-5 text-white" />
          </span>
          <span className="text-white font-extrabold text-xl tracking-tight">TaskFlow</span>
        </div>

        {/* Hero copy */}
        <div className="relative space-y-6">
          <div>
            <h2 className="text-4xl font-extrabold text-white leading-tight">
              Start growing<br />your ideas 🌿
            </h2>
            <p className="text-green-100 mt-3 text-base leading-relaxed">
              Join your team and turn ideas into shipped tasks — for free.
            </p>
          </div>

          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-green-100 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-200 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-green-200 text-xs">
          © {new Date().getFullYear()} TaskFlow — Built with Go &amp; React
        </p>
      </div>

      {/* ── Right: form panel ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 px-6 py-12">

        {/* Mobile-only logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-400 shadow">
            <Sprout className="w-5 h-5 text-white" />
          </span>
          <span className="font-extrabold text-xl bg-gradient-to-r from-brand-600 to-emerald-500 bg-clip-text text-transparent">
            TaskFlow
          </span>
        </div>

        {/* Card */}
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl shadow-green-100 dark:shadow-none border border-gray-100 dark:border-gray-800 p-8 space-y-6 animate-fade-in">

          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">Create your account ✨</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Start managing tasks with your team today</p>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-800">
              <span className="shrink-0">⚠</span>
              {serverError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="label">Full name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  className="input pl-10"
                  {...register('name')}
                />
              </div>
              {errors.name && <p className="field-error">{errors.name.message}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="input pl-10"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="field-error">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="input pl-10 pr-11"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="field-error">{errors.password.message}</p>}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="label">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="input pl-10"
                  {...register('confirmPassword')}
                />
              </div>
              {errors.confirmPassword && <p className="field-error">{errors.confirmPassword.message}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-3 text-base rounded-xl mt-1 group"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                <span className="flex items-center gap-2 justify-center">
                  Create account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100 dark:border-gray-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-white dark:bg-gray-900 text-xs text-gray-400">Already have an account?</span>
            </div>
          </div>

          {/* Sign in link */}
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            Sign in instead
          </Link>

        </div>
      </div>
    </div>
  );
}
