import { type SimEvent } from '../types/protocol';

/**
 * Discrete-event queue scheduler (ARCHITECTURE.md §5): antrean FIFO berbatas
 * 500 event (batas skalabilitas blueprint). Aliran simulasi dipakai gaya
 * "plan-then-playback": seluruh event direncanakan lebih dulu (deterministik),
 * lalu diputar oleh worker dengan pacing/pause/step.
 */
export const MAX_QUEUE_EVENTS = 500;

export class SimEventQueue {
  private items: SimEvent[] = [];

  public push(event: SimEvent): boolean {
    if (this.items.length >= MAX_QUEUE_EVENTS) return false;
    this.items.push(event);
    return true;
  }

  public pop(): SimEvent | undefined {
    return this.items.shift();
  }

  public peek(): SimEvent | undefined {
    return this.items[0];
  }

  public get size(): number {
    return this.items.length;
  }

  public get isFull(): boolean {
    return this.items.length >= MAX_QUEUE_EVENTS;
  }

  public snapshot(): SimEvent[] {
    return [...this.items];
  }

  public clear(): void {
    this.items = [];
  }
}
