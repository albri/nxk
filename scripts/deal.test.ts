import assert from "node:assert/strict";
import test from "node:test";
import { AXES, deal } from "./deal.ts";

test("deal uses every option of every part when there are enough combinations, and is the same for the same seed", () => {
  const axes = { who: ["a", "b", "c", "d", "e", "f"], ...AXES };
  const hands = deal(axes, 6, 3);
  for (const [part, options] of Object.entries(axes))
    for (const option of options)
      assert.ok(
        hands.some((hand) => hand[part] === option),
        `${part}: ${option} never dealt`,
      );
  assert.deepEqual(deal(axes, 6, 3), hands);
  assert.notDeepEqual(deal(axes, 6, 4), hands);
});

test("deal spreads pairs: no two combinations share more than half their options", () => {
  const hands = deal({ who: ["a", "b", "c", "d"], ...AXES }, 8, 1);
  for (let i = 0; i < hands.length; i++)
    for (let j = i + 1; j < hands.length; j++) {
      const same = Object.keys(hands[i]).filter((part) => hands[i][part] === hands[j][part]).length;
      assert.ok(same <= 3, `combinations ${i + 1} and ${j + 1} share ${same} of 6`);
    }
});
