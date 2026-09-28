import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { toVisionDataUri } from "../lib/vision-image";

test("vision images are resized and encoded as compact WebP", async () => {
  const source = await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 220, g: 20, b: 60 } },
  }).png().toBuffer();

  const dataUri = await toVisionDataUri(source);
  assert.match(dataUri, /^data:image\/webp;base64,/);

  const optimized = Buffer.from(dataUri.split(",", 2)[1], "base64");
  const metadata = await sharp(optimized).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok((metadata.width ?? 0) <= 640);
  assert.ok((metadata.height ?? 0) <= 640);
  assert.ok(optimized.length < source.length);
});
