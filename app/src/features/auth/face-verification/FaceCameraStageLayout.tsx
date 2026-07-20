import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Clip do vídeo e referência do oval — mesmas proporções. */
export const FACE_CAMERA_CLIP_PATH = "ellipse(34% 40% at 50% 50%)";
export const FACE_OVAL_BORDER_COLOR = "hsl(152, 55%, 42%)";
export const FACE_OVAL_BORDER_WIDTH_PX = 8;

type FaceCameraStageLayoutProps = {
  video: ReactNode;
  borderFailed?: boolean;
  overlay?: ReactNode;
  className?: string;
};

export function FaceCameraStageLayout({ video, borderFailed, overlay, className }: FaceCameraStageLayoutProps) {
  return (
    <div className={cn("relative mx-auto aspect-[3/4] max-h-[min(58vh,400px)] w-full max-w-md rounded-2xl overflow-hidden bg-white", className)}>
      <div className="absolute inset-0">{video}</div>

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 box-border bg-transparent transition-colors duration-300"
        style={{
          width: "68%",
          height: "80%",
          transform: "translate(-50%, -50%)",
          borderStyle: "solid",
          borderWidth: FACE_OVAL_BORDER_WIDTH_PX,
          borderColor: borderFailed ? "hsl(0, 84%, 60%)" : FACE_OVAL_BORDER_COLOR,
          borderRadius: "48% 48% 42% 42% / 54% 54% 46% 46%",
        }}
        aria-hidden
      />

      {overlay}
    </div>
  );
}
