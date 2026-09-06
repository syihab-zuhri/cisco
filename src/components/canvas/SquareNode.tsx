import { useRef } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Square, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { type DeviceData } from '../../types/network';

/** Preset warna square (isi semi-transparan + border solid). */
export const SQUARE_SWATCHES: Array<{ fill: string; stroke: string; name: string }> = [
  { fill: 'rgba(59,130,246,0.16)', stroke: '#3B82F6', name: 'Biru' },
  { fill: 'rgba(16,185,129,0.16)', stroke: '#10B981', name: 'Hijau' },
  { fill: 'rgba(245,158,11,0.16)', stroke: '#F59E0B', name: 'Kuning' },
  { fill: 'rgba(239,68,68,0.14)', stroke: '#EF4444', name: 'Merah' },
  { fill: 'rgba(168,85,247,0.14)', stroke: '#A855F7', name: 'Ungu' },
  { fill: 'rgba(148,163,184,0.14)', stroke: '#94A3B8', name: 'Abu' },
];

/**
 * Square custom di BELAKANG perangkat (zIndex -1): untuk mengelompokkan /
 * menandai area topologi. Resize lewat handle kanan-bawah; warna dipilih
 * lewat swatch saat kotak dipilih; ✕ menghapus.
 */
export function SquareNode({ id, data, selected }: NodeProps) {
  const shape = data as unknown as DeviceData;
  const { updateAnnotation, deleteNode } = useAppStore();
  const { getZoom } = useReactFlow();
  const resizingRef = useRef(false);

  const width = shape.width ?? 260;
  const height = shape.height ?? 160;
  const fill = shape.fill ?? SQUARE_SWATCHES[0].fill;
  const stroke = shape.stroke ?? SQUARE_SWATCHES[0].stroke;

  const onResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;
    const zoom = getZoom() || 1;

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = Math.max(90, Math.round(startW + (ev.clientX - startX) / zoom));
      const h = Math.max(70, Math.round(startH + (ev.clientY - startY) / zoom));
      updateAnnotation(id, { width: w, height: h });
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      style={{ width, height, background: fill, borderColor: stroke }}
      className={`relative rounded-xl border-2 transition-shadow ${selected ? 'shadow-lg' : ''}`}
    >
      {/* Handles tak terlihat — square tidak menyambung kabel */}
      <Handle type="source" position={Position.Top} id="sq-src" className="!opacity-0 !w-1 !h-1 !border-0" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="sq-tgt" className="!opacity-0 !w-1 !h-1 !border-0" isConnectable={false} />

      {/* Label kecil di pojok saat dipilih */}
      {selected && (
        <div className="absolute -top-7 left-0 flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded bg-[#111827] border border-[#374151] px-1.5 py-0.5 text-[10px] text-gray-300 shadow-md">
            <Square className="h-3 w-3" style={{ color: stroke }} />
            Square
          </span>
        </div>
      )}

      {/* Panel kustomisasi saat dipilih: swatch warna + hapus */}
      {selected && (
        <div className="absolute -top-7 right-0 flex items-center gap-1 rounded bg-[#111827] border border-[#374151] px-1.5 py-1 shadow-md">
          {SQUARE_SWATCHES.map((s) => (
            <button
              key={s.name}
              title={`Warna ${s.name}`}
              onClick={(e) => {
                e.stopPropagation();
                updateAnnotation(id, { fill: s.fill, stroke: s.stroke });
              }}
              className={`h-3.5 w-3.5 rounded-full border ${
                fill === s.fill ? 'ring-2 ring-white/80' : 'border-gray-600'
              }`}
              style={{ background: s.fill, borderColor: s.stroke }}
            />
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            title="Hapus square"
            aria-label="Hapus square"
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-950/80 text-red-300 hover:bg-red-600 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Resize handle kanan-bawah */}
      {selected && (
        <div
          onMouseDown={onResizeStart}
          title="Tarik untuk mengubah ukuran"
          className="nodrag nopan absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-br-xl border-r-2 border-b-2"
          style={{ borderColor: stroke }}
        />
      )}
    </div>
  );
}
