import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeHtml, textOf } from "./html.ts";

const page = (body: string, head = "") =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;

test("a page is read as its words; anything else as it is", () => {
  assert.equal(looksLikeHtml(page("<p>Hi</p>")), true);
  assert.equal(
    looksLikeHtml("Dear customer,\n\nFrom 1 April your plan costs £32 a month, up from £28 (5 < 6)."),
    false,
  );
  assert.equal(textOf(page('<p>one two</p><script>var a="x"</script><style>p{}</style>three')), "one two three");
});
