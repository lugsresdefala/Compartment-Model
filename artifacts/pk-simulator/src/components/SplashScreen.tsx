import { useEffect, useState } from "react";
import { LodiLogo } from "./LodiLogo";

const SESSION_KEY = "lodi-splash-shown";
const VISIBLE_MS = 1300;
const FADE_MS = 450;

export function SplashScreen() {
  const alreadyShown = (() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  })();

  const [mounted, setMounted] = useState(!alreadyShown);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    const fadeTimer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const unmountTimer = window.setTimeout(() => setMounted(false), VISIBLE_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="splash-screen"
      className={`lodi-splash fixed inset-0 z-[9999] flex items-center justify-center ${
        leaving ? "lodi-splash-leaving" : ""
      }`}
    >
      <div className="lodi-splash-grid" />
      <div className="lodi-splash-glow" />
      <div className="lodi-splash-scanline" />
      <div className="relative flex flex-col items-center gap-6 lodi-splash-pop">
        <LodiLogo size="lg" />
        <div className="lodi-splash-bar">
          <span />
        </div>
      </div>
    </div>
  );
}
