import { cn } from "@/lib/utils";

const LANDING_WHATSAPP_ICON_SRC = "/landing-whatsapp-icon.png";

type LandingWhatsAppIconProps = {
  className?: string;
  /** Escala óptica — compensa margem transparente do PNG vs. o SVG antigo. */
  opticalScale?: number;
};

export function LandingWhatsAppIcon({ className, opticalScale = 1.12 }: LandingWhatsAppIconProps) {
  return (
    <img
      src={LANDING_WHATSAPP_ICON_SRC}
      alt=""
      aria-hidden
      decoding="async"
      draggable={false}
      className={cn("block max-h-full max-w-full object-contain select-none", className)}
      style={opticalScale !== 1 ? { transform: `scale(${opticalScale})` } : undefined}
    />
  );
}
