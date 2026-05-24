export type LivenessPhase = "positioning" | "blink" | "head_turn" | "done";

export type LivenessStepMessage =
  | "Olhe para a câmera"
  | "Pisca os olhos"
  | "Vire levemente a cabeça"
  | "Pronto ✅";

export function messageForPhase(phase: LivenessPhase): LivenessStepMessage {
  switch (phase) {
    case "positioning":
      return "Olhe para a câmera";
    case "blink":
      return "Pisca os olhos";
    case "head_turn":
      return "Vire levemente a cabeça";
    case "done":
      return "Pronto ✅";
  }
}

type Point = { x: number; y: number };

/** Deslocamento horizontal do nariz em relação ao centro do rosto (normalizado). */
export function headYawOffset(landmarks: Point[]): number {
  if (landmarks.length < 455) return 0;
  const nose = landmarks[1];
  const left = landmarks[234];
  const right = landmarks[454];
  const centerX = (left.x + right.x) / 2;
  const width = Math.abs(right.x - left.x) || 0.001;
  return (nose.x - centerX) / width;
}

export function isFaceCentered(landmarks: Point[]): boolean {
  if (landmarks.length < 455) return false;
  const nose = landmarks[1];
  return nose.x > 0.28 && nose.x < 0.72 && nose.y > 0.25 && nose.y < 0.75;
}

export function blinkScore(blendshapes: { categoryName: string; score: number }[] | undefined): number {
  if (!blendshapes?.length) return 0;
  const left = blendshapes.find((b) => b.categoryName === "eyeBlinkLeft")?.score ?? 0;
  const right = blendshapes.find((b) => b.categoryName === "eyeBlinkRight")?.score ?? 0;
  return Math.max(left, right);
}

export const BLINK_THRESHOLD = 0.42;
export const HEAD_TURN_DELTA = 0.1;
