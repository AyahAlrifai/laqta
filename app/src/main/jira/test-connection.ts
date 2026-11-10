import { JiraMyselfSchema, JiraProjectListSchema } from '../../shared/schemas';
import type { JiraProject, TestConnectionResult } from '../../shared/types';
import { log } from '../log';
import { failureOf, type JiraClient } from './client';
import { listProjects } from './create-meta';
import { JIRA } from './endpoints';

// Settings "Test connection" (spec section 3, settings:testConnection). The result's ok/error
// depends only on GET /myself; the project list is a convenience for the Default project
// picker, so its failure leaves `projects` out instead of failing the test.

/**
 * How long the project list may keep the test waiting after /myself has answered.
 * JiraClient.request has no per-call timeout or AbortSignal (its retry loop can take over a
 * minute against a slow 5xx endpoint), so the wait is bounded with a timer race instead.
 */
export const PROJECTS_GRACE_MS = 3_000;

type ProjectsOutcome =
  { kind: 'ok'; projects: JiraProject[] } | { kind: 'failed'; code: string } | { kind: 'timeout' };

export async function testJiraConnection(
  client: JiraClient,
  graceMs: number = PROJECTS_GRACE_MS,
): Promise<TestConnectionResult> {
  // Both requests start together so a slow project endpoint does not add to /myself's time.
  // The catch comes after the parse so this promise never rejects: an early return on a
  // failed /myself must not leave an unhandled rejection behind.
  const projects: Promise<ProjectsOutcome> = listProjects(client)
    .then((list): ProjectsOutcome => ({ kind: 'ok', projects: JiraProjectListSchema.parse(list) }))
    .catch((error: unknown): ProjectsOutcome => ({ kind: 'failed', code: failureOf(error).code }));
  let displayName: string;
  try {
    const me = await client.request('GET', JIRA.myself(), JiraMyselfSchema);
    displayName = me.displayName;
  } catch (error) {
    // The project request may still be running; its outcome is irrelevant once auth failed,
    // and `projects` never rejects, so nothing is left unhandled.
    return { ok: false, error: failureOf(error) };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProjectsOutcome>((resolve) => {
    timer = setTimeout(() => {
      resolve({ kind: 'timeout' });
    }, graceMs);
  });
  const outcome = await Promise.race([projects, timeout]);
  clearTimeout(timer);

  if (outcome.kind === 'ok')
    return { ok: true, userDisplayName: displayName, projects: outcome.projects };
  // Metadata only: the outcome and the AppError code, never a response body.
  log(
    'jira.projects',
    outcome.kind === 'failed'
      ? { outcome: 'failed', code: outcome.code }
      : { outcome: 'timeout', graceMs },
  );
  return { ok: true, userDisplayName: displayName };
}
