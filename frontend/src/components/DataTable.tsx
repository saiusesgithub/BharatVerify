import React from 'react';

type Props<T> = {
  rows: T[];
  columns: { key: keyof T | string; header: string; render?: (row: T) => React.ReactNode }[];
  empty?: string;
};

export function DataTable<T extends Record<string, any>>({ rows, columns, empty }: Props<T>) {
  if (!rows.length) return <div className="card">{empty || 'No data'}</div>;
  return (
    <div className="overflow-x-auto card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left">
            {columns.map((c) => (
              <th key={String(c.key)} className="px-3 py-2 font-semibold">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-t border-gray-200 dark:border-gray-800">
              {columns.map((c) => (
                <td key={String(c.key)} className="px-3 py-2 align-top">{c.render ? c.render(r) : String(r[c.key as keyof T])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

