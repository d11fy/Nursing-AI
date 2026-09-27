"use client";

import { useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleSubjectStatusAction } from "@/app/admin/actions";
import type { SubjectStatus } from "@/types/database";

export function SubjectStatusToggle({ id, status }: { id: string; status: SubjectStatus }) {
  const formRef = useRef<HTMLFormElement>(null);
  const nextStatus: SubjectStatus = status === "active" ? "inactive" : "active";

  return (
    <form ref={formRef} action={toggleSubjectStatusAction}>
      <input type="hidden" name="subjectId" value={id} />
      <input type="hidden" name="status" value={nextStatus} />
      <Switch
        checked={status === "active"}
        onCheckedChange={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
