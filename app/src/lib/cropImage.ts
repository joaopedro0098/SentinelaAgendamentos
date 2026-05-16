export function drawCroppedSquare(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number,
  outputSize: number,
) {
  const baseScale = Math.max(outputSize / image.width, outputSize / image.height);
  const scale = baseScale * zoom;
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const x = (outputSize - drawW) / 2 + offsetX;
  const y = (outputSize - drawH) / 2 + offsetY;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(image, x, y, drawW, drawH);
}

/** Gera um quadrado (ex.: 512×512) com zoom e deslocamento para avatar. */
export async function cropImageToSquareBlob(
  imageSrc: string,
  zoom: number,
  offsetX: number,
  offsetY: number,
  outputSize = 512,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado");

  drawCroppedSquare(ctx, image, zoom, offsetX, offsetY, outputSize);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao processar imagem"))),
      "image/webp",
      0.9,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem"));
    img.src = src;
  });
}
