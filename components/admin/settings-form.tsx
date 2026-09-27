"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettingsAction, type SettingsActionState } from "@/app/admin/actions";
import type { AppSettings } from "@/lib/usage";

const initialState: SettingsActionState = {};

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction, isPending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="freeDailyLimit">الحد اليومي المجاني (سؤال/يوم)</Label>
        <Input
          id="freeDailyLimit"
          name="freeDailyLimit"
          type="number"
          min={1}
          defaultValue={settings.freeDailyLimit}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rateLimitSeconds">الحد الزمني بين الطلبات (ثانية)</Label>
        <Input
          id="rateLimitSeconds"
          name="rateLimitSeconds"
          type="number"
          min={0}
          defaultValue={settings.rateLimitSeconds}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="maxImageSizeMb">الحد الأقصى لحجم الصورة (MB)</Label>
        <Input
          id="maxImageSizeMb"
          name="maxImageSizeMb"
          type="number"
          min={1}
          max={8}
          defaultValue={settings.maxImageSizeMb}
          required
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{state.success}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
      </Button>
    </form>
  );
}
