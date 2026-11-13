import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHlc, HlcClock, parseHlc, receiveHlc, tickHlc } from "../src/sync/hlc.ts";

const A = "device-a";

test("format/parse round-trips and string order matches time order", () => {
  const h = { wallMs: 1_760_000_000_000, counter: 7, node: "0190a0a0-0000-7000-8000-000000000001" };
  assert.deepEqual(parseHlc(formatHlc(h)), h);
  const earlier = formatHlc({ wallMs: 999, counter: 999, node: "z" });
  const later = formatHlc({ wallMs: 1000, counter: 0, node: "a" });
  assert.ok(earlier < later);
  assert.throws(() => parseHlc("not-a-clock"));
});

test("local ticks never go backwards, even if the wall clock does", () => {
  let h = { wallMs: 0, counter: 0, node: A };
  h = tickHlc(h, 100);
  assert.deepEqual(h, { wallMs: 100, counter: 0, node: A });
  h = tickHlc(h, 100);
  assert.deepEqual(h, { wallMs: 100, counter: 1, node: A });
  h = tickHlc(h, 50); // clock stepped back
  assert.deepEqual(h, { wallMs: 100, counter: 2, node: A });
  h = tickHlc(h, 200);
  assert.deepEqual(h, { wallMs: 200, counter: 0, node: A });
});

test("receiving a remote timestamp orders later local writes after it", () => {
  const local = { wallMs: 100, counter: 3, node: A };
  assert.deepEqual(receiveHlc(local, { wallMs: 500, counter: 2, node: "b" }, 120), { wallMs: 500, counter: 3, node: A });
  assert.deepEqual(receiveHlc(local, { wallMs: 100, counter: 9, node: "b" }, 90), { wallMs: 100, counter: 10, node: A });
  assert.deepEqual(receiveHlc(local, { wallMs: 50, counter: 9, node: "b" }, 90), { wallMs: 100, counter: 4, node: A });
  assert.deepEqual(receiveHlc(local, { wallMs: 50, counter: 9, node: "b" }, 900), { wallMs: 900, counter: 0, node: A });
});

test("a clock seeded with the last stored timestamp stays ahead of it", () => {
  const stored = formatHlc({ wallMs: 5_000, counter: 4, node: "other" });
  const clock = new HlcClock(A, stored, () => 1_000);
  const next = clock.now();
  assert.ok(next > stored);
  assert.ok(clock.now() > next);
  assert.equal(parseHlc(next).node, A);
});
