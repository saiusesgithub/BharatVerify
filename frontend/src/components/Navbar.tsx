import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export function Navbar() {
  const { role, logout } = useAuthStore();
  const navigate = useNavigate();
  const [dark, setDark] = React.useState(() => localStorage.getItem('theme') === 'dark');
  React.useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const leftLinks = role === 'ADMIN'
    ? (
      <>
        <Link className="px-3 py-2 hover:underline" to="/admin/upload">Upload</Link>
        <Link className="px-3 py-2 hover:underline" to="/admin/audit">My Uploads</Link>
      </>
    ) : role === 'VERIFIER' ? (
      <>
        <Link className="px-3 py-2 hover:underline" to="/verifier/verify">Verify</Link>
        <Link className="px-3 py-2 hover:underline" to="/verifier/audit">Activity</Link>
      </>
    ) : null;

  return (
    <nav className="w-full border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Certify</span>
          <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 ml-2">{role || 'GUEST'}</span>
          <div className="ml-6 hidden sm:flex">
            {leftLinks}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" aria-label="Toggle theme" onClick={() => setDark((d) => !d)}>{dark ? 'Light' : 'Dark'}</button>
          {role && <button className="btn-primary" onClick={() => { logout(); navigate('/login'); }}>Logout</button>}
        </div>
      </div>
    </nav>
  );
}

