import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { getServerUrl, getTokens, ApiError } from "./api";

export async function openAuthenticatedFile(
  endpoint: string,
  filename: string,
  download = false,
) {
  if (!endpoint.startsWith("/api/")) throw new Error("مسار الملف غير صالح");
  const { sessionToken, deviceToken } = await getTokens();
  const headers = new Headers();
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  if (deviceToken) headers.set("X-Device-Token", deviceToken);
  const response = await fetch(`${await getServerUrl()}${endpoint}`, {
    headers,
    credentials: "omit",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error || "تعذر فتح الملف", response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const resolvedName = encoded ? decodeURIComponent(encoded) : filename;
  if (Capacitor.isNativePlatform()) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
      reader.readAsDataURL(blob);
    });
    const path = `exports/${Date.now()}-${resolvedName.replace(/[^\p{L}\p{N}._-]/gu, "_")}`;
    const file = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({
      title: resolvedName,
      url: file.uri,
      dialogTitle: download ? "حفظ أو مشاركة الملف" : "فتح الملف باستخدام",
    });
  } else {
    const url = URL.createObjectURL(blob);
    if (download) {
      const link = document.createElement("a");
      link.href = url;
      link.download = resolvedName;
      link.click();
    } else window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
