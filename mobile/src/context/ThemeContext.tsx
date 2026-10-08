import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard, KeyboardStyle } from "@capacitor/keyboard";

export type ThemeMode = "light" | "dark" | "system";
export type Accent = "teal" | "blue" | "violet";
const accents = new Set<Accent>(["teal", "blue", "violet"]);
export function readTheme(): { mode: ThemeMode; accent: Accent } {
  try {
    const mode = localStorage.getItem("nursing_theme");
    const accent = localStorage.getItem("nursing_accent") as Accent;
    return {
      mode: mode === "dark" || mode === "system" ? mode : "light",
      accent: accents.has(accent) ? accent : "teal",
    };
  } catch {
    return { mode: "light", accent: "teal" };
  }
}
export function applyTheme(mode: ThemeMode, accent: Accent) {
  const dark =
    mode === "dark" ||
    (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.accent = accent;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  return dark;
}
const ThemeContext = createContext<{
  mode: ThemeMode;
  accent: Accent;
  setMode: (value: ThemeMode) => void;
  setAccent: (value: Accent) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readTheme);
  useEffect(() => {
    const update = () => {
      const dark = applyTheme(settings.mode, settings.accent);
      if (Capacitor.isNativePlatform()) {
        void StatusBar.setStyle({
          style: dark ? Style.Dark : Style.Light,
        }).catch(() => {});
        void StatusBar.setBackgroundColor({
          color: dark ? "#101419" : "#ffffff",
        }).catch(() => {});
        void Keyboard.setStyle({
          style: dark ? KeyboardStyle.Dark : KeyboardStyle.Light,
        }).catch(() => {});
      }
    };
    update();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [settings]);
  const save = (next: typeof settings) => {
    applyTheme(next.mode, next.accent);
    try {
      localStorage.setItem("nursing_theme", next.mode);
      localStorage.setItem("nursing_accent", next.accent);
    } catch {
      /* Keep the current choice when device storage is unavailable. */
    }
    setSettings(next);
  };
  return (
    <ThemeContext.Provider
      value={{
        ...settings,
        setMode: (mode) => save({ ...settings, mode }),
        setAccent: (accent) => save({ ...settings, accent }),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
