import * as faceapi from "@vladmandic/face-api";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";

const MODEL_BASE = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

let modelsPromise: Promise<void> | null = null;
let backendReady = false;

async function ensureBackend() {
  if (backendReady) return;
  try {
    const ok = await tf.setBackend("webgl");
    if (!ok) throw new Error("webgl indisponível");
    await tf.ready();
  } catch {
    // Aparelhos/WebViews sem WebGL: mais lento, porém funciona.
    await tf.setBackend("cpu");
    await tf.ready();
  }
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
    })().catch((error) => {
      // Não cachear a falha: permite o "Tentar novamente" baixar os modelos de novo.
      modelsPromise = null;
      throw error;
    });
  }
  await modelsPromise;
}

/** Baixa os modelos antecipadamente (ex.: na tela de orientação), ignorando falhas. */
export function preloadFaceApiModels(): Promise<unknown> {
  return loadFaceApiModels().catch(() => undefined);
}

async function detectFace(canvas: HTMLCanvasElement, options: faceapi.TinyFaceDetectorOptions) {
  return faceapi.detectSingleFace(canvas, options).withFaceLandmarks().withFaceDescriptor();
}

/** Uma única inferência no snapshot final — não usar em loop. */
export async function computeFaceEmbedding(canvas: HTMLCanvasElement): Promise<number[]> {
  await loadFaceApiModels();

  let detection = await detectFace(
    canvas,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }),
  );

  // Segunda chance com limiar mais tolerante (rosto levemente virado, pouca luz).
  if (!detection?.descriptor) {
    detection = await detectFace(
      canvas,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }),
    );
  }

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
