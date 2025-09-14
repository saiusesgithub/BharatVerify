import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../../components/Navbar';

export function VerifierLayout() {
  return (
    <div className="min-h-full">
      <Navbar />
      <main className="max-w-6xl mx-auto p-4">
        <h1 className="text-2xl font-semibold mb-4">Verifier Dashboard</h1>
        <Outlet />
      </main>
    </div>
  );
}

