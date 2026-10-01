"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { Paperclip, FileText, Send, Square, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface PendingImage {
  path: string;
  previewUrl: string;
  name: string;
  size: number;
  attachmentId?:string;
  conversationId?:string;
  lectureId?:string;
  kind?:'image'|'file';
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating,
  pendingImage,
  onImageChange,
  maxImageSizeMb = 8,
  conversationId,
  subjectId,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  pendingImage: PendingImage | null;
  onImageChange: (image: PendingImage | null) => void;
  maxImageSizeMb?: number;
  conversationId?:string|null;
  subjectId?:string|null;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(file: File) {
    if(!file.type.startsWith('image/')) {
      if(file.size>50*1024*1024){toast.error('الحد الأقصى للملف 50MB');return;}
      const large=file.size>20*1024*1024;
      if(large&&!window.confirm('سيحذف الملف الأصلي بعد 10 أيام. يبقى المحتوى المستخرج متاحًا للدراسة. متابعة؟'))return;
      setUploading(true);
      try {
        const form=new FormData();form.append('file',file);if(conversationId)form.append('conversationId',conversationId);
        if(subjectId)form.append('subjectId',subjectId);form.append('largeFileAcknowledged',String(large));
        const response=await fetch('/api/chat/files',{method:'POST',body:form});let data=await response.json();
        if(!response.ok)throw new Error(data.error??'تعذر رفع الملف');
        const cid=data.conversationId,lecture=data.lectureId;
        for(let attempt=0;data.status!=='ready'&&attempt<300;attempt++) {
          await new Promise(resolve=>setTimeout(resolve,2000));
          const status=await fetch(`/api/chat/files?conversationId=${cid}&lectureId=${lecture}`);data=await status.json();
          if(!status.ok||data.status==='failed')throw new Error(data.error??'تعذرت معالجة الملف');
        }
        if(data.status!=='ready')throw new Error('الملف ما زال يعالج؛ افتحه من صفحة المادة بعد قليل');
        onImageChange({path:'',previewUrl:'',name:file.name,size:file.size,kind:'file',conversationId:cid,lectureId:lecture,attachmentId:data.attachmentId});
      } catch(error){toast.error(error instanceof Error?error.message:'تعذر رفع الملف');}finally{setUploading(false);}return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("نوع الملف غير مدعوم");
      return;
    }
    if (file.size > maxImageSizeMb * 1024 * 1024) {
      toast.error(`حجم الصورة أكبر من الحد المسموح. الحد الأقصى ${maxImageSizeMb}MB.`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر رفع الصورة");
      onImageChange({ path: data.path, previewUrl: data.url, name: file.name, size: file.size });
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
    <div className="rounded-2xl border border-border bg-card p-2.5 shadow-[0_10px_30px_rgb(16_42_58/0.08)] sm:p-3">
      {pendingImage && (
        <div className="mb-2 flex items-center gap-3">
          <div className="relative inline-block shrink-0">
            <div className="relative size-20 overflow-hidden rounded-lg border border-border">
              {pendingImage.kind==='file'?<FileText className="m-5 size-10 text-primary"/>:<Image src={pendingImage.previewUrl} alt="معاينة" fill className="object-contain" unoptimized />}
            </div>
            <button
              onClick={() => onImageChange(null)}
              className="absolute -left-1.5 -top-1.5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-foreground text-background focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="إزالة الصورة"
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="min-w-0 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">{pendingImage.name}</p>
            <p>{formatFileSize(pendingImage.size)}</p>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,.pdf,.docx,.pptx,.txt"
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
          disabled={uploading||isGenerating}
          aria-label="رفع صورة أو ملف دراسي"
          title="رفع صورة أو ملف دراسي"
          className="border-transparent text-muted-foreground hover:bg-accent hover:text-primary"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
        </Button>

        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اسأل عن موضوع، حالة، أو محاضرة..."
          rows={1}
          dir="auto"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none border-transparent bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
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
            disabled={uploading||(!value.trim() && !pendingImage)}
            aria-label="إرسال"
          >
            <Send className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
