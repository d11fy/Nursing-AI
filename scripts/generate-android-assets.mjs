import fs from "fs";
import path from "path";
import sharp from "sharp";

const root = process.cwd();
const svgPath = path.join(root, "public", "icon.svg");

// Define Android icon sizes for mipmap folders
const iconSizes = [
  { folder: "mipmap-mdpi", size: 48 },
  { folder: "mipmap-hdpi", size: 72 },
  { folder: "mipmap-xhdpi", size: 96 },
  { folder: "mipmap-xxhdpi", size: 144 },
  { folder: "mipmap-xxxhdpi", size: 192 },
];

async function generateAssets() {
  console.log("Generating Android Icons and Splash Screen...");

  const svgBuffer = fs.readFileSync(svgPath);

  // 1. App Launcher Icons
  for (const item of iconSizes) {
    const dir = path.join(root, "android", "app", "src", "main", "res", item.folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Standard Icon
    await sharp(svgBuffer)
      .resize(item.size, item.size)
      .toFile(path.join(dir, "ic_launcher.png"));

    // Foreground Icon for Adaptive Icons
    await sharp(svgBuffer)
      .resize(Math.round(item.size * 0.7), Math.round(item.size * 0.7))
      .extend({
        top: Math.round(item.size * 0.15),
        bottom: Math.round(item.size * 0.15),
        left: Math.round(item.size * 0.15),
        right: Math.round(item.size * 0.15),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(path.join(dir, "ic_launcher_foreground.png"));

    // Round Icon
    const circleSvg = `<svg width="${item.size}" height="${item.size}"><circle cx="${item.size/2}" cy="${item.size/2}" r="${item.size/2}" fill="#0f5d75"/></svg>`;
    const roundMask = await sharp(Buffer.from(circleSvg)).png().toBuffer();
    
    await sharp(svgBuffer)
      .resize(item.size, item.size)
      .composite([{ input: roundMask, blend: "dest-in" }])
      .toFile(path.join(dir, "ic_launcher_round.png"));
  }

  // 2. Splash Screen Image (1080x1920 with brand color #0f5d75 background and white logo)
  const splashDir = path.join(root, "android", "app", "src", "main", "res", "drawable");
  if (!fs.existsSync(splashDir)) fs.mkdirSync(splashDir, { recursive: true });

  const logoResized = await sharp(svgBuffer)
    .resize(320, 320)
    .toBuffer();

  const splashSvg = `
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <rect width="1080" height="1920" fill="#0f5d75"/>
      <text x="540" y="1200" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="54" font-weight="bold">Nursing AI</text>
      <text x="540" y="1270" text-anchor="middle" fill="#99f6e4" font-family="sans-serif" font-size="32">مساعدك الذكي في دراسة التمريض</text>
    </svg>
  `;

  await sharp(Buffer.from(splashSvg))
    .composite([{ input: logoResized, top: 700, left: 380 }])
    .png()
    .toFile(path.join(splashDir, "splash.png"));

  console.log("Successfully generated all Android icons and splash screen image!");
}

generateAssets().catch((err) => {
  console.error("Asset generation error:", err);
  process.exit(1);
});
