import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-diagram-cache-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");

const db = await import("../lib/db.js");
const cache = await import("../lib/diagram-image-cache.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("diagram image cache returns the same URL for identical prompts", () => {
  const prompt = "Frame 1 of 1: labelled animal cell with nucleus";
  const buffer = Buffer.from("fake-png-bytes");

  const firstUrl = cache.cacheDiagramImage(prompt, buffer, "png");
  const secondUrl = cache.cacheDiagramImage(prompt, buffer, "png");
  const cachedUrl = cache.getCachedDiagramImageUrl(prompt);

  assert.equal(firstUrl, secondUrl);
  assert.equal(cachedUrl, firstUrl);
});

test("diagram image cache can be disabled with DIAGRAM_IMAGE_CACHE=false", () => {
  const previous = process.env.DIAGRAM_IMAGE_CACHE;
  process.env.DIAGRAM_IMAGE_CACHE = "false";

  const prompt = "Frame 1 of 1: number line from -2 to 6";
  const url = cache.cacheDiagramImage(prompt, Buffer.from("other-bytes"), "png");
  assert.equal(cache.getCachedDiagramImageUrl(prompt), null);
  assert.match(url, /^\/api\/quiz-media\/\d+$/);

  if (previous === undefined) {
    delete process.env.DIAGRAM_IMAGE_CACHE;
  } else {
    process.env.DIAGRAM_IMAGE_CACHE = previous;
  }
});
