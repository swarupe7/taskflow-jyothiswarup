// Navbar — sticky top bar with green brand identity, dark mode toggle, and user info.
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun, Sprout } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('taskflow_theme') === 'dark');

  // Apply / remove the dark class on <html> and persist preference
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('taskflow_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('taskflow_theme', 'light');
    }
  }, [dark]);

  // Restore preference on mount (before first render)
  useEffect(() => {
    if (localStorage.getItem('taskflow_theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <nav className="sticky top-0 z-20 backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border-b border-green-100 dark:border-gray-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* ── Brand logo ──────────────────────────────────────────────── */}
          <Link
            to="/projects"
            className="flex items-center gap-2 font-extrabold text-lg tracking-tight group"
          >
            {/* Green leaf icon */}
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-400 shadow-md group-hover:shadow-brand-400/50 transition-shadow">
              <Sprout className="w-4 h-4 text-white" />
            </span>
            <span className="bg-gradient-to-r from-brand-600 to-emerald-500 bg-clip-text text-transparent">
              TaskFlow
            </span>
          </Link>

          {/* ── Right side ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2">

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark((d) => !d)}
              className="p-2 rounded-xl hover:bg-green-50 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User avatar pill */}
            {user && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-50 dark:bg-gray-800 border border-green-100 dark:border-gray-700">
                {/* Initials avatar */}
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-emerald-400 text-white text-xs font-bold shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {user.name}
                </span>
              </div>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Logout</span>
            </button>
          </div>

        </div>
      </div>
    </nav>
  );
}
