import React from 'react';
import { api } from '../../api/client';

export function VerifyPage() {
  const [docId, setDocId] = React.useState('');
  const [result, setResult] = React.useState<{ status: 'PASS' | 'FAIL'; reasons: string[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.verify(docId);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={submit} className="card">
        <h2 className="text-lg font-semibold mb-3">Verify Certificate</h2>
        <label className="label">Document ID</label>
        <input className="input mb-3" value={docId} onChange={(e) => setDocId(e.target.value)} required />
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        <button className="btn-primary" disabled={!docId || loading}>{loading ? 'Verifying…' : 'Verify'}</button>
      </form>
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Result</h2>
        {!result && <div className="text-sm text-gray-500">Enter a docId to verify.</div>}
        {result && (
          <div>
            <div className={`inline-block px-2 py-1 rounded text-white ${result.status === 'PASS' ? 'bg-green-600' : 'bg-red-600'}`}>{result.status}</div>
            {result.reasons?.length > 0 && (
              <ul className="list-disc ml-6 mt-3">
                {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            <button className="btn-secondary mt-3" onClick={() => navigator.clipboard.writeText(`Verification ${result.status}${result.reasons?.length ? `: ${result.reasons.join(', ')}` : ''}`)}>Copy summary</button>
          </div>
        )}
      </div>
    </div>
  );
}

