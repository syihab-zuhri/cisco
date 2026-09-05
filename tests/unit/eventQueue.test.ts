import { describe, it, expect } from 'vitest';
import { SimEventQueue, MAX_QUEUE_EVENTS } from '../../src/engine/eventQueue';
import { type SimEvent } from '../../src/types/protocol';

function makeEvent(seq: number): SimEvent {
  return { seq, simTimeMs: seq, kind: 'LOG', level: 'INFO', message: `e${seq}` };
}

describe('SimEventQueue (batas 500 event sesuai blueprint)', () => {
  it('FIFO dengan snapshot salinan', () => {
    const q = new SimEventQueue();
    q.push(makeEvent(1));
    q.push(makeEvent(2));
    expect(q.size).toBe(2);
    expect(q.peek()?.seq).toBe(1);
    expect(q.pop()?.seq).toBe(1);
    expect(q.pop()?.seq).toBe(2);
    expect(q.size).toBe(0);
  });

  it('menolak push ke-501 dan menandai penuh', () => {
    const q = new SimEventQueue();
    for (let i = 1; i <= MAX_QUEUE_EVENTS; i++) {
      expect(q.push(makeEvent(i))).toBe(true);
    }
    expect(q.isFull).toBe(true);
    expect(q.push(makeEvent(MAX_QUEUE_EVENTS + 1))).toBe(false);
    expect(q.size).toBe(MAX_QUEUE_EVENTS);
  });
});
