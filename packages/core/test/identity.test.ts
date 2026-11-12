import { test } from "node:test";
import assert from "node:assert/strict";
import { vehicleIdentityKey } from "../src/vehicles/identity.ts";

test("ignores case and surrounding whitespace", () => {
  assert.equal(vehicleIdentityKey(" Ford ", "FIESTA", 2003), vehicleIdentityKey("ford", "fiesta", 2003));
});

test("year is part of the identity", () => {
  assert.notEqual(vehicleIdentityKey("Ford", "Fiesta", 2003), vehicleIdentityKey("Ford", "Fiesta", null));
});

test("handles missing values", () => {
  assert.equal(vehicleIdentityKey(null, undefined, undefined), "||");
});
