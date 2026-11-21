import assert from "node:assert/strict";
import { mkdtemp, utimes, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadCatalogue } from "./personagen-catalogue.ts";

const CATALOGUE = JSON.stringify({
  groups: [
    { group: "home_and_travel", fields: [{ name: "home_tenure", values: [{ code: "owned_outright", share: "33%" }] }] },
  ],
});

test("the catalogue is fetched once, then served from the cache and revalidated by ETag", async () => {
  let version = "a";
  const seen: string[] = [];
  const server = createServer((request, response) => {
    seen.push(request.headers["if-none-match"] ?? "none");
    const tag = `W/"${version}"`;
    if (request.headers["if-none-match"] === tag) {
      response.writeHead(304, { etag: tag }).end();
      return;
    }
    response
      .writeHead(200, { etag: tag, "content-type": "application/json" })
      .end(version === "b" ? CATALOGUE.replace("33%", "34%") : CATALOGUE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // Listening on a port, the server's address is an AddressInfo, not a pipe's name.
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const dir = await mkdtemp(join(tmpdir(), "nxk-catalogue-test-"));
  try {
    assert.equal(await loadCatalogue("uk", { base, dir }), CATALOGUE);
    assert.equal(await loadCatalogue("uk", { base, dir }), CATALOGUE);
    assert.deepEqual(seen, ["none"], "a fresh copy needs no request");
    assert.equal(await loadCatalogue("uk", { base, dir, refresh: true }), CATALOGUE);
    assert.deepEqual(seen, ["none", 'W/"a"'], "revalidation sends the ETag and takes the 304");
    // A copy more than a day old is revalidated too, and a new release replaces it.
    const [slot] = await readdir(dir);
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(join(dir, slot, "uk.json"), old, old);
    version = "b";
    assert.match(await loadCatalogue("uk", { base, dir }), /34%/);
    assert.deepEqual(seen.slice(2), ['W/"a"']);
    await assert.rejects(loadCatalogue("fr", { base, dir }), /uk or us/);
  } finally {
    server.close();
  }
});
