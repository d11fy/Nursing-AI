/** Days remaining until a scheduled deletion. Kept out of component bodies —
 * the Date.now() call is otherwise flagged as an impure render call. */
export function daysUntil(dateIso: string): number {
  return Math.max(0, Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}
