import { createPortal } from "react-dom";
import { LandingWhatsAppIcon } from "@/features/landing/components/LandingWhatsAppIcon";
import { QUER_MAIS_CTA } from "@/features/landing/content/landingContent";
import { useLandingWhatsAppFabPosition } from "@/features/landing/hooks/useLandingWhatsAppFabPosition";
import { buildLandingSupportWhatsAppUrl } from "@/lib/supportWhatsApp";
import { cn } from "@/lib/utils";

const FAB_BASE_SIZE = 56;
const CAPTION_GAP_PX = 14;
/** Centro da legenda parte da esquerda da tela (mesmo mergeT do ícone). */
const CAPTION_START_CENTER_X = -120;
const CAPTION_CENTER_OFFSET_X = -5;

export function LandingWhatsAppFab() {
  const { x, y, mergeT } = useLandingWhatsAppFabPosition();
  const showHoverLabel = mergeT < 0.12;
  const merged = mergeT >= 1;
  const mergeForMotion = merged ? 1 : mergeT;
  const scale = 1 + 0.5 * mergeForMotion;
  const half = FAB_BASE_SIZE / 2;
  const tx = x + half - half * scale;
  const ty = y + half - half * scale;
  const scaledSize = FAB_BASE_SIZE * (merged ? 1.5 : scale);
  const iconCenterX = tx + scaledSize / 2;
  const captionTop = ty + scaledSize + CAPTION_GAP_PX;
  const captionCenterX =
    CAPTION_START_CENTER_X +
    (iconCenterX + CAPTION_CENTER_OFFSET_X - CAPTION_START_CENTER_X) * mergeForMotion;
  const showCaption = mergeT > 0.04;

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed left-0 top-0 z-[100]"
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0)`,
          width: FAB_BASE_SIZE,
          height: FAB_BASE_SIZE,
        }}
      >
        <div
          className="group relative h-full w-full origin-center"
          style={{ transform: merged ? "scale(1.5)" : `scale(${scale})` }}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-[calc(100%+0.75rem)] top-1/2 origin-right -translate-y-1/2 whitespace-nowrap rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-foreground shadow-md",
              "after:absolute after:left-full after:top-1/2 after:-translate-y-1/2 after:border-y-[7px] after:border-y-transparent after:border-l-[8px] after:border-l-white",
              showHoverLabel
                ? "opacity-0 translate-x-2 scale-95 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:translate-x-0 group-focus-within:scale-100"
                : "opacity-0",
            )}
          >
            Fale conosco
          </span>
          <div className={cn("h-full w-full shrink-0", mergeT <= 0 && "landing-wa-fab-float")}>
            <a
              href={buildLandingSupportWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Fale conosco no WhatsApp"
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full bg-transparent p-0 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                merged
                  ? "hover:shadow-xl"
                  : "transition-[transform,box-shadow] duration-200 hover:scale-105 hover:shadow-xl",
              )}
            >
              <LandingWhatsAppIcon className="h-14 w-14" opticalScale={1.1} />
            </a>
          </div>
        </div>
      </div>

      {showCaption ? (
        <p
          className="landing-hero__eyebrow pointer-events-none fixed z-[99] m-0 max-w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 text-center text-[17px] font-semibold uppercase leading-snug text-primary md:text-[18px]"
          style={{
            top: captionTop,
            left: captionCenterX,
            opacity: Math.min(1, mergeForMotion * 1.15),
            letterSpacing: "0.04em",
          }}
        >
          {QUER_MAIS_CTA.whatsAppCaptionLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      ) : null}
    </>,
    document.body,
  );
}
