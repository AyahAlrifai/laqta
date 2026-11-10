import { describe, expect, it } from 'vitest';
import {
  ApprovedBugSchema,
  BugDraftSchema,
  DraftRequestSchema,
  isHttpsUrl,
  looksLikeJiraCloud,
  SetRedactedImageSchema,
  SettingsSchema,
  DEFAULT_SETTINGS,
} from './schemas';

const goodDraft = {
  summary: 'Total shown twice',
  environment: 'Not provided',
  stepsToReproduce: [],
  actualResult: 'a',
  expectedResult: 'b',
  issueType: 'Bug',
  priority: null,
  assigneeQuery: null,
  assigneeTransliteration: null,
  labels: [],
  missingInfo: [],
};

describe('schemas', () => {
  it('accepts a valid draft and rejects bad ones', () => {
    expect(BugDraftSchema.safeParse(goodDraft).success).toBe(true);
    expect(BugDraftSchema.safeParse({ ...goodDraft, summary: '' }).success).toBe(false);
    expect(BugDraftSchema.safeParse({ ...goodDraft, summary: 'x'.repeat(121) }).success).toBe(
      false,
    );
    expect(BugDraftSchema.safeParse({ ...goodDraft, priority: 'Urgent' }).success).toBe(false);
    expect(
      BugDraftSchema.safeParse({ ...goodDraft, labels: ['1', '2', '3', '4', '5', '6'] }).success,
    ).toBe(false);
    expect(BugDraftSchema.safeParse({ ...goodDraft, missingInfo: 'x' }).success).toBe(false);
  });

  it('settings: https only, defaults valid', () => {
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, jiraBaseUrl: 'http://jira.example.com' })
        .success,
    ).toBe(false);
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, jiraBaseUrl: 'https://jira.example.com' })
        .success,
    ).toBe(true);
    expect(isHttpsUrl('https://user:pw@jira.example.com')).toBe(false);
  });

  it('rejects wrong IPC shapes', () => {
    expect(
      DraftRequestSchema.safeParse({ prompt: 'x', projectKey: 'proj', bugLanguage: 'en' }).success,
    ).toBe(false);
    expect(
      DraftRequestSchema.safeParse({
        prompt: 'x'.repeat(2001),
        projectKey: 'PROJ',
        bugLanguage: 'en',
      }).success,
    ).toBe(false);
    expect(
      DraftRequestSchema.safeParse({ prompt: 'x', projectKey: 'PROJ', bugLanguage: 'fr' }).success,
    ).toBe(false);
    expect(SetRedactedImageSchema.safeParse({ png: [1, 2], width: 1, height: 1 }).success).toBe(
      false,
    );
    expect(
      SetRedactedImageSchema.safeParse({ png: new Uint8Array(2), width: 1, height: 1 }).success,
    ).toBe(true);
    expect(
      ApprovedBugSchema.safeParse({
        requestId: 'not-a-uuid',
        projectKey: 'PROJ',
        issueType: 'Bug',
        summary: 's',
        descriptionWiki: '',
        priority: null,
        assigneeUsername: null,
        labels: [],
        extraFields: {},
        attachmentFileName: 'x.png',
      }).success,
    ).toBe(false);
  });

  it('detects Jira Cloud addresses', () => {
    expect(looksLikeJiraCloud('https://example.atlassian.net')).toBe(true);
    expect(looksLikeJiraCloud('https://jira.example.com')).toBe(false);
    expect(looksLikeJiraCloud('https://atlassian.net.evil.test')).toBe(false);
  });

  it('settings: Cloud needs a valid email format when one is given', () => {
    expect(
      SettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        jiraDeployment: 'cloud',
        jiraEmail: 'a@b.co',
      }).success,
    ).toBe(true);
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, jiraDeployment: 'cloud', jiraEmail: 'nope' })
        .success,
    ).toBe(false);
  });
});
