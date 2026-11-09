import type { BugDraft } from '../../shared/types';
import { appError, AppFailure } from '../errors';
import type { DraftInput, DraftProvider } from './provider';

// Used only when LAQTA_E2E=1 (spec section 12): deterministic drafts, no network.
export class FakeDraftProvider implements DraftProvider {
  async draft(input: DraftInput, signal: AbortSignal): Promise<BugDraft> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (signal.aborted) throw new AppFailure(appError('CANCELLED'));
    if (input.prompt.includes('[fail-ai]')) throw new AppFailure(appError('AI_UNAVAILABLE'));
    const assignee = /assign(?:\s+to)?\s+(\w+)/i.exec(input.prompt)?.[1] ?? null;
    return {
      summary: 'Invoice total is displayed twice on the invoice details page',
      environment: input.context.appName ?? 'Not provided',
      stepsToReproduce: [],
      actualResult: 'The Total due row appears twice with the same amount.',
      expectedResult: 'The Total due row appears once.',
      issueType: input.allowed.issueTypes.includes('Bug')
        ? 'Bug'
        : (input.allowed.issueTypes[0] ?? 'Bug'),
      priority: input.allowed.priorities.includes('Medium') ? 'Medium' : null,
      assigneeQuery: assignee,
      assigneeTransliteration: null,
      labels: ['billing'],
      missingInfo: ['Which invoice number shows the problem?'],
    };
  }
}
