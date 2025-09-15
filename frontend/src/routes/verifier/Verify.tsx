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
        <label className="label">Scanned PDF (optional, enables ML)</label>
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
            {result.ml && (
              <div className="mt-4">
                <h3 className="font-semibold">ML Analysis</h3>
                <div className="text-sm mt-1">Overall: <span className={`px-2 py-0.5 rounded ${result.ml.overall_status === 'authentic' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{result.ml.overall_status}</span></div>
                <ul className="list-disc ml-6 mt-2 text-sm">
                  {result.ml.layout && <li>Layout: {result.ml.layout.status} {result.ml.layout.message ? `- ${result.ml.layout.message}` : ''}</li>}
                  {result.ml.photo && <li>Photo: {result.ml.photo.status} {result.ml.photo.message ? `- ${result.ml.photo.message}` : ''}</li>}
                  {result.ml.seal && <li>Seal: {result.ml.seal.status} {result.ml.seal.message ? `- ${result.ml.seal.message}` : ''}</li>}
                  {result.ml.signature && <li>Signature: {result.ml.signature.status} {result.ml.signature.message ? `- ${result.ml.signature.message}` : ''}</li>}
                </ul>
              </div>
            )}
            <button className="btn-secondary mt-3" onClick={() => navigator.clipboard.writeText(`Verification ${result.status}${result.reasons?.length ? `: ${result.reasons.join(', ')}` : ''}${result.ml ? ` | ML: ${result.ml.overall_status}` : ''}`)}>Copy summary</button>
          </div>
        )}
      </div>
    </div>
  );
}

