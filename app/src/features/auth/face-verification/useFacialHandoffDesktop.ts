import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";
import {
  FACIAL_HANDOFF_BROADCAST_EVENT,
  FACIAL_HANDOFF_POLL_INTERVAL_MS,
  facialHandoffChannelName,
} from "@/features/auth/face-verification/facialHandoffConstants";
import { consumeFacialHandoffResult, createFacialHandoffSession } from "@/lib/facialHandoffApi";

type SessionState = {
  sessionId: string;
  watchToken: string;
  expiresAt: Date;
};

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Options = {
  enabled: boolean;
  onCompleted: (result: FacialVerificationResult) => void;
  onFailed?: (message: string) => void;
};

export function useFacialHandoffDesktop({ enabled, onCompleted, onFailed }: Options) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [creating, setCreating] = useState(false);
  const [expired, setExpired] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const sessionRef = useRef<SessionState | null>(null);
  const consumedRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const stopListeners = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const finishWithResult = useCallback(
    (result: FacialVerificationResult) => {
      if (consumedRef.current) return;
      consumedRef.current = true;
      stopListeners();
      onCompleted(result);
    },
    [onCompleted, stopListeners],
  );

  const tryConsume = useCallback(async () => {
    const active = sessionRef.current;
    if (!active || consumedRef.current) return;

    try {
      const row = await consumeFacialHandoffResult(active.sessionId, active.watchToken);
      if (!row.ready) return;
      if (row.status === "failed") {
        consumedRef.current = true;
        stopListeners();
        onFailed?.(row.error);
        return;
      }
      finishWithResult(row.result);
    } catch {
      /* polling silencioso — próxima tentativa */
    }
  }, [finishWithResult, onFailed, stopListeners]);

  const startSession = useCallback(async () => {
    setCreating(true);
    consumedRef.current = false;
    stopListeners();
    try {
      const created = await createFacialHandoffSession();
      const next: SessionState = {
        sessionId: created.session_id,
        watchToken: created.watch_token,
        expiresAt: new Date(created.expires_at),
      };
      sessionRef.current = next;
      setSession(next);
      setExpired(false);
      setRemainingMs(Math.max(0, next.expiresAt.getTime() - Date.now()));
    } finally {
      setCreating(false);
    }
  }, [stopListeners]);

  useEffect(() => {
    if (!enabled) {
      stopListeners();
      sessionRef.current = null;
      setSession(null);
      return;
    }
    void startSession();
    return () => stopListeners();
  }, [enabled, startSession, stopListeners]);

  useEffect(() => {
    if (!enabled || !session || expired || consumedRef.current) return;

    const channel = supabase.channel(facialHandoffChannelName(session.sessionId), {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: FACIAL_HANDOFF_BROADCAST_EVENT }, () => {
      void tryConsume();
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [enabled, session?.sessionId, expired, tryConsume]);

  useEffect(() => {
    if (!enabled || !session || consumedRef.current) return;

    const poll = window.setInterval(() => {
      void tryConsume();
    }, FACIAL_HANDOFF_POLL_INTERVAL_MS);

    return () => window.clearInterval(poll);
  }, [enabled, session?.sessionId, tryConsume]);

  useEffect(() => {
    if (!enabled || !session || expired) return;

    const tick = () => {
      const ms = session.expiresAt.getTime() - Date.now();
      if (ms <= 0) {
        setRemainingMs(0);
        setExpired(true);
        stopListeners();
        return;
      }
      setRemainingMs(ms);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [enabled, session, expired, stopListeners]);

  return {
    session,
    creating,
    expired,
    countdownLabel: formatCountdown(remainingMs),
    regenerate: startSession,
  };
}
