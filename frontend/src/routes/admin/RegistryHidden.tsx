import React from 'react';
import { api } from '../../api/client';

export function RegistryHidden() {
  const [address, setAddress] = React.useState('');
  const [name, setName] = React.useState('');
  const [out, setOut] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOut('');
    setLoading(true);
    try {
      const res = await api.chainAddIssuer(address.trim(), name.trim());
      setOut(JSON.stringify(res));
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-2">Registry (Hidden)</h2>
      <p className="text-xs text-gray-500 mb-4">Add issuer to on-chain registry. Keep this URL secret.</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Issuer Address</label>
          <input className="input w-full" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x..." required />
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Institution Name" required />
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {out && <pre className="bg-gray-50 p-2 rounded text-xs overflow-auto">{out}</pre>}
        <button className="btn-primary" disabled={loading || !address || !name}>{loading ? 'Submitting…' : 'Add Issuer'}</button>
      </form>
      <div className="text-xs text-gray-400 mt-3">Endpoint: VITE_CHAIN_ADAPTER_URL/issuer/add</div>
    </div>
  );
}

