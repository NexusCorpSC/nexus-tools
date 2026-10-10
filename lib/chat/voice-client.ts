import { isTextUIPart, type UIMessage } from "ai";
import {
  CHAT_SPEECH_MAX_LENGTH,
  CHAT_VOICE_MAX_SECONDS,
  CHAT_VOICE_SAMPLE_RATE,
} from "@/types/chat";

/**
 * La voix de Nexus Chat côté navigateur : enregistrer le micro en WAV pour
 * `POST /api/chat/transcribe`, et lire une réponse morceau par morceau avec
 * `POST /api/chat/speech`. L'app de bureau a les mêmes règles
 * (`src/lib/chat-voice.ts`).
 */

/** Le processeur audio qui passe les échantillons du micro au script. */
const WORKLET = `
class NexusChatCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("nexus-chat-capture", NexusChatCapture);
`;

export type RecorderError = "unsupported" | "denied" | "failed";

export class RecorderFailure extends Error {
  constructor(readonly code: RecorderError) {
    super(code);
  }
}

/** Ramène des échantillons à `CHAT_VOICE_SAMPLE_RATE` (moyenne par fenêtre). */
function downsample(samples: Float32Array, rate: number): Float32Array {
  if (rate === CHAT_VOICE_SAMPLE_RATE) return samples;
  const ratio = rate / CHAT_VOICE_SAMPLE_RATE;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    // Sous 16 kHz, une fenêtre peut être vide : on reprend l'échantillon.
    out[i] = end > start ? sum / (end - start) : (samples[start] ?? 0);
  }
  return out;
}

/** Un WAV PCM 16 bits mono à `CHAT_VOICE_SAMPLE_RATE`. */
export function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, CHAT_VOICE_SAMPLE_RATE, true);
  view.setUint32(28, CHAT_VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      44 + i * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Enregistre le micro tant qu'on ne l'arrête pas, une minute au plus
 * (`onLimit` prévient alors l'appelant).
 */
export class VoiceRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Relâché pendant qu'il démarrait : il ne garde pas le micro. */
  private closed = false;

  async start(onLimit: () => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      throw new RecorderFailure("unsupported");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (cause) {
      const name = (cause as DOMException | undefined)?.name;
      throw new RecorderFailure(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : "failed",
      );
    }
    if (this.closed) return this.release();
    try {
      this.context = new AudioContext();
      const url = URL.createObjectURL(
        new Blob([WORKLET], { type: "text/javascript" }),
      );
      try {
        await this.context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (this.closed) return this.release();
      // Créé après des `await`, hors du geste du joueur : Safari le laisse
      // suspendu tant qu'on ne le relance pas.
      if (this.context.state === "suspended") await this.context.resume();
      if (this.closed) return this.release();
      const source = this.context.createMediaStreamSource(this.stream);
      const node = new AudioWorkletNode(this.context, "nexus-chat-capture");
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.chunks.push(event.data);
      };
      source.connect(node);
      // Relié à la sortie (muette) : sans cela, certains navigateurs ne font
      // pas tourner le processeur.
      const mute = this.context.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(this.context.destination);
      this.timer = setTimeout(onLimit, CHAT_VOICE_MAX_SECONDS * 1000);
    } catch {
      this.release();
      throw new RecorderFailure("failed");
    }
  }

  /** Arrête et rend l'enregistrement en WAV, avec sa durée. */
  stop(): { wav: Blob; seconds: number } {
    const rate = this.context?.sampleRate ?? CHAT_VOICE_SAMPLE_RATE;
    const length = this.chunks.reduce(
      (total, chunk) => total + chunk.length,
      0,
    );
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    this.release();
    const resampled = downsample(samples, rate);
    return {
      wav: encodeWav(resampled),
      seconds: resampled.length / CHAT_VOICE_SAMPLE_RATE,
    };
  }

  /** Arrête sans rien garder. */
  release(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.chunks = [];
  }
}

/**
 * Le texte d'une réponse à lire : ses parties de texte à partir de `from`,
 * sans la mise en forme Markdown (liens gardés par leur libellé, ni
 * tableaux ni blocs de code).
 */
export function speechText(message: UIMessage, from = 0): string {
  return message.parts
    .filter(isTextUIPart)
    .slice(from)
    .map((part) => plainText(part.text))
    .filter(Boolean)
    .join("\n");
}

/** Combien de parties de texte a le message : où reprendre la lecture. */
export function textPartCount(message: UIMessage): number {
  return message.parts.filter(isTextUIPart).length;
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .filter((line) => !/^\s*\|/.test(line))
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Découpe un texte en morceaux à lire, aux fins de phrase : le premier
 * court, pour commencer à parler vite, les suivants plus longs.
 */
export function splitForSpeech(text: string): string[] {
  const sentences = text.match(/[^.!?…\n]+[.!?…]*\s*|\n/g) ?? [];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const limit = chunks.length === 0 ? 160 : 450;
    if (current && (current + sentence).length > limit) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
    while (current.length > CHAT_SPEECH_MAX_LENGTH) {
      const space = current.lastIndexOf(" ", CHAT_SPEECH_MAX_LENGTH);
      const cut = space > 0 ? space : CHAT_SPEECH_MAX_LENGTH;
      chunks.push(current.slice(0, cut).trim());
      current = current.slice(cut);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * Lit des morceaux de texte l'un après l'autre : le suivant se prépare
 * pendant que le précédent se lit. `fetchAudio` rend l'audio d'un morceau
 * (ou `null` pour arrêter là). Un nouvel appel à `play` ou à `stop` coupe ce
 * qui se lisait.
 */
export class SpeechPlayer {
  private generation = 0;
  private audio: HTMLAudioElement | null = null;
  private controller: AbortController | null = null;

  constructor(private readonly onSpeaking: (speaking: boolean) => void) {}

  async play(
    chunks: string[],
    fetchAudio: (text: string, signal: AbortSignal) => Promise<Blob | null>,
  ): Promise<void> {
    this.stop();
    if (chunks.length === 0) return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.onSpeaking(true);
    const fetchOne = (text: string) =>
      fetchAudio(text, controller.signal).catch(() => null);
    try {
      let next = fetchOne(chunks[0]);
      for (let i = 0; i < chunks.length; i++) {
        const blob = await next;
        if (generation !== this.generation || !blob) return;
        if (i + 1 < chunks.length) next = fetchOne(chunks[i + 1]);
        await this.playBlob(blob, generation);
        if (generation !== this.generation) return;
      }
    } finally {
      if (generation === this.generation) {
        this.controller = null;
        this.onSpeaking(false);
      }
    }
  }

  private playBlob(blob: Blob, generation: number): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.audio = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.onpause = done;
      if (generation !== this.generation) return done();
      audio.play().catch(done);
    });
  }

  stop(): void {
    const wasPlaying = this.controller !== null;
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.audio?.pause();
    this.audio = null;
    if (wasPlaying) this.onSpeaking(false);
  }
}
