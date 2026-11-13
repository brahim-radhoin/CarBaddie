import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ID_NAMESPACES, intervalOverrideId, isUuid, uuidv5, uuidv7 } from "../src/ids/uuid.ts";
import { builtinServiceTypeId, BUILTIN_SERVICE_TYPES, findBuiltinServiceTypeByName } from "../src/service-types/builtin.ts";

// Reference UUIDv5 built on node's SHA-1, to check the hand-written one.
function referenceUuidv5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

test("uuidv5 matches the RFC test vector and node's SHA-1", () => {
  // RFC 9562 appendix A.4: DNS namespace, "www.example.com".
  assert.equal(uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "2ed6657d-e927-568b-95e1-2665a8aea6a2");
  for (const name of ["", "oil-change", "a".repeat(200), "Pneus été ✓"]) {
    assert.equal(uuidv5(name, ID_NAMESPACES.builtinServiceType), referenceUuidv5(name, ID_NAMESPACES.builtinServiceType));
  }
});

test("uuidv7 encodes the timestamp, version and variant, and sorts by time", () => {
  const zeros = (n: number) => new Uint8Array(n);
  const id = uuidv7(0x0190_1234_5678, zeros);
  assert.equal(id, "01901234-5678-7000-8000-000000000000");
  assert.ok(isUuid(uuidv7()));
  assert.ok(uuidv7(1_000) < uuidv7(2_000));
  assert.notEqual(uuidv7(5), uuidv7(5));
});

test("built-in service types have unique slugs, names and stable ids", () => {
  const slugs = new Set(BUILTIN_SERVICE_TYPES.map((s) => s.slug));
  const names = new Set(BUILTIN_SERVICE_TYPES.map((s) => s.name));
  assert.equal(slugs.size, BUILTIN_SERVICE_TYPES.length);
  assert.equal(names.size, BUILTIN_SERVICE_TYPES.length);
  assert.equal(builtinServiceTypeId("oil-change"), builtinServiceTypeId("oil-change"));
  assert.equal(findBuiltinServiceTypeByName("  oil CHANGE ")?.slug, "oil-change");
  assert.equal(findBuiltinServiceTypeByName("Oil Change (synthetic)"), undefined);
});

test("interval override ids are derived from the vehicle and service type", () => {
  const v = uuidv7(1), st = uuidv7(2);
  assert.equal(intervalOverrideId(v, st), intervalOverrideId(v, st));
  assert.notEqual(intervalOverrideId(v, st), intervalOverrideId(st, v));
});
