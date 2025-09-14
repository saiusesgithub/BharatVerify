import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export function Guard({ role, children }: { role: 'ADMIN' | 'VERIFIER'; children: React.ReactNode }) {
  const { token, role: currentRole } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (currentRole !== role) return <Navigate to="/login" replace />;
  return <>{children || <Outlet />}</>;
}

