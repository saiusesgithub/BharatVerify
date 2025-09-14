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
      { path: 'audit', element: <AdminAudit /> }
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
  { path: '*', element: <NotFound /> }
]);

