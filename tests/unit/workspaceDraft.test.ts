import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store/useAppStore';
import { startWorkspaceDraft } from '../../src/features/workspace/draft';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

beforeEach(() => useAppStore.getState().resetTopology());

describe('workspace recovery', () => {
  it('recovers configured devices after a page lifecycle without replaying simulation', () => {
    const storage = new MemoryStorage();
    const first = startWorkspaceDraft(useAppStore, storage);
    useAppStore.getState().addDevice('router', { x: 80, y: 90 });
    const id = useAppStore.getState().nodes[0].id;
    useAppStore.getState().updatePortConfig(id, 'fa0/0', { ipAddress: '10.1.2.1', subnetMask: '255.255.255.0', status: 'down' });
    useAppStore.getState().setSimulationStatus('running');
    first.stop();
    useAppStore.getState().resetTopology();
    const second = startWorkspaceDraft(useAppStore, storage);
    expect(useAppStore.getState().nodes[0].data.ports[0]).toMatchObject({ ipAddress: '10.1.2.1', status: 'down' });
    expect(useAppStore.getState().nodes[0].position).toEqual({ x: 80, y: 90 });
    expect(useAppStore.getState().simulationStatus).toBe('idle');
    expect(useAppStore.getState().activePackets).toEqual([]);
    second.stop();
  });

  it('persists an intentional reset rather than resurrecting deleted work', () => {
    const storage = new MemoryStorage();
    const draft = startWorkspaceDraft(useAppStore, storage);
    useAppStore.getState().addDevice('pc', { x: 0, y: 0 });
    useAppStore.getState().resetTopology();
    draft.stop();
    const restored = startWorkspaceDraft(useAppStore, storage);
    expect(useAppStore.getState().nodes).toEqual([]);
    restored.stop();
  });

  it('handles inaccessible storage and exposes a failed save', () => {
    const draft = startWorkspaceDraft(useAppStore, {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('full'); },
    });
    useAppStore.getState().addDevice('pc', { x: 0, y: 0 });
    expect(draft.save()).toBe(false);
    expect(useAppStore.getState().nodes).toHaveLength(1);
    draft.stop();
  });

  it('preserves annotation layering when the draft is recovered', () => {
    const storage = new MemoryStorage();
    const first = startWorkspaceDraft(useAppStore, storage);
    useAppStore.getState().addSquare({ x: 1, y: 2 });
    useAppStore.getState().addText({ x: 3, y: 4 });
    first.stop();
    useAppStore.getState().resetTopology();
    const restored = startWorkspaceDraft(useAppStore, storage);
    expect(useAppStore.getState().nodes.map((n) => n.zIndex)).toEqual([-1, 10]);
    restored.stop();
  });
});
