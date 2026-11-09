import { isFieldFilled, shapeFieldValue } from '../../shared/fields';
import type {
  ApprovedBug,
  AssigneeCandidate,
  BugDraft,
  CreateMeta,
  Session,
} from '../../shared/types';
import { attachmentFileName, buildDescriptionWiki, escapeUserWiki } from '../../shared/wiki';

// Assembles the ApprovedBug from the reviewed fields (spec sections 4 and 8). Main checks
// it again and fixes the labels and file name itself.

export function missingRequired(meta: CreateMeta | null, values: Record<string, string>): string[] {
  if (meta === null) return [];
  return meta.requiredFields.filter((f) => !isFieldFilled(f, values[f.id])).map((f) => f.id);
}

export function buildApproved(input: {
  session: Session;
  projectKey: string;
  draft: BugDraft;
  assignee: AssigneeCandidate | null;
  meta: CreateMeta | null;
  values: Record<string, string>;
}): ApprovedBug {
  const { session, draft } = input;
  const extraFields: Record<string, unknown> = {};
  for (const field of input.meta?.requiredFields ?? []) {
    const value = input.values[field.id];
    if (value !== undefined && value.trim() !== '')
      extraFields[field.id] = shapeFieldValue(field, value);
  }
  return {
    requestId: session.id,
    projectKey: input.projectKey,
    issueType: draft.issueType,
    summary: draft.summary.replace(/\s*\n\s*/g, ' ').trim(),
    descriptionWiki: buildDescriptionWiki({
      requestId: session.id,
      environment: escapeUserWiki(draft.environment),
      stepsToReproduce: draft.stepsToReproduce.map(escapeUserWiki),
      actualResult: escapeUserWiki(draft.actualResult),
      expectedResult: escapeUserWiki(draft.expectedResult),
      appName: session.sourceApp?.name ?? null,
    }),
    priority: draft.priority,
    assigneeUsername: input.assignee?.username ?? null,
    labels: ['laqta', `laqta-${session.id}`, ...draft.labels],
    extraFields,
    attachmentFileName: attachmentFileName(session.id),
  };
}
