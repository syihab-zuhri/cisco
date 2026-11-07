import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

/** One hop, one flight. Playback controls share the same state as the Worker. */
export function PacketAnimation({ path, color, forward }: { path: string; color: string; forward: boolean }) {
  const status = useAppStore((s) => s.simulationStatus);
  const speed = useAppStore((s) => s.simulationSpeed);
  const stepMode = useAppStore((s) => s.stepMode);
  const pathRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<SVGGElement>(null);
  const progress = useRef(0);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReduced(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  useLayoutEffect(() => {
    const line = pathRef.current;
    const marker = markerRef.current;
    if (!line || !marker) return;
    const length = line.getTotalLength();
    const paint = () => {
      const distance = forward ? progress.current : 1 - progress.current;
      const point = line.getPointAtLength(length * distance);
      marker.setAttribute('transform', `translate(${point.x} ${point.y})`);
    };
    if (stepMode || reduced) progress.current = 1;
    paint();
    if (status === 'paused' || stepMode || reduced || progress.current >= 1) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      progress.current = Math.min(1, progress.current + (now - last) * speed / 800);
      last = now;
      paint();
      if (progress.current < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [path, forward, status, speed, stepMode, reduced]);

  return <g className="pointer-events-none" aria-hidden="true">
    <path ref={pathRef} d={path} fill="none" stroke="none" />
    <g ref={markerRef}>
      <circle r="7" fill={color} />
      <rect x="-11" y="-8" width="22" height="16" rx="3" fill="var(--surface)" stroke={color} strokeWidth="2" />
      <path d="M-9 -6 L0 1 L9 -6" fill="none" stroke={color} strokeWidth="1.5" />
    </g>
  </g>;
}
