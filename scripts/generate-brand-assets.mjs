// Builds every Nursing AI brand asset from the master vector `brand/logo-symbol.svg`:
//   brand/            light/dark symbol + app icon masters
//   public/           web favicon, PWA icons, apple-touch icon, brand SVGs, Open Graph symbol
//   mobile/           in-app logo SVGs and the mobile web favicon
//   android/.../res/  launcher icons (legacy, round, adaptive), splash screens, launcher background color
//
// Usage: node scripts/generate-brand-assets.mjs
// To use a better original of the logo, replace brand/logo-symbol.svg (same four fill colors,
// or update INK below) and run the script again; nothing else needs touching.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const at = (...parts) => path.join(root, ...parts);

const NAVY_BG = "#052033";
const TAGLINE = "Study Smarter, Become Better.";
// colors used by the master symbol, and their counterparts on a dark (navy) background
const ON_DARK = { "#092436": "#ffffff", "#225d6a": "#2b97a8" };
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const master = fs.readFileSync(at("brand", "logo-symbol.svg"), "utf8");
const viewBox = /viewBox="([^"]+)"/.exec(master)?.[1].trim().split(/\s+/).map(Number);
if (!viewBox || viewBox.length !== 4) throw new Error("brand/logo-symbol.svg needs a viewBox");
const [, , vbW, vbH] = viewBox;
const aspect = vbH / vbW;
const body = master.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
const darkBody = body.replace(/fill="(#[0-9a-fA-F]{6})"/g, (all, hex) => `fill="${ON_DARK[hex.toLowerCase()] ?? hex}"`);

const standalone = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(" ")}">\n${inner}\n</svg>\n`;
const lightSvg = standalone(body);
const darkSvg = standalone(darkBody);

// the symbol, `width` wide, centered on (cx, cy) inside a larger drawing
const symbol = (cx, cy, width, dark = true) => {
  const height = width * aspect;
  return `<svg x="${(cx - width / 2).toFixed(2)}" y="${(cy - height / 2).toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" viewBox="${viewBox.join(" ")}">${dark ? darkBody : body}</svg>`;
};

// the app icon ("cover"): navy tile with the symbol; radius 0 gives a full-bleed square
const tile = ({ size = 1024, radius = 0.22, widthFrac = 0.7, dy = 0 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
  `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${NAVY_BG}"/>` +
  symbol(size / 2, size / 2 + dy * size, size * widthFrac) +
  `</svg>\n`;

async function raster(svg, width, height = width) {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const density = vb ? Math.min(2400, (72 * width) / Number(vb[1])) : 72;
  return sharp(Buffer.from(svg), { density }).resize(width, height).png({ compressionLevel: 9 }).toBuffer();
}

const written = [];
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  written.push(path.relative(root, file).replaceAll("\\", "/"));
}

// minimal ICO container holding PNG frames
function ico(frames) {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    header[e] = size >= 256 ? 0 : size;
    header[e + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...frames.map((f) => f.png)]);
}

// ---------------------------------------------------------------- vector masters
const appIconSvg = tile();
write(at("brand", "logo-symbol-dark.svg"), darkSvg);
write(at("brand", "app-icon.svg"), appIconSvg);

// ---------------------------------------------------------------- web (Next.js)
write(at("public", "brand", "logo-symbol.svg"), lightSvg);
write(at("public", "brand", "logo-symbol-dark.svg"), darkSvg);
write(at("public", "brand", "app-icon.svg"), appIconSvg);
write(at("public", "icon.svg"), appIconSvg);
write(at("public", "icon-192.png"), await raster(appIconSvg, 192));
write(at("public", "icon-512.png"), await raster(appIconSvg, 512));
write(at("public", "icon-maskable-512.png"), await raster(tile({ radius: 0, widthFrac: 0.6 }), 512));
write(at("public", "apple-touch-icon.png"), await raster(tile({ radius: 0, widthFrac: 0.7 }), 180));
// favicons are tiny: let the symbol fill the tile
const faviconSvg = tile({ radius: 0.2, widthFrac: 0.88 });
write(at("public", "favicon.ico"), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await raster(faviconSvg, size) })))));
// symbol for the Open Graph card (rendered by next/og, which wants a bitmap)
write(at("public", "brand", "og-symbol.png"), await raster(darkSvg, 560, Math.round(560 * aspect)));

// ---------------------------------------------------------------- mobile web app (Vite)
write(at("mobile", "src", "assets", "brand", "logo-symbol.svg"), lightSvg);
write(at("mobile", "src", "assets", "brand", "logo-symbol-dark.svg"), darkSvg);
write(at("mobile", "src", "assets", "brand", "app-icon.svg"), appIconSvg);
write(at("mobile", "public", "icon.svg"), appIconSvg);

// ---------------------------------------------------------------- Android
const res = at("android", "app", "src", "main", "res");
const densities = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];
const roundSvg = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${NAVY_BG}"/>${symbol(size / 2, size / 2, size * 0.62)}</svg>`;
// adaptive icon foreground: 108dp canvas, symbol inside the 66dp safe zone
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${symbol(54, 54, 60)}</svg>`;
for (const [name, scale] of densities) {
  const dir = path.join(res, `mipmap-${name}`);
  write(path.join(dir, "ic_launcher.png"), await raster(tile({ radius: 0.22, widthFrac: 0.72 }), Math.round(48 * scale)));
  write(path.join(dir, "ic_launcher_round.png"), await raster(roundSvg(1024), Math.round(48 * scale)));
  write(path.join(dir, "ic_launcher_foreground.png"), await raster(foregroundSvg, Math.round(108 * scale)));
}
write(
  path.join(res, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${NAVY_BG}</color>\n</resources>\n`,
);

// splash: symbol + name + tagline on the brand navy, laid out for the Capacitor CENTER_CROP scaling
const splash = (w, h) => {
  const portrait = h >= w;
  const symW = portrait ? w * 0.5 : h * 0.4;
  const u = portrait ? w : h;
  const titleSize = u * 0.09;
  const tagSize = u * 0.04;
  const symH = symW * aspect;
  const gap = u * 0.06;
  const block = symH + gap + titleSize + u * 0.035 + tagSize;
  const top = h * 0.48 - block / 2;
  const titleY = top + symH + gap + titleSize * 0.8;
  const tagY = titleY + u * 0.035 + tagSize * 1.1;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${NAVY_BG}"/>` +
    symbol(w / 2, top + symH / 2, symW) +
    `<text x="${w / 2}" y="${titleY.toFixed(1)}" text-anchor="middle" fill="#ffffff" font-family="${FONT}" font-size="${titleSize.toFixed(1)}" font-weight="700">Nursing <tspan fill="#36cdd7">AI</tspan></text>` +
    `<text x="${w / 2}" y="${tagY.toFixed(1)}" text-anchor="middle" fill="#9fdfe6" font-family="${FONT}" font-size="${tagSize.toFixed(1)}">${TAGLINE}</text>` +
    `</svg>`
  );
};
const splashSizes = {
  drawable: [1080, 1920],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};
for (const [dir, [w, h]] of Object.entries(splashSizes)) {
  write(path.join(res, dir, "splash.png"), await raster(splash(w, h), w, h));
}

console.log(`Wrote ${written.length} brand assets:\n  ${written.join("\n  ")}`);
