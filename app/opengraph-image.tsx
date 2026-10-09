import { ImageResponse } from "next/og";

// Share preview for public pages. Latin text only: the image renderer does
// not shape Arabic script reliably, and the Arabic title is already in the
// page metadata that accompanies the image.
export const alt = "Nursing AI — study platform for nursing students";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 88px",
          background: "linear-gradient(135deg, #0f5d75 0%, #083344 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 34, opacity: 0.8, letterSpacing: 2 }}>NURSING AI</div>
        <div style={{ fontSize: 76, fontWeight: 800, marginTop: 18, lineHeight: 1.1 }}>Study nursing from your own lectures</div>
        <div style={{ fontSize: 34, marginTop: 28, opacity: 0.85 }}>Tutor · Study Packs · Quizzes · Mistakes · Progress</div>
        <div style={{ fontSize: 28, marginTop: 44, opacity: 0.7 }}>Web and Android</div>
      </div>
    ),
    size,
  );
}
