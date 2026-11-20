import { useEffect, useRef } from "react";

const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"] as const;
const KEY = "upsti:last-activity";

/** Encerra a sessão após o período de inatividade (sincronizado entre abas). */
export function useIdleLogout(timeoutMs: number, onIdle: () => void) {
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    let last = Date.now();
    localStorage.setItem(KEY, String(last));
    const bump = () => {
      const now = Date.now();
      if (now - last > 5000) {
        last = now;
        localStorage.setItem(KEY, String(now));
      }
    };
    EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(() => {
      const shared = Number(localStorage.getItem(KEY) ?? last);
      if (Date.now() - Math.max(shared, last) > timeoutMs) cb.current();
    }, 15_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
    };
  }, [timeoutMs]);
}
