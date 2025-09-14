import { create } from 'zustand';

type Role = 'ADMIN' | 'VERIFIER' | null;

type AuthState = {
  token: string | null;
  role: Role;
  setToken: (token: string | null) => void;
  logout: () => void;
  bootstrap: () => void;
};

function parseRoleFromToken(token: string | null): Role {
  try {
    if (!token) return null;
    const [, payload] = token.split('.');
    const json = JSON.parse(atob(payload));
    return (json.role as Role) || null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  role: null,
  setToken: (token) => {
    if (token) sessionStorage.setItem('token', token);
    else sessionStorage.removeItem('token');
    set({ token, role: parseRoleFromToken(token) });
  },
  logout: () => {
    sessionStorage.removeItem('token');
    set({ token: null, role: null });
  },
  bootstrap: () => {
    const token = sessionStorage.getItem('token');
    set({ token, role: parseRoleFromToken(token) });
  }
}));

