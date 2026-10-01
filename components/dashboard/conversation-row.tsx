"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  renameConversationAction,
  deleteConversationAction,
} from "@/app/dashboard/actions";

export function ConversationRow({
  id,
  title,
  updatedAt,
}: {
  id: string;
  title: string;
  updatedAt: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 transition-colors duration-200 hover:border-primary/25 hover:bg-accent/30">
      {editing ? (
        <form
          action={async (formData) => {
            await renameConversationAction(formData);
            setEditing(false);
          }}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
        >
          <input type="hidden" name="conversationId" value={id} />
          <Input name="title" defaultValue={title} autoFocus className="h-8" />
          <Button type="submit" size="sm">
            حفظ
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            إلغاء
          </Button>
        </form>
      ) : (
        <>
          <Link href={`/dashboard/chat/${id}`} className="flex-1 truncate text-sm font-semibold text-foreground">
            {title}
          </Link>
          <span className="shrink-0 text-[11px] text-muted-foreground sm:text-xs">
            {new Date(updatedAt).toLocaleDateString("ar-EG")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="خيارات المحادثة">
                  <MoreVertical className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                إعادة تسمية
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                حذف
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المحادثة؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء. سيتم حذف المحادثة وكل رسائلها نهائيًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <form action={deleteConversationAction}>
              <input type="hidden" name="conversationId" value={id} />
              <AlertDialogAction render={<button type="submit" className="w-full">حذف</button>} />
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
