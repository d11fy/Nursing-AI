import "server-only";
import sharp from "sharp";

// Qwen3-VL's image token count grows quickly with resolution. On the target
// 4 GB GPU, 640px keeps slide text readable while cutting cold-start vision
// latency from roughly a minute to seconds.
const MAX_VISION_EDGE = 640;

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
    .webp({ quality: 78, effort: 3 })
    .toBuffer();

  return `data:image/webp;base64,${optimized.toString("base64")}`;
}
