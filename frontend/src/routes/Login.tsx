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

  React.useEffect(() => { bootstrap(); }, [bootstrap]);
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

  // Demo registry tool (unauthenticated) — posts directly to chain-adapter
  const [addr, setAddr] = React.useState('');
  const [name, setName] = React.useState('');
  const [regLoading, setRegLoading] = React.useState(false);
  const [regOut, setRegOut] = React.useState<string>('');
  const [regErr, setRegErr] = React.useState<string>('');
  const addIssuer = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegErr(''); setRegOut(''); setRegLoading(true);
    try {
      const res = await api.chainAddIssuer(addr.trim(), name.trim());
      setRegOut(JSON.stringify(res));
    } catch (err: any) {
      setRegErr(err.message || 'Failed');
    } finally { setRegLoading(false); }
  };

  return (
    <div className="min-h-full grid md:grid-cols-2 gap-6 p-6 items-start">
      <form onSubmit={submit} className="card w-full max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-4">Sign in</h1>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input mb-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="text-red-600 text-sm mb-2" role="alert">{error}</div>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <div className="text-xs text-gray-500 mt-4">Demo users: admin@example.com / Pass@123, verifier@example.com / Pass@123</div>
      </form>

      <form onSubmit={addIssuer} className="card w-full max-w-md mx-auto">
        <h2 className="text-lg font-semibold mb-2">Registry (Demo Utility)</h2>
        <p className="text-xs text-gray-500 mb-3">Add issuer to chain registry. Requires chain-adapter admin key configured.</p>
        <label className="label" htmlFor="addr">Issuer Address</label>
        <input id="addr" className="input mb-3" placeholder="0x..." value={addr} onChange={(e) => setAddr(e.target.value)} required />
        <label className="label" htmlFor="iname">Name</label>
        <input id="iname" className="input mb-3" placeholder="Institution Name" value={name} onChange={(e) => setName(e.target.value)} required />
        {regErr && <div className="text-red-600 text-sm mb-2" role="alert">{regErr}</div>}
        {regOut && <pre className="bg-gray-50 p-2 rounded text-xs overflow-auto mb-2">{regOut}</pre>}
        <button className="btn-secondary" disabled={regLoading || !addr || !name}>{regLoading ? 'Submitting…' : 'Add Issuer'}</button>
      </form>
    </div>
  );
}

