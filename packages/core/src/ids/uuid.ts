// Row identifiers. Every synced row gets a UUID so that rows created on different devices
// never collide. Random rows use UUIDv7 (time-ordered, so `ORDER BY id` is roughly
// creation order); rows whose identity is defined by something else (built-in service
// types, per-vehicle interval overrides) use deterministic UUIDv5 so every device derives
// the same id independently.

/** Fills a buffer of `length` cryptographically secure random bytes. */
export type RandomBytes = (length: number) => Uint8Array;

function webCryptoRandom(length: number): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) {
    throw new Error("No secure random source available; call setRandomSource() at startup.");
  }
  return c.getRandomValues(new Uint8Array(length));
}

let randomSource: RandomBytes = webCryptoRandom;

/** Replaces the random source (React Native passes expo-crypto's getRandomBytes). */
export function setRandomSource(source: RandomBytes): void {
  randomSource = source;
}

/** Namespaces for deterministic ids. Never change these: ids derived from them are persisted. */
export const ID_NAMESPACES = {
  builtinServiceType: "19a1b14e-2ce9-44cd-9aa2-7883bba75f69",
  intervalOverride: "1d2a5110-fb3f-4064-a951-4802026e86b9",
  builtinField: "468f311e-1f4d-4040-a391-9a05b40eefbb",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function fromHex(uuid: string): Uint8Array {
  if (!isUuid(uuid)) throw new Error(`Not a UUID: ${uuid}`);
  const hex = uuid.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** RFC 9562 UUIDv7: 48-bit Unix ms timestamp followed by 74 random bits. */
export function uuidv7(nowMs: number = Date.now(), random: RandomBytes = randomSource): string {
  const bytes = new Uint8Array(16);
  bytes.set(random(10), 6);
  let ts = Math.floor(nowMs);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant
  return toHex(bytes);
}

/** RFC 9562 UUIDv5 (SHA-1 of namespace + UTF-8 name). */
export function uuidv5(name: string, namespace: string): string {
  const ns = fromHex(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns, 0);
  input.set(nameBytes, ns.length);
  const bytes = sha1(input).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant
  return toHex(bytes);
}

/** Id of a vehicle's interval override for a service type: one row per pair on every device. */
export function intervalOverrideId(vehicleId: string, serviceTypeId: string): string {
  return uuidv5(`${vehicleId}/${serviceTypeId}`, ID_NAMESPACES.intervalOverride);
}

// Plain SHA-1, only used for UUIDv5 (React Native has no synchronous digest API).
function sha1(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(message);
  data[message.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h));
  return out;
}
