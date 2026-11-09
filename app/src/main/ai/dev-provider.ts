import { net } from 'electron';
import { DirectAnthropicProvider } from './direct-anthropic';
import type { DraftProvider } from './provider';

// Development only (spec section 7): imported solely behind the build-time dev flag.
export function createDevProvider(): DraftProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === '') return null;
  return new DirectAnthropicProvider({
    apiKey,
    model: process.env.LAQTA_AI_MODEL,
    fetch: (input, init) => net.fetch(input, init),
  });
}
