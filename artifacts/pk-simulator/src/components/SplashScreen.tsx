import { useCallback, useEffect, useRef, useState } from "react";
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
  const unmountTimerRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    setLeaving((prev) => {
      if (prev) return prev;
      if (unmountTimerRef.current !== null) {
        window.clearTimeout(unmountTimerRef.current);
      }
      unmountTimerRef.current = window.setTimeout(() => setMounted(false), FADE_MS);
      return true;
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    const fadeTimer = window.setTimeout(dismiss, VISIBLE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      if (unmountTimerRef.current !== null) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
    };
  }, [mounted, dismiss]);

  useEffect(() => {
    if (!mounted) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mounted, dismiss]);

  if (!mounted) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Pular tela de abertura"
      data-testid="splash-screen"
      onClick={dismiss}
      className={`lodi-splash fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer ${
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
