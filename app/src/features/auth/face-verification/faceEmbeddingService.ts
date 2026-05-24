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
    .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceDescriptor();

  if (!detection?.descriptor) {
    throw new Error("Não foi possível gerar a biometria facial. Tente novamente com boa iluminação.");
  }

  return Array.from(detection.descriptor);
}
