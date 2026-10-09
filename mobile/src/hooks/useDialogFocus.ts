import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Index of the element Tab should move to, wrapping inside the dialog. */
export function nextFocusIndex(current: number, total: number, backwards: boolean): number {
  if (total <= 0) return -1;
  if (current < 0) return backwards ? total - 1 : 0;
  return backwards ? (current - 1 + total) % total : (current + 1) % total;
}

/**
 * Modal focus management: moves focus into the dialog when it opens, keeps
 * Tab/Shift+Tab inside it, closes on Escape, and returns focus to the
 * element that opened it.
 */
export function useDialogFocus(
  container: RefObject<HTMLElement | null>,
  open: boolean,
  onClose?: () => void,
) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = container.current;
    const focusables = () =>
      root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement) : [];
    const first = focusables()[0];
    (first ?? root)?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        root.focus();
        return;
      }
      const index = items.indexOf(document.activeElement as HTMLElement);
      const target = items[nextFocusIndex(index, items.length, event.shiftKey)];
      if (index === -1 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
        event.preventDefault();
        target.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    };
  }, [open, container]);
}
