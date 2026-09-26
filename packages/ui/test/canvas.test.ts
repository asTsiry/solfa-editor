import { DEFAULT_LAYOUT, layout, parse, sequentialIdFactory } from '@solfa/core';
import { describe, expect, it } from 'vitest';
import { drawScore } from '../src/canvas/render.js';

type Painted = { texts: string[] };

/** A 2D context that only remembers what it was asked to paint. */
function recordingContext(): { context: CanvasRenderingContext2D; painted: Painted } {
  const painted: Painted = { texts: [] };
  const target: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 6 }),
  };
  const context = new Proxy(target, {
    get(object, property: string) {
      if (property in object) return object[property];
      return (...args: unknown[]) => {
        if (property === 'fillText') painted.texts.push(String(args[0]));
        return undefined;
      };
    },
    set(object, property: string, value) {
      object[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, painted };
}

function laidOut(): ReturnType<typeof layout> {
  const { score, spans } = parse(':do=F#\n:time=3/4\n|\nS: d : r : m : f', {
    idFactory: sequentialIdFactory('n'),
  });
  return layout(score, spans, DEFAULT_LAYOUT);
}

describe('painting the key line', () => {
  it('paints it for an export', () => {
    const { context, painted } = recordingContext();
    drawScore(context, laidOut(), { theme: { mode: 'light' } });
    expect(painted.texts).toContain('Fa dia F#, 3/4');
  });

  it('leaves it out when the editable overlay paints it instead', () => {
    const { context, painted } = recordingContext();
    drawScore(context, laidOut(), { theme: { mode: 'light' }, skipKeyLine: true });
    expect(painted.texts).not.toContain('Fa dia F#, 3/4');
  });

  it('still paints the rest of the score when the key line is skipped', () => {
    const withLine = recordingContext();
    const without = recordingContext();
    drawScore(withLine.context, laidOut(), { theme: { mode: 'light' } });
    drawScore(without.context, laidOut(), { theme: { mode: 'light' }, skipKeyLine: true });
    expect(without.painted.texts.length).toBe(withLine.painted.texts.length - 1);
  });
});
