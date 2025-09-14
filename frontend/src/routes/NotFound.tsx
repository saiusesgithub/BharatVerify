import React from 'react';
import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="card max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-2">404 - Not Found</h1>
        <p className="text-sm mb-4">The page you’re looking for doesn’t exist.</p>
        <Link className="btn-primary" to="/login">Go to Login</Link>
      </div>
    </div>
  );
}

