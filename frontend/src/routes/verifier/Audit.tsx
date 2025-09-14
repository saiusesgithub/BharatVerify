import React from 'react';
import { api } from '../../api/client';
import { DataTable } from '../../components/DataTable';

export function VerifierAudit() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [offset, setOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.audit(20, offset);
      setRows(res.items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); }, [offset]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity (Audit)</h2>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setOffset(Math.max(0, offset - 20))}>Prev</button>
          <button className="btn-secondary" onClick={() => setOffset(offset + 20)}>Next</button>
        </div>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading ? <div className="card">Loading…</div> : (
        <DataTable rows={rows} columns={[
          { key: 'createdAt', header: 'Time', render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: 'action', header: 'Action' },
          { key: 'refId', header: 'docId' },
          { key: 'role', header: 'Role' },
          { key: 'details', header: 'Details', render: (r) => <details><summary>view</summary><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(r.details, null, 2)}</pre></details> }
        ]} />
      )}
    </div>
  );
}

