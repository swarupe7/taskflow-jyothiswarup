// useAuth hook — provides auth state and actions to the whole app via React Context.
// This is the equivalent of a Node.js session store on the client side.
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { User, AuthResponse } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (data: AuthResponse) => void;
  logout: () => void;
}

// Create the context with a default value of null — will be provided by AuthProvider
const AuthContext = createContext<AuthContextValue | null>(null);

// Helper to load initial state from localStorage (persists across page refreshes)
function loadStoredAuth(): { user: User | null; token: string | null } {
  try {
    const token = localStorage.getItem('taskflow_token');
    const userStr = localStorage.getItem('taskflow_user');
    const user = userStr ? (JSON.parse(userStr) as User) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

// AuthProvider wraps the entire app and makes auth state available everywhere
export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStoredAuth();
  const [user, setUser] = useState<User | null>(stored.user);
  const [token, setToken] = useState<string | null>(stored.token);

  // login: called after successful register or login API response
  const login = useCallback((data: AuthResponse) => {
    localStorage.setItem('taskflow_token', data.token);
    localStorage.setItem('taskflow_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  // logout: clears all stored state and redirects to login
  const logout = useCallback(() => {
    localStorage.removeItem('taskflow_token');
    localStorage.removeItem('taskflow_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token && !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// useAuth is the consumer hook — throws if used outside AuthProvider
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
