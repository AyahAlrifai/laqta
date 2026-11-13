import { describe, expect, it, vi } from 'vitest';
import { CUES, cueLength, playCue, type AudioLike, type CueName } from './sounds';

const names = Object.keys(CUES) as CueName[];

/** Records what playCue builds, without any audio device. */
function fakeContext() {
  const oscillators: { frequency: number; started: number; stopped: number }[] = [];
  const param = () => ({
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const ctx = {
    currentTime: 10,
    destination: {},
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createOscillator: () => {
      const record = { frequency: 0, started: 0, stopped: 0 };
      oscillators.push(record);
      return {
        type: '',
        frequency: {
          setValueAtTime: (v: number) => {
            record.frequency = v;
          },
        },
        connect: vi.fn(),
        start: (t: number) => {
          record.started = t;
        },
        stop: (t: number) => {
          record.stopped = t;
        },
      };
    },
    close: vi.fn(() => Promise.resolve()),
  };
  return { ctx: ctx as unknown as AudioLike, oscillators, close: ctx.close };
}

describe('sound cues (spec section 9)', () => {
  it('keeps every cue short and quiet', () => {
    for (const name of names) {
      expect(cueLength(name)).toBeLessThanOrEqual(1.5);
      for (const note of CUES[name]) expect(note.gain).toBeLessThanOrEqual(0.2);
    }
  });

  it('gives each cue its own contour: two rise, one falls', () => {
    const contour = (name: CueName) => {
      const f = CUES[name].map((n) => n.frequency);
      return (f.at(-1) ?? 0) > (f[0] ?? 0) ? 'up' : 'down';
    };
    expect(contour('draftReady')).toBe('up');
    expect(contour('bugCreated')).toBe('up');
    expect(contour('needsAction')).toBe('down');
    expect(CUES.draftReady.length).not.toBe(CUES.bugCreated.length);
  });

  it('builds a fundamental and an octave for each note, then closes the context', () => {
    vi.useFakeTimers();
    const fake = fakeContext();
    playCue('bugCreated', () => fake.ctx);
    const expected = CUES.bugCreated.flatMap((n) => [n.frequency, n.frequency * 2]);
    expect(fake.oscillators.map((o) => o.frequency)).toEqual(expected);
    for (const o of fake.oscillators) expect(o.stopped).toBeGreaterThan(o.started);
    expect(fake.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(fake.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('stays silent instead of throwing when there is no audio device', () => {
    expect(() =>
      playCue('draftReady', () => {
        throw new Error('no device');
      }),
    ).not.toThrow();
  });
});
