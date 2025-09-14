import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export function LoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const { setToken, role, bootstrap } = useAuthStore();
  const navigate = useNavigate();

  React.useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  React.useEffect(() => {
    if (role === 'ADMIN') navigate('/admin', { replace: true });
    else if (role === 'VERIFIER') navigate('/verifier', { replace: true });
  }, [role, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      const [, payload] = token.split('.');
      const { role } = JSON.parse(atob(payload));
      navigate(role === 'ADMIN' ? '/admin' : '/verifier', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-4">Sign in</h1>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="text-red-600 text-sm mb-2" role="alert">{error}</div>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="text-xs text-gray-500 mt-4">
          Demo users: admin@example.com / Pass@123, verifier@example.com / Pass@123
        </div>
      </form>
    </div>
  );
}

