"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  RecorderFailure,
  SpeechPlayer,
  splitForSpeech,
  VoiceRecorder,
} from "@/lib/chat/voice-client";
import type { ChatVoiceErrorCode } from "@/types/chat";

/** Au-delà, la touche (ou le bouton) était maintenue : la relâcher envoie. */
const HOLD_MS = 400;

/** La lecture à voix haute des réponses, réglage du joueur dans ce navigateur. */
const READ_ALOUD_KEY = "nexus-chat-read-aloud";

export type VoiceState = "idle" | "recording" | "transcribing";

export type VoiceError =
  | ChatVoiceErrorCode
  | "mic_denied"
  | "mic_unsupported"
  | "mic_failed"
  | "nothing_heard"
  | "generic";

function errorFrom(body: unknown): VoiceError {
  const code = (body as { error?: unknown } | null)?.error;
  return typeof code === "string" ? (code as VoiceError) : "generic";
}

/** Prévient les vues du chat ouvertes quand le réglage change. */
const READ_ALOUD_EVENT = "nexus-chat-read-aloud";

let readAloudOverride: boolean | null = null;

function readAloudStored(): boolean {
  if (readAloudOverride !== null) return readAloudOverride;
  try {
    return window.localStorage.getItem(READ_ALOUD_KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribeReadAloud(onChange: () => void) {
  window.addEventListener(READ_ALOUD_EVENT, onChange);
  return () => window.removeEventListener(READ_ALOUD_EVENT, onChange);
}

function storeReadAloud(on: boolean) {
  readAloudOverride = on;
  try {
    window.localStorage.setItem(READ_ALOUD_KEY, on ? "on" : "off");
  } catch {
    // Stockage indisponible : le réglage vaut pour cette page.
  }
  window.dispatchEvent(new Event(READ_ALOUD_EVENT));
}

/**
 * Parler à Nexus Chat : appuyer pour parler (maintenir puis relâcher pour
 * envoyer, ou appuyer une fois pour commencer et une fois pour finir), et
 * lire les réponses à voix haute.
 */
export function useChatVoice({
  conversationId,
  onTranscript,
  onRemaining,
}: {
  conversationId: string;
  /** Ce que le joueur a dit, à envoyer au chat. */
  onTranscript: (text: string) => void;
  /** Ce qui reste du budget du mois après un appel de la voix. */
  onRemaining: (remainingMicros: number) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<VoiceError | null>(null);
  const readAloud = useSyncExternalStore(
    subscribeReadAloud,
    readAloudStored,
    () => true,
  );
  const recorder = useRef<VoiceRecorder | null>(null);
  const starting = useRef<Promise<void> | null>(null);
  const pressedAt = useRef(0);
  const stateRef = useRef<VoiceState>("idle");
  const player = useRef<SpeechPlayer | null>(null);
  const callbacks = useRef({ onTranscript, onRemaining, conversationId });
  useEffect(() => {
    callbacks.current = { onTranscript, onRemaining, conversationId };
  });

  useEffect(() => {
    const current = new SpeechPlayer(setSpeaking);
    player.current = current;
    return () => {
      current.stop();
      recorder.current?.release();
    };
  }, []);

  const update = useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const finish = useCallback(async () => {
    if (stateRef.current !== "recording") return;
    // Relâché avant que le micro ait démarré : on attend qu'il l'ait fait.
    await starting.current?.catch(() => {});
    const active = recorder.current;
    if (!active || stateRef.current !== "recording") return;
    recorder.current = null;
    const { wav, seconds } = active.stop();
    if (seconds < 0.3) {
      update("idle");
      setError("too_short");
      return;
    }
    update("transcribing");
    try {
      const response = await fetch(
        `/api/chat/transcribe?id=${encodeURIComponent(callbacks.current.conversationId)}`,
        { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav },
      );
      const body = (await response.json().catch(() => null)) as {
        text?: string;
        remainingMicros?: number;
      } | null;
      if (!response.ok) {
        setError(errorFrom(body));
        return;
      }
      if (typeof body?.remainingMicros === "number") {
        callbacks.current.onRemaining(body.remainingMicros);
      }
      const text = body?.text?.trim() ?? "";
      if (!text) setError("nothing_heard");
      else callbacks.current.onTranscript(text);
    } catch {
      setError("generic");
    } finally {
      update("idle");
    }
  }, [update]);

  /** La touche ou le bouton est enfoncé. */
  const press = useCallback(async () => {
    player.current?.stop();
    if (stateRef.current === "recording") {
      // Deuxième appui du mode « une fois pour commencer, une fois pour finir ».
      void finish();
      return;
    }
    if (stateRef.current !== "idle") return;
    setError(null);
    pressedAt.current = Date.now();
    const next = new VoiceRecorder();
    recorder.current = next;
    update("recording");
    try {
      starting.current = next.start(() => void finish());
      await starting.current;
    } catch (cause) {
      if (recorder.current !== next) return;
      recorder.current = null;
      update("idle");
      const code = cause instanceof RecorderFailure ? cause.code : "failed";
      setError(
        code === "denied"
          ? "mic_denied"
          : code === "unsupported"
            ? "mic_unsupported"
            : "mic_failed",
      );
    }
  }, [finish, update]);

  /** La touche ou le bouton est relâché : envoie s'il était maintenu. */
  const release = useCallback(() => {
    if (stateRef.current !== "recording") return;
    if (Date.now() - pressedAt.current >= HOLD_MS) void finish();
  }, [finish]);

  /** Abandonne l'enregistrement en cours (Échap). */
  const cancel = useCallback(() => {
    if (stateRef.current !== "recording") return false;
    recorder.current?.release();
    recorder.current = null;
    update("idle");
    return true;
  }, [update]);

  const speak = useCallback((text: string) => {
    const chunks = splitForSpeech(text);
    if (chunks.length === 0) return;
    void player.current?.play(chunks, async (chunk, signal) => {
      const response = await fetch(
        `/api/chat/speech?id=${encodeURIComponent(callbacks.current.conversationId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk }),
          signal,
        },
      );
      if (!response.ok) {
        setError(errorFrom(await response.json().catch(() => null)));
        return null;
      }
      const remaining = Number(response.headers.get("X-Chat-Remaining-Micros"));
      if (
        response.headers.has("X-Chat-Remaining-Micros") &&
        Number.isFinite(remaining)
      ) {
        callbacks.current.onRemaining(remaining);
      }
      return response.blob();
    });
  }, []);

  const stopSpeaking = useCallback(() => player.current?.stop(), []);

  const setReadAloud = useCallback((on: boolean) => {
    if (!on) player.current?.stop();
    storeReadAloud(on);
  }, []);

  return {
    state,
    speaking,
    error,
    clearError: () => setError(null),
    readAloud,
    setReadAloud,
    press,
    release,
    cancel,
    speak,
    stopSpeaking,
  };
}
