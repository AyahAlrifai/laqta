import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec section 9, appearance: the dark theme works only if every colour token has a dark
// value and components use tokens instead of literal colours.

const STYLES = __dirname;
const RENDERER = join(__dirname, '..', '..');
const tokens = readFileSync(join(STYLES, 'tokens.css'), 'utf8');

function colourTokens(block: string): Set<string> {
  const names = new Set<string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name = '', value = ''] = m;
    if (/#|rgba?\(/.test(value)) names.add(name);
  }
  return names;
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') && name !== 'tokens.css' ? [path] : [];
  });
}

/** Colours that sit on the screenshot or are the accent in both themes. */
const ALLOWED_LITERALS = new Set([
  '#ffffff', // handles and rings drawn over the screenshot
  '#fff',
  '#4a72f0', // avatar gradient (accent family, white text on it in both themes)
  '#1d3fb8',
]);

describe('theme tokens (spec section 9)', () => {
  const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)');
  const light = colourTokens(tokens.slice(0, darkStart));
  const dark = colourTokens(tokens.slice(darkStart));

  it('has a dark block', () => {
    expect(darkStart).toBeGreaterThan(0);
  });

  it('gives every colour token a dark value', () => {
    const missing = [...light].filter((name) => name !== '--annotation' && !dark.has(name));
    expect(missing).toEqual([]);
  });

  it('keeps literal colours out of component styles', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(RENDERER)) {
      const css = readFileSync(file, 'utf8');
      // Preview art in the theme picker is the documented exception.
      const checked = css.replace(/\.themeArt\[data-variant='(light|dark)'\] \{[^}]*\}/g, '');
      for (const m of checked.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        if (!ALLOWED_LITERALS.has(m[0].toLowerCase())) offenders.push(`${file}: ${m[0]}`);
      }
      for (const m of checked.matchAll(/rgba?\((\d+), (\d+), (\d+)/g)) {
        // Only the accent glow may stay literal (it reads on both surfaces).
        if (!['29, 63, 184', '47, 91, 234'].includes(`${m[1]}, ${m[2]}, ${m[3]}`))
          offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
