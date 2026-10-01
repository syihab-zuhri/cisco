import { useRef } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { Square, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { type DeviceData } from '../../types/network';

/**
 * Preset warna square (isi semi-transparan + border solid). Berupa literal,
 * bukan var(--...), karena nilainya disimpan ke JSON topologi. Luminans stroke
 * sengaja di tengah (≥ 3 : 1 di atas kanvas krem MAUPUN kanvas gelap) supaya
 * zona tetap terbaca di kedua mode tema.
 */
export const SQUARE_SWATCHES: Array<{ fill: string; stroke: string; name: string }> = [
  { fill: 'rgba(59,130,246,0.14)', stroke: '#3B82F6', name: 'Biru' },
  { fill: 'rgba(30,154,90,0.14)', stroke: '#1E9A5A', name: 'Hijau' },
  { fill: 'rgba(176,127,16,0.16)', stroke: '#B07F10', name: 'Kuning' },
  { fill: 'rgba(226,74,74,0.12)', stroke: '#E24A4A', name: 'Merah' },
  { fill: 'rgba(139,92,246,0.14)', stroke: '#8B5CF6', name: 'Ungu' },
  { fill: 'rgba(124,138,165,0.14)', stroke: '#7C8AA5', name: 'Abu' },
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
          <span className="flex items-center gap-1 rounded bg-popover border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-md">
            <Square className="h-3 w-3" style={{ color: stroke }} />
            Square
          </span>
        </div>
      )}

      {/* Panel kustomisasi saat dipilih: swatch warna + hapus */}
      {selected && (
        <div className="absolute -top-7 right-0 flex items-center gap-1 rounded bg-popover border border-border px-1.5 py-1 shadow-md">
          {SQUARE_SWATCHES.map((s) => (
            <button
              key={s.name}
              title={`Warna ${s.name}`}
              onClick={(e) => {
                e.stopPropagation();
                updateAnnotation(id, { fill: s.fill, stroke: s.stroke });
              }}
              className={`h-3.5 w-3.5 rounded-full border ${
                fill === s.fill ? 'ring-2 ring-primary/80' : 'border-border'
              }`}
              style={{ background: s.fill, borderColor: s.stroke }}
            />
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            title="Hapus Square"
            aria-label="Hapus Square"
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-viz-red/10 text-viz-red hover:bg-viz-red hover:text-on-viz"
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
