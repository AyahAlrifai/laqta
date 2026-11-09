import { describe, expect, it } from 'vitest';
import { buildDescriptionWiki, escapeUserWiki, unescapeWiki } from './wiki';

const id = '6f1c2b8e-4d3a-4b2c-9e1f-0a1b2c3d4e5f';

describe('description builder (spec section 8)', () => {
  it('matches the template', () => {
    expect(
      buildDescriptionWiki({
        requestId: id,
        environment: 'Billing portal, Windows.',
        stepsToReproduce: ['Open invoice', 'Scroll down'],
        actualResult: 'Total due appears twice.',
        expectedResult: 'Total due appears once.',
        appName: 'Billing portal',
      }),
    ).toBe(
      [
        'h3. Environment',
        'Billing portal, Windows.',
        'h3. Steps to reproduce',
        '# Open invoice',
        '# Scroll down',
        'h3. Actual result',
        'Total due appears twice.',
        'h3. Expected result',
        'Total due appears once.',
        'h3. Screenshot',
        `!laqta-${id}.png!`,
        '----',
        '_Created with Laqta from Billing portal. Draft written by AI, reviewed and approved by the reporter._',
      ].join('\n'),
    );
  });

  it('writes Not provided for empty steps and fields', () => {
    const out = buildDescriptionWiki({
      requestId: id,
      environment: '',
      stepsToReproduce: [' '],
      actualResult: '',
      expectedResult: 'x',
      appName: null,
    });
    expect(out).toContain('h3. Steps to reproduce\n_Not provided_');
    expect(out).toContain('h3. Environment\n_Not provided_');
    expect(out).toContain('from an unknown app');
  });

  it('cannot be broken by the app name', () => {
    const out = buildDescriptionWiki({
      requestId: id,
      environment: 'e',
      stepsToReproduce: [],
      actualResult: 'a',
      expectedResult: 'b',
      appName: 'x_{code}!y.png!',
    });
    expect(out).not.toContain('{code}');
    expect(out.match(/!/g)).toHaveLength(2);
  });

  it('escapes user text and is idempotent with the sanitizer output', () => {
    expect(escapeUserWiki('{x} [y] !z! \n* a\nh2. b')).toBe(
      '\\{x\\} \\[y\\] \\!z\\! \n\\* a\nh2\\. b',
    );
    expect(escapeUserWiki('\\{already\\}')).toBe('\\{already\\}');
    expect(escapeUserWiki(unescapeWiki('\\{x\\}\nh1\\. y'))).toBe('\\{x\\}\nh1\\. y');
  });
});
