import { test } from "node:test";
import assert from "node:assert/strict";
import { PICKS } from "../picks.ts";

test("PICKS has the 10 default founder tools", () => {
  assert.equal(PICKS.length, 10);
  const names = PICKS.map((p) => p.name);
  for (const expected of [
    "Claude", "Notion", "Linear", "Vercel", "Stripe",
    "Supabase", "Figma", "GitHub", "Product Hunt", "Y Combinator",
  ]) {
    assert.ok(names.includes(expected), `missing pick: ${expected}`);
  }
});

test("PICKS ids are unique and urls are https with non-empty taglines", () => {
  const ids = new Set(PICKS.map((p) => p.id));
  assert.equal(ids.size, PICKS.length, "duplicate id");
  for (const p of PICKS) {
    assert.match(p.url, /^https:\/\/.+/, `bad url for ${p.id}: ${p.url}`);
    assert.ok(p.tagline.trim().length > 0, `empty tagline for ${p.id}`);
  }
});
