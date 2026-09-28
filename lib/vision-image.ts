import "server-only";
import sharp from "sharp";

// Support high resolution so course tables, medical charts, and small Arabic text
// remain crisp and readable for OpenAI Vision models.
const MAX_VISION_EDGE = 1536;

/** Keep high detail for slides and notes while maintaining efficient payload size. */
export async function toVisionDataUri(content: Buffer): Promise<string> {
  const optimized = await sharp(content, { failOn: "error" })
    .rotate()
    .resize({
      width: MAX_VISION_EDGE,
      height: MAX_VISION_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85, effort: 3 })
    .toBuffer();

  return `data:image/webp;base64,${optimized.toString("base64")}`;
}
