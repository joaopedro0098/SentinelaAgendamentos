import { useEffect, useLayoutEffect, useState } from "react";

const FAB_SIZE = 56;
const FAB_MARGIN = 24;
/** Ajuste fino do centro na seção “Fez sentido para você?”. */
const FAB_CENTER_OFFSET_X = 17;
const ANCHOR_ID = "landing-wa-fab-anchor";
const GREEN_SECTION_ID = "como-funciona";

/**
 * Só começa a mover depois que parte do verde já saiu; termina exatamente quando o verde sumiu (bottom ≤ 0).
 */
const MOVE_START_GREEN_PROGRESS = 0.62;
const MOVE_EASE_POWER = 2.2;

export type LandingWhatsAppFabPosition = {
  x: number;
  y: number;
  /** 0 = canto; 1 = centro (só quando o verde não aparece mais). */
  mergeT: number;
};

function easeOut(t: number, power: number) {
  return 1 - (1 - t) ** power;
}

/** 0 = verde ainda ocupa a base da tela; 1 = verde totalmente acima da viewport. */
function greenExitProgress(viewportHeight: number): number {
  const green = document.getElementById(GREEN_SECTION_ID);
  if (!green) return 0;

  const bottom = green.getBoundingClientRect().bottom;
  if (bottom >= viewportHeight) return 0;
  if (bottom <= 0) return 1;
  return (viewportHeight - bottom) / viewportHeight;
}

function mergeTFromGreenExit(greenProgress: number): number {
  if (greenProgress <= MOVE_START_GREEN_PROGRESS) return 0;
  if (greenProgress >= 1) return 1;

  const span = 1 - MOVE_START_GREEN_PROGRESS;
  const linear = (greenProgress - MOVE_START_GREEN_PROGRESS) / span;
  return easeOut(linear, MOVE_EASE_POWER);
}

function snapPx(value: number) {
  return Math.round(value);
}

function computePosition(): LandingWhatsAppFabPosition {
  const viewportHeight = window.innerHeight;
  const cornerX = window.innerWidth - FAB_MARGIN - FAB_SIZE;
  const cornerY = viewportHeight - FAB_MARGIN - FAB_SIZE;

  if (typeof document === "undefined") {
    return { x: cornerX, y: cornerY, mergeT: 0 };
  }

  const anchor = document.getElementById(ANCHOR_ID);
  const green = document.getElementById(GREEN_SECTION_ID);
  if (!anchor || !green) {
    return { x: cornerX, y: cornerY, mergeT: 0 };
  }

  const greenProgress = greenExitProgress(viewportHeight);
  const mergeT = mergeTFromGreenExit(greenProgress);
  const half = FAB_SIZE / 2;
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;

  const anchorRect = anchor.getBoundingClientRect();
  const anchorDocCenterX = anchorRect.left + scrollX + anchorRect.width / 2;
  const anchorDocCenterY = anchorRect.top + scrollY + anchorRect.height / 2;

  const greenBottom = green.getBoundingClientRect().bottom;
  const scrollWhenGreenGone = scrollY + Math.max(greenBottom, 0);
  const landingX = anchorDocCenterX - scrollX - half + FAB_CENTER_OFFSET_X;
  const landingY = anchorDocCenterY - scrollWhenGreenGone - half;

  if (mergeT <= 0) {
    return { x: cornerX, y: cornerY, mergeT: 0 };
  }

  if (greenProgress >= 1) {
    const liveX = snapPx(anchorDocCenterX - scrollX - half + FAB_CENTER_OFFSET_X);
    const liveY = snapPx(anchorDocCenterY - scrollY - half);
    return { x: liveX, y: liveY, mergeT: 1 };
  }

  const x = snapPx(cornerX + (landingX - cornerX) * mergeT);
  const y = snapPx(cornerY + (landingY - cornerY) * mergeT);

  return { x, y, mergeT };
}

export function useLandingWhatsAppFabPosition(): LandingWhatsAppFabPosition {
  const [position, setPosition] = useState<LandingWhatsAppFabPosition>(() =>
    typeof window !== "undefined" ? computePosition() : { x: 0, y: 0, mergeT: 0 },
  );

  useLayoutEffect(() => {
    setPosition(computePosition());
  }, []);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      setPosition(computePosition());
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return position;
}
