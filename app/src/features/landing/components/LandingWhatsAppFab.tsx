import { createPortal } from "react-dom";
import { LandingWhatsAppIcon } from "@/features/landing/components/LandingWhatsAppIcon";
import { buildLandingSupportWhatsAppUrl } from "@/lib/supportWhatsApp";

export function LandingWhatsAppFab() {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[100] flex items-center group">
      <span
        aria-hidden
        className="pointer-events-none mr-3 origin-right scale-95 opacity-0 translate-x-2 whitespace-nowrap rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-foreground shadow-md transition-all duration-300 ease-out group-hover:scale-100 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-focus-within:translate-x-0 relative after:absolute after:left-full after:top-1/2 after:-translate-y-1/2 after:border-y-[7px] after:border-y-transparent after:border-l-[8px] after:border-l-white"
      >
        Fale conosco
      </span>
      <div className="landing-wa-fab-float shrink-0">
        <a
          href={buildLandingSupportWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Fale conosco no WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-[transform,box-shadow] duration-200 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <LandingWhatsAppIcon className="h-7 w-7" />
        </a>
      </div>
    </div>,
    document.body,
  );
}
