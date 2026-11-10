import { net } from 'electron';
import { ClaudeCodeProvider, resolveClaudeCommand } from './claude-code';
import { DirectAnthropicProvider } from './direct-anthropic';
import type { DraftProvider } from './provider';

// Development only (spec section 7): imported solely behind the build-time dev flag, so
// release bundles contain neither the direct provider nor these environment switches.
//   ANTHROPIC_API_KEY=...               direct Anthropic API
//   LAQTA_AI_PROVIDER=claude-code       the developer's own Claude Code CLI login
// The API key wins when both are set. Release builds choose Claude Code in Settings › AI.
export function createDevProvider(): DraftProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey !== undefined && apiKey !== '') {
    return new DirectAnthropicProvider({
      apiKey,
      model: process.env.LAQTA_AI_MODEL,
      fetch: (input, init) => net.fetch(input, init),
    });
  }
  if (process.env.LAQTA_AI_PROVIDER === 'claude-code') {
    return new ClaudeCodeProvider({
      command: resolveClaudeCommand(process.env.LAQTA_CLAUDE_PATH),
      model: process.env.LAQTA_AI_MODEL,
    });
  }
  return null;
}
