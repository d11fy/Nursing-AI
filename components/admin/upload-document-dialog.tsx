"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SOURCE_TYPES = [
  { value: "book", label: "كتاب" },
  { value: "lecture", label: "محاضرة" },
  { value: "notes", label: "ملاحظات" },
  { value: "questions", label: "أسئلة" },
  { value: "reference", label: "مرجع" },
] as const;

export function UploadDocumentDialog({
  subjects,
}: {
  subjects: { id: string; name_ar: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setUploading(true);
    try {
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تعذر رفع الملف");
      toast.success("تم رفع الملف ومعالجته بنجاح");
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الملف");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Upload className="size-4" />رفع ملف</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفع مصدر تعليمي جديد</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">عنوان الملف</Label>
            <Input id="title" name="title" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subjectId">المادة</Label>
            <Select name="subjectId" required>
              <SelectTrigger id="subjectId" className="w-full">
                <SelectValue placeholder="اختر مادة">
                  {(value: string) => subjects.find((s) => s.id === value)?.name_ar}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sourceType">نوع المصدر</Label>
            <Select name="sourceType" defaultValue="reference">
              <SelectTrigger id="sourceType" className="w-full">
                <SelectValue>
                  {(value: string) => SOURCE_TYPES.find((t) => t.value === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="file">الملف (PDF, TXT, DOCX)</Label>
            <Input id="file" name="file" type="file" accept=".pdf,.txt,.docx" required />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
              {uploading ? "جارٍ الرفع والمعالجة..." : "رفع ومعالجة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
