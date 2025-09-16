import React from 'react';
import { FileDrop } from '../../components/FileDrop';
import { api } from '../../api/client';

export function AdminUpload() {
  const [file, setFile] = React.useState<File | null>(null);
  const [docId, setDocId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [reason, setReason] = React.useState('initial-issue');
  const [ownerId, setOwnerId] = React.useState('');
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);
    setLoading(true);
    setProgress(0);
    try {
      const res: any = await api.issueCertificate({ docId: docId || undefined, title: title || undefined, reason: reason || undefined, ownerId: ownerId || undefined, file }, (pct) => setProgress(pct));
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const API_BASE = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:3000';
  const doDownload = async () => {
    if (!result) return;
    const token = sessionStorage.getItem('token') || '';
    const path: string | undefined = result.downloadPath;
    if (!path) return alert('No download path available');
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (result.title || 'certificate') + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Download failed: ' + (e?.message || String(e)));
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={onSubmit} className="card">
        <h2 className="text-lg font-semibold mb-3">Upload Certificate</h2>
        <div className="mb-3">
          <label className="label">Document file</label>
          <FileDrop onFile={setFile} />
          {file && <div className="text-xs mt-2">{file.name} • {(file.size/1024).toFixed(1)} KB</div>}
        </div>
        <div className="mb-3">
          <label className="label">Doc ID (optional)</label>
          <input className="input" value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="auto-generate if blank" />
        </div>
        <div className="mb-3">
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., B.Tech Degree" />
        </div>
        <div className="mb-3">
          <label className="label">Reason</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="label">Owner Id (optional)</label>
          <input className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="student id/email" />
        </div>
        {progress > 0 && loading && (
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded h-2 mb-2">
            <div className="bg-blue-600 h-2 rounded" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        <button className="btn-primary" disabled={!file || loading}>{loading ? 'Uploading…' : 'Upload'}</button>
      </form>

      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Result</h2>
        {!result && <div className="text-sm text-gray-500">Upload a file to see the result.</div>}
        {result && (
          <div className="space-y-2">
            <div><span className="font-medium">docId:</span> {result.docId} <button className="btn-secondary ml-2" onClick={() => navigator.clipboard.writeText(result.docId)}>Copy</button></div>
            <div><span className="font-medium">sha256Hex:</span> <span className="break-all">{result.sha256Hex}</span></div>
            {result.txHash && <div><span className="font-medium">tx:</span> <a className="text-blue-600 underline" href={result.explorerUrl} target="_blank" rel="noreferrer">{result.txHash}</a></div>}
            {result.downloadPath && (
              <div>
                <button className="btn-primary" onClick={doDownload}>Download PDF</button>
                <span className="text-xs text-gray-500 ml-2">(secure download via server)</span>
              </div>
            )}
            {!result.downloadPath && result.downloadUrl && typeof result.downloadUrl === 'string' && result.downloadUrl.startsWith('http') && (
              <div>
                <a className="btn-secondary" href={result.downloadUrl} target="_blank" rel="noreferrer">Open File</a>
              </div>
            )}
            <div className="text-xs text-gray-500">Keep the docId for verification.</div>
          </div>
        )}
      </div>
    </div>
  );
}
