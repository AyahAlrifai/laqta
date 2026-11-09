import { describe, expect, it } from 'vitest';
import type { BugDraft, CreateMeta, Session } from '../../shared/types';
import { buildApproved, missingRequired } from './approved';

const session: Session = {
  id: '11111111-2222-4333-8444-555555555555',
  state: 'reviewing',
  captureMode: 'area',
  sourceApp: { name: 'Billing portal', windowTitle: 'Invoice' },
  os: { platform: 'win32', release: '10' },
  imagePath: null,
  width: 10,
  height: 10,
  capturedAt: '2026-11-09T00:00:00.000Z',
};
const draft: BugDraft = {
  summary: 'Total shown twice',
  environment: 'Billing {portal}',
  stepsToReproduce: ['Open invoice', '* click [here|https://evil.test]'],
  actualResult: 'Twice',
  expectedResult: 'Once',
  issueType: 'Bug',
  priority: 'Medium',
  assigneeQuery: 'Sara',
  assigneeTransliteration: null,
  labels: ['billing'],
  missingInfo: [],
};
const meta: CreateMeta = {
  issueTypes: [{ id: '1', name: 'Bug' }],
  priorities: ['Medium'],
  requiredFields: [
    {
      id: 'customfield_10010',
      name: 'Team',
      schemaType: 'option',
      allowedValues: [{ id: '7', label: 'Billing' }],
    },
    { id: 'customfield_10011', name: 'Ticket', schemaType: 'string' },
  ],
};

describe('buildApproved', () => {
  it('builds the description with escaped user text and the request labels', () => {
    const bug = buildApproved({
      session,
      projectKey: 'PROJ',
      draft,
      assignee: null,
      meta,
      values: { customfield_10010: '7', customfield_10011: 'T-1' },
    });
    expect(bug.labels).toEqual(['laqta', `laqta-${session.id}`, 'billing']);
    expect(bug.attachmentFileName).toBe(`laqta-${session.id}.png`);
    expect(bug.descriptionWiki).toContain('Billing \\{portal\\}');
    expect(bug.descriptionWiki).toContain('# \\* click \\[here|https://evil.test\\]');
    expect(bug.descriptionWiki).toContain(`!laqta-${session.id}.png!`);
    expect(bug.extraFields).toEqual({ customfield_10010: { id: '7' }, customfield_10011: 'T-1' });
    expect(bug.assigneeUsername).toBeNull();
  });

  it('lists required fields that are still empty', () => {
    expect(missingRequired(meta, {})).toEqual(['customfield_10010', 'customfield_10011']);
    expect(missingRequired(meta, { customfield_10010: '99', customfield_10011: 'x' })).toEqual([
      'customfield_10010',
    ]);
    expect(missingRequired(meta, { customfield_10010: '7', customfield_10011: 'x' })).toEqual([]);
  });
});
