import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACCENTS, PALETTES, accentColor, isAccentId, isThemeMode, type ColorScheme, type Palette } from "../src/theme.ts";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const schemes: ColorScheme[] = ["light", "dark"];

test("text and status colours reach 4.5:1 on every surface they sit on", () => {
  for (const scheme of schemes) {
    const p = PALETTES[scheme];
    for (const surface of [p.background, p.card, p.raised]) {
      for (const name of ["text", "textSecondary", "textMuted", "danger", "warn", "ok"] as const) {
        assert.ok(contrast(p[name], surface) >= 4.5, `${scheme}: ${name} ${p[name]} on ${surface} is ${contrast(p[name], surface).toFixed(2)}`);
      }
    }
    assert.ok(contrast(p.onPrimary, p.primary) >= 4.5, `${scheme}: onPrimary on primary`);
    // A danger button: the dark text/white pair has to read on the danger fill too.
    const onDanger = scheme === "light" ? "#fafafa" : "#121213";
    assert.ok(contrast(onDanger, p.danger) >= 4.5, `${scheme}: text on a danger button`);
  }
});

test("every accent reads at 4.5:1 on cards and backgrounds in its scheme", () => {
  for (const scheme of schemes) {
    const p = PALETTES[scheme];
    for (const a of ACCENTS) {
      for (const surface of [p.background, p.card]) {
        assert.ok(contrast(a[scheme], surface) >= 4.5, `${a.id} ${scheme}: ${contrast(a[scheme], surface).toFixed(2)}`);
      }
    }
  }
});

test("accent helpers", () => {
  assert.equal(accentColor("blue", "dark"), "#60a5fa");
  assert.equal(accentColor("nope" as never, "light"), ACCENTS[0].light);
  assert.ok(isAccentId("rose") && !isAccentId("indigo"));
  assert.ok(isThemeMode("system") && !isThemeMode("auto"));
});

// ── The desktop stylesheet must carry exactly these values ──────────────────────────────────

const css = readFileSync(new URL("../../../apps/desktop/src/index.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** Custom properties declared in the block that starts at `selector {`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `index.css has no ${selector} block`);
  const end = css.indexOf("\n}", start);
  const vars = new Map<string, string>();
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) vars.set(m[1], m[2].replace(/\s+/g, "").toLowerCase());
  return vars;
}

const CSS_NAME: Partial<Record<keyof Palette, string>> = {
  background: "background",
  card: "card",
  raised: "secondary",
  border: "border",
  text: "foreground",
  textSecondary: "foreground-secondary",
  textMuted: "muted-foreground",
  primary: "primary",
  onPrimary: "primary-foreground",
  danger: "destructive",
  warn: "warn",
  ok: "ok",
};

test("desktop index.css matches the shared palette (light and dark)", () => {
  for (const [scheme, selector] of [["light", ":root"], ["dark", ".dark"]] as const) {
    const vars = block(selector);
    for (const [key, cssName] of Object.entries(CSS_NAME)) {
      const expected = PALETTES[scheme][key as keyof Palette].replace(/\s+/g, "").toLowerCase();
      assert.equal(vars.get(cssName!), expected, `${selector} --${cssName} should be ${expected} (palette.${key})`);
    }
    for (const a of ACCENTS) {
      assert.equal(vars.get(`accent-${a.id}`), a[scheme], `${selector} --accent-${a.id}`);
    }
  }
});
