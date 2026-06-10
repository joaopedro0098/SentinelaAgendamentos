import { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import {
  BLINK_THRESHOLD,
  HEAD_TURN_DELTA,
  RECENTER_DELTA,
  RECENTER_TIMEOUT_MS,
  blinkScore,
  headYawOffset,
  isFaceCentered,
  messageForPhase,
  type LivenessPhase,
  type LivenessStepMessage,
} from "./livenessMath";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });
    })().catch((error) => {
      // Não cachear a falha: permite o "Tentar novamente" baixar o modelo de novo.
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

/** Baixa o modelo de liveness antecipadamente (ex.: na tela de orientação). */
export function preloadFaceLandmarker(): Promise<unknown> {
  return getFaceLandmarker().catch(() => undefined);
}

type Options = {
  key?: number;
  video: HTMLVideoElement | null;
  active: boolean;
  onComplete: () => void;
};

export function useLiveness({ key = 0, video, active, onComplete }: Options) {
  const [phase, setPhase] = useState<LivenessPhase>("positioning");
  const [message, setMessage] = useState<LivenessStepMessage>("Olhe para a câmera");
  const [faceDetected, setFaceDetected] = useState(false);

  const phaseRef = useRef<LivenessPhase>("positioning");
  const baselineYawRef = useRef<number | null>(null);
  const blinkSeenRef = useRef(false);
  const stableFramesRef = useRef(0);
  const recenterDeadlineRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastTsRef = useRef(-1);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const updatePhase = useCallback((next: LivenessPhase) => {
    phaseRef.current = next;
    setPhase(next);
    setMessage(messageForPhase(next));
    if (next === "done" && !completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current();
    }
  }, []);

  useEffect(() => {
    phaseRef.current = "positioning";
    setPhase("positioning");
    setMessage("Olhe para a câmera");
    setFaceDetected(false);
    baselineYawRef.current = null;
    blinkSeenRef.current = false;
    stableFramesRef.current = 0;
    recenterDeadlineRef.current = null;
    completedRef.current = false;
    lastTsRef.current = -1;
  }, [key, active]);

  useEffect(() => {
    if (!active || !video) return;

    let cancelled = false;

    (async () => {
      try {
        landmarkerRef.current = await getFaceLandmarker();
      } catch {
        return;
      }
      if (cancelled) return;

      const tick = () => {
        if (cancelled || completedRef.current || !video || video.readyState < 2 || !landmarkerRef.current) {
          if (!cancelled && !completedRef.current) rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const now = performance.now();
        if (now - lastTsRef.current < 66) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastTsRef.current = now;

        let result: FaceLandmarkerResult;
        try {
          result = landmarkerRef.current.detectForVideo(video, now);
        } catch {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const landmarks = result.faceLandmarks[0];
        const blendshapes = result.faceBlendshapes?.[0]?.categories;

        if (!landmarks?.length) {
          setFaceDetected(false);
          stableFramesRef.current = 0;
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        setFaceDetected(true);
        const centered = isFaceCentered(landmarks);
        const yaw = headYawOffset(landmarks);
        const blink = blinkScore(blendshapes);

        if (phaseRef.current === "positioning") {
          if (centered) {
            stableFramesRef.current += 1;
            if (stableFramesRef.current >= 8) {
              baselineYawRef.current = yaw;
              stableFramesRef.current = 0;
              updatePhase("blink");
            }
          } else {
            stableFramesRef.current = 0;
          }
        } else if (phaseRef.current === "blink") {
          if (blink >= BLINK_THRESHOLD) {
            blinkSeenRef.current = true;
            updatePhase("head_turn");
          }
        } else if (phaseRef.current === "head_turn") {
          const base = baselineYawRef.current ?? yaw;
          if (Math.abs(yaw - base) >= HEAD_TURN_DELTA) {
            // Não capturar com a cabeça virada: aguarda re-centralizar antes do snapshot.
            recenterDeadlineRef.current = now + RECENTER_TIMEOUT_MS;
            updatePhase("recenter");
          }
        } else if (phaseRef.current === "recenter") {
          const base = baselineYawRef.current ?? 0;
          const recentered = centered && Math.abs(yaw - base) <= RECENTER_DELTA;
          const timedOut = recenterDeadlineRef.current !== null && now >= recenterDeadlineRef.current;
          if (recentered || timedOut) {
            updatePhase("done");
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, video, updatePhase, key]);

  return { phase, message, faceDetected, blinkSeen: blinkSeenRef.current };
}
