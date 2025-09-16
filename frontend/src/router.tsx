import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './routes/Login';
import { AdminLayout } from './routes/admin/AdminLayout';
import { AdminUpload } from './routes/admin/Upload';
import { AdminAudit } from './routes/admin/Audit';
import { VerifierLayout } from './routes/verifier/VerifierLayout';
import { VerifyPage } from './routes/verifier/Verify';
import { VerifierAudit } from './routes/verifier/Audit';
import { NotFound } from './routes/NotFound';
import { Guard } from './security/Guard';

// Lazy import must be defined before usage to avoid TDZ errors at module init.
const RegistryHiddenLazy = React.lazy(() => import('./routes/admin/RegistryHidden').then(m => ({ default: m.RegistryHidden })));

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: (
      <Guard role="ADMIN">
        <AdminLayout />
      </Guard>
    ),
    children: [
      { index: true, element: <Navigate to="upload" replace /> },
      { path: 'upload', element: <AdminUpload /> },
      { path: 'audit', element: <AdminAudit /> },
      // Hidden utility route (not linked in UI)
      { path: 'registry', element: <React.Suspense fallback={null}><RegistryHiddenLazy /></React.Suspense> }
    ]
  },
  {
    path: '/verifier',
    element: (
      <Guard role="VERIFIER">
        <VerifierLayout />
      </Guard>
    ),
    children: [
      { index: true, element: <Navigate to="verify" replace /> },
      { path: 'verify', element: <VerifyPage /> },
      { path: 'audit', element: <VerifierAudit /> }
    ]
  },
  // Hidden standalone admin route to avoid nested redirects
  {
    path: '/_registry',
    element: (
      <Guard role="ADMIN">
        <React.Suspense fallback={null}>
          <RegistryHiddenLazy />
        </React.Suspense>
      </Guard>
    )
  },
  { path: '*', element: <NotFound /> }
]);

// moved above
