import React from 'react';

export function FileDrop({ onFile }: { onFile: (f: File) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      ref={ref}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded-lg p-6 text-center ${drag ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-gray-300 dark:border-gray-700'}`}
    >
      <p className="mb-2">Drag & Drop PDF/PNG/JPG here</p>
      <p className="text-xs text-gray-500">or click to choose</p>
      <input aria-label="file-picker" className="hidden" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
      }} />
    </div>
  );
}

