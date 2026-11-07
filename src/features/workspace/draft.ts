import type { useAppStore } from '../../store/useAppStore';
import type { StarterTopology } from '../classroom/types';

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'openpacket_workspace_draft_v1';
type CanvasStore = Pick<typeof useAppStore, 'getState' | 'setState' | 'subscribe'>;

/** Work-only draft. Session storage isolates tabs and survives reload; it contains no identity tokens. */
export function startWorkspaceDraft(store: CanvasStore, storage: DraftStorage) {
  try {
    const raw = storage.getItem(KEY);
    const draft = raw ? JSON.parse(raw) : null;
    if (draft?.version === 1 && isWorkTopology(draft.topology)) {
      store.setState({ activeLabId: null });
      store.getState().loadTopology(draft.topology);
      // loadTopology repairs cable bindings; keep saved administrative shutdown states.
      const topology: StarterTopology = draft.topology;
      const saved = new Map(topology.nodes.map((n) => [n.id, n]));
      store.setState((state) => ({
        nodes: state.nodes.map((n) => ({ ...n, data: { ...n.data, ports: n.data.ports.map((p) => ({
          ...p, status: saved.get(n.id)?.data.ports.find((s) => s.id === p.id)?.status ?? p.status,
        })) } })),
        activeLabId: typeof draft.activeLabId === 'string' ? draft.activeLabId : null,
        labCompleted: draft.labCompleted && typeof draft.labCompleted === 'object' ? draft.labCompleted : {},
        simulationStatus: 'idle', activePackets: [], simPlan: [], simPlayedUpTo: 0,
        activeConfigModalNodeId: null, activeCliModalNodeId: null,
      }));
    }
  } catch { /* A damaged/blocked draft must never prevent opening the app. */ }

  const save = () => {
    const s = store.getState();
    try {
      storage.setItem(KEY, JSON.stringify({ version: 1, topology: workTopology(s), activeLabId: s.activeLabId, labCompleted: s.labCompleted }));
      return true;
    } catch { return false; }
  };
  let warned = false;
  const stop = store.subscribe((s, p) => {
    if (s.nodes === p.nodes && s.edges === p.edges && s.activeLabId === p.activeLabId && s.labCompleted === p.labCompleted) return;
    if (!save() && !warned) {
      warned = true;
      s.pushToast('warning', 'Draft belum tersimpan di tab ini. Ekspor topologi ke berkas sebelum memuat ulang.', 8000);
    }
  });
  return { save, stop };
}

export function workTopology(topology: StarterTopology): StarterTopology {
  return {
    nodes: topology.nodes.map(({ selected: _selected, dragging: _dragging, measured: _measured, ...node }) => node),
    edges: topology.edges.map(({ selected: _selected, ...edge }) => edge),
  };
}

export function isWorkTopology(raw: unknown): raw is StarterTopology {
  if (!raw || typeof raw !== 'object') return false;
  const t = raw as StarterTopology;
  return Array.isArray(t.nodes) && Array.isArray(t.edges) && t.nodes.every((n) =>
    n && typeof n.id === 'string' && n.data && typeof n.data.label === 'string' &&
    typeof n.data.type === 'string' && Array.isArray(n.data.ports) &&
    n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
  ) && t.edges.every((e) => e && typeof e.id === 'string' && typeof e.source === 'string' && typeof e.target === 'string');
}

let activeDraft: ReturnType<typeof startWorkspaceDraft> | undefined;
export function initWorkspaceDraft(store: CanvasStore) {
  activeDraft?.stop();
  try { activeDraft = startWorkspaceDraft(store, window.sessionStorage); }
  catch { store.getState().pushToast('warning', 'Penyimpanan draft tidak tersedia. Ekspor berkas untuk menyimpan pekerjaan.'); }
}
export function saveWorkspaceDraft() { return activeDraft?.save() ?? false; }
