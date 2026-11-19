import { test } from "node:test";
import assert from "node:assert/strict";
import { openRepository } from "../src/db/open.ts";
import { drawableBodyType, guessBodyType, isBodyTypeId } from "../src/vehicles/body-types.ts";
import { splitGarage } from "../src/vehicles/garage.ts";
import { groupByZone, zoneStatus } from "../src/maintenance/zones.ts";
import { BUILTIN_SERVICE_TYPES } from "../src/service-types/builtin.ts";
import { ZONE_OF_SLUG } from "../src/maintenance/zones.ts";
import { ValidationError } from "../src/validation.ts";
import { encodeBackup, parseBackup } from "../src/backup/format.ts";
import { BODY_TYPES } from "../src/vehicles/body-types.ts";
import { FRAME, SILHOUETTES } from "../src/vehicles/silhouettes.ts";
import { openTestDb } from "./helpers/sqlite.ts";

let wall = 1_785_000_000_000;
const clock = () => (wall += 5);
const open = () => openRepository(openTestDb(), clock);

// ── the deck ────────────────────────────────────────────────────────────────────────────────

const v = (id: string, is_favorite?: boolean | null) => ({ id, is_favorite });

test("unset vehicles fill the free deck places in creation order", () => {
  const { deck, others } = splitGarage([v("e"), v("a"), v("d"), v("b"), v("c")]);
  assert.deepEqual(deck.map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(others.map((x) => x.id), ["d", "e"]);
});

test("a chosen favourite takes a place, an unfavourited vehicle leaves the deck", () => {
  const { deck, others } = splitGarage([v("a"), v("b", false), v("c"), v("d"), v("e", true)]);
  assert.deepEqual(deck.map((x) => x.id), ["a", "c", "e"]);
  assert.deepEqual(others.map((x) => x.id), ["b", "d"]);
});

test("the deck is never empty while a vehicle exists", () => {
  const { deck, others } = splitGarage([v("b", false), v("a", false)]);
  assert.deepEqual(deck.map((x) => x.id), ["a"]);
  assert.deepEqual(others.map((x) => x.id), ["b"]);
  assert.deepEqual(splitGarage([]), { deck: [], others: [] });
});

test("two devices with the same vehicles see the same deck, whatever order they list them in", () => {
  const list = [v("d"), v("a"), v("c", true), v("b", false), v("e")];
  const one = splitGarage(list);
  const two = splitGarage([...list].reverse());
  assert.deepEqual(one.deck.map((x) => x.id), two.deck.map((x) => x.id));
  assert.deepEqual(one.others.map((x) => x.id), two.others.map((x) => x.id));
});

// ── body type ───────────────────────────────────────────────────────────────────────────────

test("body type: known as stored, unknown or unset drawn from a guess, never rewritten", () => {
  assert.equal(drawableBodyType("motorbike", "Ford"), "motorbike");
  assert.equal(drawableBodyType("hovercraft", "Ford"), "car"); // from a newer app: drawn as the default
  assert.equal(drawableBodyType(null, "Arctic Cat"), "snowmobile");
  assert.equal(drawableBodyType(undefined, "Yamaha"), "motorbike");
  assert.equal(guessBodyType("Toyota"), "car");
  assert.ok(isBodyTypeId("car") && !isBodyTypeId("hovercraft"));
  for (const id of ["sedan", "estate", "coupe", "suv", "pickup"]) assert.equal(drawableBodyType(id, "Toyota"), id);
});

test("body type ids that have shipped stay (they are stored and synced), and every id is a valid stored value", () => {
  const ids = BODY_TYPES.map((t) => t.id as string);
  for (const shipped of ["car", "motorbike", "snowmobile", "sedan", "estate", "coupe", "suv", "pickup"]) assert.ok(ids.includes(shipped), shipped);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9_-]{0,39}$/);
});

test("every outline with wheels stands on the ground line, inside the frame", () => {
  for (const { id } of BODY_TYPES) {
    for (const w of SILHOUETTES[id].wheels) {
      assert.ok(Math.abs(w.cy + w.r - FRAME.groundY) <= 2, `${id}: tyre bottom ${w.cy + w.r}`);
      assert.ok(w.cx - w.r >= 30 && w.cx + w.r <= 302, `${id}: wheel outside the frame`);
    }
  }
});

test("a vehicle keeps a body type this app can't draw, and updates that don't mention it leave it alone", async () => {
  const { repo } = await open();
  const created = await repo.createVehicle({ make: "Ford", model: "Fiesta", body_type: "hovercraft", is_favorite: true });
  assert.equal(created.body_type, "hovercraft");
  assert.equal(created.is_favorite, true);

  const renamed = await repo.updateVehicle(created.id, { model: "Fiesta ST" });
  assert.equal(renamed.body_type, "hovercraft");
  assert.equal(renamed.is_favorite, true);

  const cleared = await repo.updateVehicle(created.id, { body_type: null, is_favorite: null });
  assert.equal(cleared.body_type, null);
  assert.equal(cleared.is_favorite, null);
});

test("new vehicles start with nothing chosen", async () => {
  const { repo } = await open();
  const created = await repo.createVehicle({ make: "Ford", model: "Fiesta" });
  assert.equal(created.body_type, null);
  assert.equal(created.is_favorite, null);
});

test("a body type is a short lowercase id when written", async () => {
  const { repo } = await open();
  await assert.rejects(repo.createVehicle({ make: "Ford", model: "Fiesta", body_type: "Not Valid!" }), ValidationError);
});

test("a favourite chosen on one device is on the deck of another", async () => {
  const a = await open();
  const created = await a.repo.createVehicle({ make: "Ford", model: "Fiesta", is_favorite: false, body_type: "car" });
  assert.equal(created.is_favorite, false);
  assert.deepEqual(splitGarage(await a.repo.getAllVehicles()).others.length, 0, "the only vehicle is promoted so the deck is not empty");
});

// ── backups ─────────────────────────────────────────────────────────────────────────────────

test("body type and favourite survive a backup, and backups from before them still load", async () => {
  const { repo } = await open();
  const created = await repo.createVehicle({ make: "Yamaha", model: "MT-07", body_type: "motorbike", is_favorite: true });
  const [vehicle] = await repo.getAllVehicles();
  const encoded = encodeBackup({ vehicles: [vehicle], serviceTypes: [], config: { vehicle_ids: [vehicle.id] }, exportedAt: new Date(0) });
  const back = parseBackup(JSON.parse(JSON.stringify(encoded)));
  assert.equal(back.vehicles[0].body_type, "motorbike");
  assert.equal(back.vehicles[0].is_favorite, true);
  assert.equal(created.id, vehicle.id);

  const old = JSON.parse(JSON.stringify(encoded));
  delete old.vehicles[0].body_type;
  delete old.vehicles[0].is_favorite;
  const loaded = parseBackup(old);
  assert.equal(loaded.vehicles[0].body_type, null);
  assert.equal(loaded.vehicles[0].is_favorite, null);
});

// ── zones ───────────────────────────────────────────────────────────────────────────────────

test("every built-in service type has a zone, and the ones named don't drift from the list", () => {
  for (const st of BUILTIN_SERVICE_TYPES) assert.ok(ZONE_OF_SLUG[st.slug], `${st.slug} has no zone`);
  for (const slug of Object.keys(ZONE_OF_SLUG)) assert.ok(BUILTIN_SERVICE_TYPES.some((st) => st.slug === slug), `${slug} is not a built-in`);
});

test("services go to the zone drawn, an alias, or other; whole-vehicle ones stay whole", () => {
  const svc = (slug: string | null, status: "Overdue" | "Upcoming" | "OK") => ({ slug, serviceTypeId: String(slug), name: String(slug), status, message: "" });
  const items = [
    svc("oil-change", "Overdue"),
    svc("headlight-bulb-replacement", "OK"),
    svc("cabin-air-filter-replacement", "OK"),
    svc("minor-service", "Upcoming"),
    svc(null, "Upcoming"),
    svc("tire-rotation", "Upcoming"),
  ];
  // A bike has no cabin; its headlight is its own spot.
  const bike = groupByZone(items, ["engine", "wheels", "lights"]);
  assert.deepEqual(bike.engine.map((s) => s.name), ["oil-change"]);
  assert.deepEqual(bike.lights.map((s) => s.name), ["headlight-bulb-replacement"]);
  assert.deepEqual(bike.cabin, []);
  assert.deepEqual(bike.other.map((s) => s.name).sort(), ["cabin-air-filter-replacement", "null"]);
  assert.deepEqual(bike.whole.map((s) => s.name), ["minor-service"]);
  // A car has no lights spot of its own; they go to the engine bay.
  const car = groupByZone(items, ["engine", "wheels", "underbody", "cabin"], { lights: "engine" });
  assert.deepEqual(car.engine.map((s) => s.name), ["oil-change", "headlight-bulb-replacement"]);
  assert.deepEqual(car.cabin.map((s) => s.name), ["cabin-air-filter-replacement"]);
});

test("a zone shows its worst status", () => {
  assert.equal(zoneStatus([{ status: "OK" }, { status: "Upcoming" }]), "soon");
  assert.equal(zoneStatus([{ status: "Upcoming" }, { status: "Overdue" }]), "overdue");
  assert.equal(zoneStatus([{ status: "OK" }, { status: "NeverDone" }]), "ok");
  assert.equal(zoneStatus([]), "ok");
});

// ── outlines ────────────────────────────────────────────────────────────────────────────────

test("every body type has an outline, and what it aliases is something it draws", () => {
  for (const { id } of BODY_TYPES) {
    const art = SILHOUETTES[id];
    assert.ok(art.outline.length > 20, id);
    const drawn = Object.keys(art.zones);
    assert.ok(drawn.length >= 2, id + " draws a few zones");
    for (const target of Object.values(art.alias)) assert.ok(drawn.includes(target as string), id + ": alias to a zone it does not draw");
    for (const alias of Object.keys(art.alias)) assert.ok(!drawn.includes(alias), id + ": " + alias + " is both drawn and aliased");
  }
});

test("every tap target is at least 46 units on a side (about 48dp on a card)", () => {
  for (const { id } of BODY_TYPES) {
    for (const [zone, z] of Object.entries(SILHOUETTES[id].zones)) {
      for (const hit of z!.hits) {
        const [w, h] = hit.shape === "rect" ? [hit.w, hit.h] : [hit.r * 2, hit.r * 2];
        assert.ok(w >= 46 && h >= 46, id + "/" + zone + " hit is " + w + "x" + h);
      }
    }
  }
});
