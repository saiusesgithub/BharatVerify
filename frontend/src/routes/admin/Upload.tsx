import React from 'react';
import { FileDrop } from '../../components/FileDrop';
import { api } from '../../api/client';

export function AdminUpload() {
  const [file, setFile] = React.useState<File | null>(null);
  const [meta, setMeta] = React.useState({ kind: 'transcript', studentRef: '', notes: '' });
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<{ id: string; hash: string; signature: string } | null>(null);
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
      const payload = { kind: meta.kind, studentRef: meta.studentRef, notes: meta.notes };
      const res = await api.uploadCertificate(payload, file, (pct) => setProgress(pct));
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
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
          <label className="label">Kind</label>
          <select className="input" value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })}>
            <option value="transcript">Transcript</option>
            <option value="degree">Degree</option>
            <option value="certificate">Certificate</option>
          </select>
        </div>
        <div className="mb-3">
          <label className="label">Student Ref</label>
          <input className="input" value={meta.studentRef} onChange={(e) => setMeta({ ...meta, studentRef: e.target.value })} required />
        </div>
        <div className="mb-4">
          <label className="label">Notes</label>
          <textarea className="input" rows={4} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
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
            <div><span className="font-medium">docId:</span> {result.id} <button className="btn-secondary ml-2" onClick={() => navigator.clipboard.writeText(result.id)}>Copy</button></div>
            <div><span className="font-medium">hash:</span> <span className="break-all">{result.hash}</span></div>
            <div className="text-xs text-gray-500">Keep the docId for verification.</div>
          </div>
        )}
      </div>
    </div>
  );
}

