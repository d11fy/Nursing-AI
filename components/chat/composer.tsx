"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { ImagePlus, Send, Square, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface PendingImage {
  path: string;
  previewUrl: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating,
  pendingImage,
  onImageChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  pendingImage: PendingImage | null;
  onImageChange: (image: PendingImage | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر رفع الصورة");
      onImageChange({ path: data.path, previewUrl: data.url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && (value.trim() || pendingImage)) onSend();
    }
  }

  return (
    <div className="border-t border-border bg-white p-3 sm:p-4 dark:bg-slate-900">
      {pendingImage && (
        <div className="relative mb-2 inline-block">
          <div className="relative size-20 overflow-hidden rounded-lg border border-border">
            <Image src={pendingImage.previewUrl} alt="معاينة" fill className="object-cover" unoptimized />
          </div>
          <button
            onClick={() => onImageChange(null)}
            className="absolute -left-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-slate-900 text-white"
            aria-label="إزالة الصورة"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="رفع صورة"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        </Button>

        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب سؤالك هنا..."
          rows={1}
          className="max-h-40 min-h-11 flex-1 resize-none"
        />

        {isGenerating ? (
          <Button type="button" variant="destructive" size="icon" onClick={onStop} aria-label="إيقاف">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={onSend}
            disabled={!value.trim() && !pendingImage}
            aria-label="إرسال"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
