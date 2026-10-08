import { useState } from "react";
import { createPortal } from "react-dom";
import { Sun, Moon, Monitor, Palette, Check } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import {
  useTheme,
  type ThemeMode,
  type Accent,
} from "../../context/ThemeContext";

export function ThemeOptions() {
  const { mode, accent, setMode, setAccent } = useTheme();
  const modes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "فاتح", icon: Sun },
    { value: "dark", label: "داكن", icon: Moon },
    { value: "system", label: "حسب الجهاز", icon: Monitor },
  ];
  const colors: { value: Accent; label: string; color: string }[] = [
    { value: "teal", label: "فيروزي", color: "#0f5d75" },
    { value: "blue", label: "أزرق", color: "#2563eb" },
    { value: "violet", label: "بنفسجي", color: "#7c3aed" },
  ];
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        اختر المظهر الذي يناسبك. يُحفظ اختيارك على هذا الجهاز.
      </p>
      <div
        role="group"
        aria-label="مظهر التطبيق"
        className="grid grid-cols-3 gap-2"
      >
        {modes.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`min-h-20 rounded-2xl border flex flex-col items-center justify-center gap-2 text-sm ${mode === value ? "border-primary bg-primary/10 text-primary font-bold" : "border-slate-200 dark:border-slate-700"}`}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </div>
      <h3 className="text-sm font-bold">اللون المفضل</h3>
      <div
        role="group"
        aria-label="لون التطبيق"
        className="grid grid-cols-3 gap-2"
      >
        {colors.map(({ value, label, color }) => (
          <button
            type="button"
            key={value}
            aria-pressed={accent === value}
            onClick={() => setAccent(value)}
            className="min-h-16 flex flex-col items-center gap-2 rounded-xl text-sm"
          >
            <span
              className="size-8 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: color }}
            >
              {accent === value && <Check className="size-5" />}
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
export function ThemePicker() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="تخصيص المظهر"
        onClick={() => setOpen(true)}
        className="size-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-primary"
      >
        <Palette className="size-5" />
      </button>
      {createPortal(
        <BottomSheet
          isOpen={open}
          onClose={() => setOpen(false)}
          title="تخصيص المظهر"
        >
          <ThemeOptions />
        </BottomSheet>,
        document.body,
      )}
    </>
  );
}
