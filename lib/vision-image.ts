import "server-only";
import sharp from "sharp";

const MAX_VISION_EDGE = 1024;

/** Keep enough detail for slides and notes while avoiding multi-megapixel vision inputs. */
export async function toVisionDataUri(content: Buffer): Promise<string> {
  const optimized = await sharp(content, { failOn: "error" })
    .rotate()
    .resize({
      width: MAX_VISION_EDGE,
      height: MAX_VISION_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return `data:image/webp;base64,${optimized.toString("base64")}`;
}
