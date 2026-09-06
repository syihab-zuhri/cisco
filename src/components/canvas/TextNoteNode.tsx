import { useEffect, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Minus, Plus, Type, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { type DeviceData } from '../../types/network';

/**
 * Teks custom di kanvas: dobel-klik untuk mengedit isi; saat dipilih ada
 * kontrol ukuran font (−/+) dan ✕ hapus. Render DI ATAS perangkat (zIndex 10).
 */
export function TextNoteNode({ id, data, selected }: NodeProps) {
  const note = data as unknown as DeviceData;
  const { updateAnnotation, deleteNode } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const fontSize = note.fontSize ?? 14;
  const text = note.text ?? '';

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    updateAnnotation(id, { text: draft.trim() || 'Catatan' });
    setEditing(false);
  };

  const changeFont = (delta: number) => {
    const next = Math.min(32, Math.max(10, fontSize + delta));
    updateAnnotation(id, { fontSize: next });
  };

  return (
    <div className="relative select-none" onDoubleClick={(e) => { e.stopPropagation(); setDraft(text); setEditing(true); }}>
      {/* Handles tak terlihat */}
      <Handle type="source" position={Position.Top} id="txt-src" className="!opacity-0 !w-1 !h-1 !border-0" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="txt-tgt" className="!opacity-0 !w-1 !h-1 !border-0" isConnectable={false} />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{ fontSize }}
          className="nodrag nopan min-w-[120px] rounded border-2 border-blue-500 bg-black/70 px-1.5 py-0.5 text-gray-100 outline-none"
        />
      ) : (
        <div
          style={{ fontSize }}
          className={`whitespace-pre-wrap px-1 py-0.5 font-semibold leading-snug ${
            selected
              ? 'rounded border-2 border-dashed border-blue-500/70 bg-blue-500/5'
              : 'border-2 border-transparent'
          } text-gray-100`}
        >
          {text || 'Catatan'}
        </div>
      )}

      {/* Panel kontrol saat dipilih */}
      {selected && !editing && (
        <div className="absolute -top-7 left-0 flex items-center gap-1 rounded bg-[#111827] border border-[#374151] px-1.5 py-1 shadow-md">
          <span className="flex items-center gap-1 text-[10px] text-gray-300 pr-0.5">
            <Type className="h-3 w-3 text-blue-400" />
            {fontSize}px
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); changeFont(-2); }}
            title="Perkecil font"
            className="flex h-4 w-4 items-center justify-center rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); changeFont(2); }}
            title="Perbesar font"
            className="flex h-4 w-4 items-center justify-center rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
          >
            <Plus className="h-3 w-3" />
          </button>
          <span className="mx-0.5 h-3 w-px bg-gray-700" />
          <button
            onClick={(e) => { e.stopPropagation(); setDraft(text); setEditing(true); }}
            title="Edit teks"
            className="rounded px-1 text-[10px] text-blue-300 hover:bg-gray-700 hover:text-white"
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
            title="Hapus teks"
            aria-label="Hapus teks"
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-950/80 text-red-300 hover:bg-red-600 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
