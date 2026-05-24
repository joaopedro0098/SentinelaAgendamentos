import { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import {
  BLINK_THRESHOLD,
  HEAD_TURN_DELTA,
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
    })();
  }
  return landmarkerPromise;
}

type Options = {
  video: HTMLVideoElement | null;
  active: boolean;
  onComplete: () => void;
};

export function useLiveness({ video, active, onComplete }: Options) {
  const [phase, setPhase] = useState<LivenessPhase>("positioning");
  const [message, setMessage] = useState<LivenessStepMessage>("Olhe para a câmera");
  const [faceDetected, setFaceDetected] = useState(false);

  const phaseRef = useRef<LivenessPhase>("positioning");
  const baselineYawRef = useRef<number | null>(null);
  const blinkSeenRef = useRef(false);
  const stableFramesRef = useRef(0);
  const rafRef = useRef<number>(0);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastTsRef = useRef(-1);

  const updatePhase = useCallback((next: LivenessPhase) => {
    phaseRef.current = next;
    setPhase(next);
    setMessage(messageForPhase(next));
    if (next === "done") onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!active || !video) return;

    let cancelled = false;

    (async () => {
      landmarkerRef.current = await getFaceLandmarker();
      if (cancelled) return;

      const tick = () => {
        if (cancelled || !video || video.readyState < 2 || !landmarkerRef.current) {
          rafRef.current = requestAnimationFrame(tick);
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
  }, [active, video, updatePhase]);

  return { phase, message, faceDetected, blinkSeen: blinkSeenRef.current };
}
