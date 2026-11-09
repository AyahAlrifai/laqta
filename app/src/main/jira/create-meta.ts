import {
  JiraFieldPageSchema,
  JiraIssueTypePageSchema,
  JiraPriorityListSchema,
  JiraProjectListSchema,
  PRIORITIES,
  type JiraField,
} from '../../shared/schemas';
import { HANDLED_FIELDS } from '../../shared/fields';
import type { CreateMeta, JiraProject, Priority } from '../../shared/types';
import type { JiraClient } from './client';
import { JIRA } from './endpoints';

// Spec section 8: scoped createmeta (paginated), never the legacy un-scoped endpoint.

const MAX_PAGES = 20;

export async function listProjects(client: JiraClient): Promise<JiraProject[]> {
  const projects = await client.request('GET', JIRA.projects(), JiraProjectListSchema);
  return projects
    .map((p) => ({ key: p.key, name: p.name }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function loadIssueTypes(client: JiraClient, projectKey: string) {
  const all: { id: string; name: string }[] = [];
  for (let page = 0, startAt = 0; page < MAX_PAGES; page++) {
    const res = await client.request(
      'GET',
      JIRA.issueTypes(projectKey, startAt),
      JiraIssueTypePageSchema,
    );
    const items = res.values ?? res.issueTypes ?? [];
    // Subtask types need a parent issue, which Laqta never sets.
    all.push(...items.filter((v) => v.subtask !== true).map((v) => ({ id: v.id, name: v.name })));
    startAt += items.length;
    if (
      res.isLast === true ||
      items.length === 0 ||
      (res.total !== undefined && startAt >= res.total)
    )
      break;
  }
  return all;
}

async function loadFields(client: JiraClient, projectKey: string, issueTypeId: string) {
  const all: JiraField[] = [];
  for (let page = 0, startAt = 0; page < MAX_PAGES; page++) {
    const res = await client.request(
      'GET',
      JIRA.fields(projectKey, issueTypeId, startAt),
      JiraFieldPageSchema,
    );
    const items = res.values ?? res.fields ?? [];
    all.push(...items);
    startAt += items.length;
    if (
      res.isLast === true ||
      items.length === 0 ||
      (res.total !== undefined && startAt >= res.total)
    )
      break;
  }
  return all;
}

export function toPriorities(names: readonly string[]): Priority[] {
  return PRIORITIES.filter((p) => names.includes(p));
}

export function pickIssueType(
  types: readonly { id: string; name: string }[],
  preferred: string | undefined,
): { id: string; name: string } | undefined {
  return types.find((t) => t.name === preferred) ?? types.find((t) => t.name === 'Bug') ?? types[0];
}

export async function loadCreateMeta(
  client: JiraClient,
  projectKey: string,
  issueTypeName?: string,
): Promise<CreateMeta> {
  const issueTypes = await loadIssueTypes(client, projectKey);
  const chosen = pickIssueType(issueTypes, issueTypeName);
  const [fields, priorities] = await Promise.all([
    chosen ? loadFields(client, projectKey, chosen.id) : Promise.resolve([]),
    client.request('GET', JIRA.priorities(), JiraPriorityListSchema),
  ]);
  const requiredFields = fields
    .filter((f) => f.required && f.hasDefaultValue !== true && !HANDLED_FIELDS.has(f.fieldId))
    .map((f) => {
      const schemaType = f.schema.items ? `${f.schema.type}:${f.schema.items}` : f.schema.type;
      const field: CreateMeta['requiredFields'][number] = {
        id: f.fieldId,
        name: f.name,
        schemaType,
      };
      if (f.allowedValues && f.allowedValues.length > 0) {
        field.allowedValues = f.allowedValues.map((v) => ({
          id: v.id,
          label: v.value ?? v.name ?? v.id,
        }));
      }
      return field;
    });
  return { issueTypes, requiredFields, priorities: toPriorities(priorities.map((p) => p.name)) };
}
