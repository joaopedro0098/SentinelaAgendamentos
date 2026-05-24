import * as faceapi from "@vladmandic/face-api";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

const MODEL_BASE = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

let modelsPromise: Promise<void> | null = null;
let backendReady = false;

async function ensureBackend() {
  if (backendReady) return;
  await tf.setBackend("webgl");
  await tf.ready();
  backendReady = true;
}

export async function loadFaceApiModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      await ensureBackend();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE),
      ]);
    })();
  }
  await modelsPromise;
}

/** Uma única inferência no snapshot final — não usar em loop. */
export async function computeFaceEmbedding(canvas: HTMLCanvasElement): Promise<number[]> {
  await loadFaceApiModels();

  const detection = await faceapi
    .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection?.descriptor) {
    throw new Error("Não foi possível concluir a verificação. Posicione o rosto na moldura com boa iluminação.");
  }

  return Array.from(detection.descriptor);
}

export function toUserFaceError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("is not a function") || msg.includes("faceapi") || msg.includes("tensor")) {
      return "Não foi possível concluir a verificação. Tente novamente com boa iluminação.";
    }
    if (
      msg.includes("verificação") ||
      msg.includes("capturar") ||
      msg.includes("iluminação") ||
      msg.includes("moldura") ||
      msg.includes("câmera")
    ) {
      return error.message;
    }
  }
  return "Não foi possível concluir a verificação. Tente novamente.";
}
