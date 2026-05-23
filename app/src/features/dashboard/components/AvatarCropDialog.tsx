import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cropImageToSquareBlob, drawCroppedSquare } from "@/lib/cropImage";

const PREVIEW_SIZE = 224;

type Props = {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (blob: Blob) => Promise<void>;
};

export function AvatarCropDialog({ open, file, onClose, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCroppedSquare(ctx, image, zoomRef.current, offsetRef.current.x, offsetRef.current.y, PREVIEW_SIZE);
  }, []);

  // Carrega imagem só quando o arquivo muda (não quando zoom/offset mudam)
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      imageRef.current = null;
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      paint();
    };
    img.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file, paint]);

  // Redesenha o canvas quando zoom ou posição mudam
  useEffect(() => {
    zoomRef.current = zoom;
    offsetRef.current = offset;
    paint();
  }, [zoom, offset, paint]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [offset.x, offset.y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      });
    },
    [dragging],
  );

  const handlePointerUp = useCallback(() => setDragging(false), []);

  async function handleSave() {
    if (!previewUrl) return;
    setSaving(true);
    try {
      const blob = await cropImageToSquareBlob(
        previewUrl,
        zoomRef.current,
        offsetRef.current.x,
        offsetRef.current.y,
      );
      await onConfirm(blob);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open || !file) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60">
      <div
        role="dialog"
        aria-labelledby="avatar-crop-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-xl p-5 space-y-4"
      >
        <div>
          <h2 id="avatar-crop-title" className="text-lg font-semibold">
            Ajustar foto
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Arraste para posicionar e use o zoom para enquadrar.
          </p>
        </div>

        <div
          className="relative mx-auto h-56 w-56 rounded-full overflow-hidden border-2 border-border bg-muted cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="h-full w-full" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="avatar-zoom" className="text-xs flex items-center justify-between text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ZoomIn className="h-3.5 w-3.5" />
              Zoom
            </span>
            <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
          </Label>
          <input
            id="avatar-zoom"
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            onInput={(e) => setZoom(Number(e.currentTarget.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
