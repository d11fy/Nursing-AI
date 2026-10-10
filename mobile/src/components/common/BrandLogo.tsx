import symbolLight from "../../assets/brand/logo-symbol.svg";
import symbolDark from "../../assets/brand/logo-symbol-dark.svg";
import appIconUrl from "../../assets/brand/app-icon.svg";

// Approved Nursing AI symbol; the white-on-navy artwork replaces the default one in dark mode.
export function BrandSymbol({ className = "h-20" }: { className?: string }) {
  return (
    <>
      <img src={symbolLight} alt="" aria-hidden="true" width={1150} height={1014} loading="lazy" className={`${className} w-auto shrink-0 dark:hidden`} />
      <img src={symbolDark} alt="" aria-hidden="true" width={1150} height={1014} loading="lazy" className={`${className} hidden w-auto shrink-0 dark:block`} />
    </>
  );
}

// The app icon ("cover"): navy rounded tile carrying the symbol, same artwork as the launcher icon.
export function AppIcon({ className = "size-10 rounded-xl" }: { className?: string }) {
  return <img src={appIconUrl} alt="" aria-hidden="true" width={96} height={96} className={`${className} shrink-0`} />;
}
