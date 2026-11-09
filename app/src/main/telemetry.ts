import { z } from 'zod';
import type { AppErrorCode } from '../shared/types';
import type { FetchLike } from './ai/provider';
import { log } from './log';

// Spec section 10: off until the user opts in. Counts and timings only, never content.

export type TelemetryEvent =
  | { name: 'hotkey_to_created'; ms: number }
  | { name: 'draft_accepted'; edited: boolean }
  | { name: 'error'; code: AppErrorCode };

// Exact allowlist: an event with any extra field is rejected before it leaves the app.
const EventSchema = z.discriminatedUnion('name', [
  z
    .object({ name: z.literal('hotkey_to_created'), ms: z.number().int().min(0).max(86_400_000) })
    .strict(),
  z.object({ name: z.literal('draft_accepted'), edited: z.boolean() }).strict(),
  z.object({ name: z.literal('error'), code: z.string().regex(/^[A-Z_]{2,40}$/) }).strict(),
]);

export function isAllowedEvent(event: unknown): boolean {
  return EventSchema.safeParse(event).success;
}

export class Telemetry {
  private queue: TelemetryEvent[] = [];

  constructor(
    private readonly enabled: () => boolean,
    private readonly url: string | null,
    private readonly fetch: FetchLike,
  ) {}

  record(event: TelemetryEvent): void {
    if (!this.enabled() || !isAllowedEvent(event)) return;
    this.queue.push(event);
    if (this.queue.length >= 20) void this.flush();
  }

  pending(): readonly TelemetryEvent[] {
    return this.queue;
  }

  async flush(): Promise<void> {
    if (!this.enabled()) {
      this.queue = [];
      return;
    }
    if (this.url === null || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      await this.fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(10_000),
      });
      log('telemetry.send', { count: batch.length });
    } catch {
      // Telemetry is best effort; dropped on failure.
    }
  }
}
