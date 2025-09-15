import React from 'react';
import { api, VerifyResponse } from '../../api/client';

export function VerifyPage() {
  const [docId, setDocId] = React.useState('');
  const [result, setResult] = React.useState<VerifyResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = file ? await api.verifyWithFile(docId, file) : await api.verify(docId);
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
        <label className="label">Scanned PDF (optional, enables AI)</label>
        <input className="input mb-3" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
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

            <div className="mt-4">
              <h3 className="font-semibold">AI Analysis</h3>
              <div className="text-sm mt-1">
                Overall: {result.ml ? (
                  <span className={`px-2 py-0.5 rounded ${result.ml.overall_status === 'authentic' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{result.ml.overall_status}</span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">Not run</span>
                )}
              </div>
              {!result.ml && (
                <div className="text-xs text-gray-500 mt-1">Attach a scanned PDF to enable AI checks (layout, photo, seal, signature).</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {(['layout','photo','seal','signature'] as const).map((key) => {
                  const item: any = (result as any)?.ml?.[key];
                  const status = item?.status || 'not_run';
                  const badgeClass = status === 'authentic' ? 'bg-green-100 text-green-700' : (status === 'tampered' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700');
                  const label = status === 'not_run' ? 'Not run' : status;
                  const title = key.charAt(0).toUpperCase() + key.slice(1);
                  return (
                    <div key={key} className="border rounded p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{title}</div>
                        <span className={`text-xs px-2 py-0.5 rounded ${badgeClass}`}>{label}</span>
                      </div>
                      {item?.message && <div className="text-xs text-gray-600 mt-2">{item.message}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="btn-secondary mt-3" onClick={() => navigator.clipboard.writeText(`Verification ${result.status}${result.reasons?.length ? `: ${result.reasons.join(', ')}` : ''}${result.ml ? ` | AI: ${result.ml.overall_status}` : ''}`)}>Copy summary</button>
          </div>
        )}
      </div>
    </div>
  );
}

