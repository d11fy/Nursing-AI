"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListTree, MoreVertical, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DocumentRowActions({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function reprocess() {
    startTransition(async () => {
      const res = await fetch("/api/knowledge/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      if (res.ok) {
        toast.success("تمت إعادة معالجة الملف");
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "تعذرت إعادة المعالجة");
      }
    });
  }

  function restructure() {
    startTransition(async () => {
      const res = await fetch("/api/knowledge/restructure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, force: true }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const chapters = data?.result?.chapterCount;
        toast.success(typeof chapters === "number" ? `أُعيد بناء بنية الكتاب (${chapters} فصول)` : "أُعيد بناء بنية الكتاب");
        router.refresh();
      } else toast.error(data?.error || "تعذرت إعادة بناء بنية الكتاب");
    });
  }

  function deleteDocument() {
    startTransition(async () => {
      const res = await fetch(`/api/knowledge/${documentId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("تم حذف الملف");
        router.refresh();
      } else {
        toast.error("تعذر حذف الملف");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="size-11" disabled={isPending} aria-label="إجراءات المستند">
              <MoreVertical className="size-4" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={reprocess}>
            <RefreshCw className="size-4" />
            إعادة المعالجة
          </DropdownMenuItem>
          <DropdownMenuItem onClick={restructure}>
            <ListTree className="size-4" />
            إعادة بناء الفصول
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="size-4" />
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الملف؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الملف وكل المقاطع المستخرجة منه من قاعدة المعرفة نهائيًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              render={
                <button
                  type="button"
                  onClick={deleteDocument}
                  className="w-full bg-destructive text-white"
                >
                  حذف
                </button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
