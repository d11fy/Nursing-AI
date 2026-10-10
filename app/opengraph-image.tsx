import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Share preview for public pages. Latin text only: the image renderer does
// not shape Arabic script reliably, and the Arabic title is already in the
// page metadata that accompanies the image.
export const alt = "Nursing AI — study platform for nursing students";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const symbolData = await readFile(join(process.cwd(), "public/brand/og-symbol.png"), "base64");
const symbolSrc = `data:image/png;base64,${symbolData}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "linear-gradient(135deg, #052033 0%, #0a3550 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 1 }}>
            Nursing <span style={{ color: "#36cdd7", marginLeft: 12 }}>AI</span>
          </div>
          <div style={{ fontSize: 66, fontWeight: 800, marginTop: 22, lineHeight: 1.1 }}>Study nursing from your own lectures</div>
          <div style={{ fontSize: 28, marginTop: 28, opacity: 0.85 }}>Tutor · Study Packs · Quizzes · Mistakes · Progress</div>
          <div style={{ fontSize: 26, marginTop: 36, color: "#9fdfe6" }}>Study Smarter, Become Better.</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> elements */}
        <img src={symbolSrc} width={420} height={370} alt="" />
      </div>
    ),
    size,
  );
}
