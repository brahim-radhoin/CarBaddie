// Hybrid logical clock. Every write stamps its row's `updated_at` with one of these, and
// sync (roadmap step 5) resolves conflicts by last-writer-wins on that value.
//
// Serialised as `<wall ms, 15 digits>-<counter, 6 digits>-<node id>` so that plain string
// comparison orders timestamps correctly (SQLite `MAX(updated_at)` and `<` just work).
// The node id breaks ties between devices that write in the same ms with the same counter.

export interface Hlc {
  wallMs: number;
  counter: number;
  node: string;
}

const WALL_DIGITS = 15;
const COUNTER_DIGITS = 6;
const MAX_COUNTER = 10 ** COUNTER_DIGITS - 1;

export function formatHlc(hlc: Hlc): string {
  if (hlc.counter > MAX_COUNTER) throw new Error("HLC counter overflow");
  return `${String(hlc.wallMs).padStart(WALL_DIGITS, "0")}-${String(hlc.counter).padStart(COUNTER_DIGITS, "0")}-${hlc.node}`;
}

export function parseHlc(value: string): Hlc {
  const match = /^(\d{15})-(\d{6})-(.+)$/.exec(value);
  if (!match) throw new Error(`Invalid HLC timestamp: ${value}`);
  return { wallMs: Number(match[1]), counter: Number(match[2]), node: match[3] };
}

/** Next timestamp for a local event. */
export function tickHlc(prev: Hlc, nowMs: number): Hlc {
  const wallMs = Math.max(prev.wallMs, nowMs);
  return { wallMs, counter: wallMs === prev.wallMs ? prev.counter + 1 : 0, node: prev.node };
}

/** Next timestamp after seeing a remote one, so later local writes order after it. */
export function receiveHlc(prev: Hlc, remote: Hlc, nowMs: number): Hlc {
  const wallMs = Math.max(prev.wallMs, remote.wallMs, nowMs);
  let counter: number;
  if (wallMs === prev.wallMs && wallMs === remote.wallMs) counter = Math.max(prev.counter, remote.counter) + 1;
  else if (wallMs === prev.wallMs) counter = prev.counter + 1;
  else if (wallMs === remote.wallMs) counter = remote.counter + 1;
  else counter = 0;
  return { wallMs, counter, node: prev.node };
}

/** A device's clock. Seed it with the highest timestamp already stored so it never goes back. */
export class HlcClock {
  private last: Hlc;
  private readonly wallClock: () => number;

  // No parameter properties: node's type stripping (used by the tests) can't handle them.
  constructor(node: string, lastSeen: string | null = null, wallClock: () => number = Date.now) {
    this.wallClock = wallClock;
    this.last = { wallMs: 0, counter: 0, node };
    if (lastSeen) this.observe(lastSeen);
  }

  /** Timestamp for a local write. */
  now(): string {
    this.last = tickHlc(this.last, this.wallClock());
    return formatHlc(this.last);
  }

  /** Merge a timestamp that came from storage or another device. */
  observe(remote: string): void {
    this.last = receiveHlc(this.last, parseHlc(remote), this.wallClock());
  }
}
