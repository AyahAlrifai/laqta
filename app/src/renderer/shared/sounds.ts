// Spec section 9, sounds: short cues synthesised with Web Audio, so there are no audio files to
// ship or license and nothing touches the network (renderer CSP is connect-src 'none').
//
// Design: bell-like notes (a sine plus a quiet octave) with a fast attack and a soft
// exponential tail. Quiet (peak well under full scale), under a second and a half, and
// each cue has its own contour so it can be told apart without looking:
//   draftReady  - rising fifth, E5 to B5: "your turn, the draft is ready to review"
//   bugCreated  - rising G major arpeggio ending on D6: "done"
//   needsAction - falling fourth, D5 to A4: "created, but something needs you"

export type CueName = 'draftReady' | 'bugCreated' | 'needsAction';

export interface Note {
  /** Hz. */
  frequency: number;
  /** Seconds after the cue starts. */
  start: number;
  /** Seconds the note rings out. */
  duration: number;
  /** Peak gain, 0 to 1. */
  gain: number;
}

export const CUES: Record<CueName, readonly Note[]> = {
  draftReady: [
    { frequency: 659.25, start: 0, duration: 0.5, gain: 0.16 },
    { frequency: 987.77, start: 0.12, duration: 0.75, gain: 0.16 },
  ],
  bugCreated: [
    { frequency: 783.99, start: 0, duration: 0.4, gain: 0.14 },
    { frequency: 987.77, start: 0.09, duration: 0.4, gain: 0.14 },
    { frequency: 1174.66, start: 0.18, duration: 1.0, gain: 0.16 },
  ],
  needsAction: [
    { frequency: 587.33, start: 0, duration: 0.45, gain: 0.15 },
    { frequency: 440.0, start: 0.16, duration: 0.7, gain: 0.15 },
  ],
};

/** The octave partial that turns a plain sine into a soft bell. */
export const OVERTONE_GAIN = 0.25;
const ATTACK_S = 0.008;
/** Exponential ramps cannot reach zero; this is inaudible. */
const SILENT = 0.0001;

/** Total length of a cue in seconds, for closing the context afterwards. */
export function cueLength(name: CueName): number {
  return Math.max(...CUES[name].map((n) => n.start + n.duration));
}

// The subset of Web Audio used here, declared locally so tests (which run without DOM types)
// can pass a fake.
interface ParamLike {
  setValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}
interface NodeLike {
  connect(destination: unknown): unknown;
}
interface GainLike extends NodeLike {
  readonly gain: ParamLike;
}
interface OscillatorLike extends NodeLike {
  type: string;
  readonly frequency: Pick<ParamLike, 'setValueAtTime'>;
  start(time: number): void;
  stop(time: number): void;
}
export interface AudioLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  close(): Promise<void>;
}

/** The real context; only reached in a renderer, where Web Audio exists. */
function realContext(): AudioLike {
  const Ctor = (globalThis as unknown as { AudioContext: new () => AudioLike }).AudioContext;
  return new Ctor();
}

function playNote(ctx: AudioLike, note: Note, at: number): void {
  const t0 = at + note.start;
  const end = t0 + note.duration;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(SILENT, t0);
  envelope.gain.exponentialRampToValueAtTime(note.gain, t0 + ATTACK_S);
  envelope.gain.exponentialRampToValueAtTime(SILENT, end);
  envelope.connect(ctx.destination);

  for (const [multiple, level] of [
    [1, 1],
    [2, OVERTONE_GAIN],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.frequency * multiple, t0);
    if (level === 1) {
      osc.connect(envelope);
    } else {
      const partial = ctx.createGain();
      partial.gain.setValueAtTime(level, t0);
      osc.connect(partial);
      partial.connect(envelope);
    }
    osc.start(t0);
    osc.stop(end + 0.05);
  }
}

/**
 * Plays a cue. Never throws: a missing or blocked audio device must not break the flow it
 * decorates. Each cue gets its own short-lived context, closed once the tail has faded.
 */
export function playCue(name: CueName, createContext: () => AudioLike = realContext): void {
  try {
    const ctx = createContext();
    const at = ctx.currentTime + 0.02;
    for (const note of CUES[name]) playNote(ctx, note, at);
    setTimeout(() => void ctx.close().catch(() => undefined), (cueLength(name) + 0.3) * 1000);
  } catch {
    // No audio output: stay silent.
  }
}
