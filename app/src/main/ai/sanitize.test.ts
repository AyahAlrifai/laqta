import { describe, expect, it } from 'vitest';
import type { BugDraft } from '../../shared/types';
import {
  enforceAllowed,
  sanitizeDraft,
  sanitizeLabels,
  sanitizeSummary,
  sanitizeWikiText,
} from './sanitize';

const JIRA = 'jira.example.com';

// Table-driven tests for every sanitizer rule in spec section 7.
describe('sanitizeWikiText', () => {
  it.each([
    ['control characters', 'a\u0000b\u0007c\u001Bd‮e', 'abcde'],
    ['CRLF normalised', 'a\r\nb', 'a\nb'],
    ['macro braces escaped', '{code}rm -rf{code}', '\\{code\\}rm -rf\\{code\\}'],
    ['panel macro escaped', '{panel:title=x}hi{panel}', '\\{panel:title=x\\}hi\\{panel\\}'],
    ['image embed removed', 'see !http://evil.test/x.png! here', 'see  here'],
    ['thumbnail embed removed', 'a !screenshot.png|thumbnail! b', 'a  b'],
    ['link with label keeps label only', 'click [here|https://evil.test/a]', 'click here'],
    ['bare link removed', 'go [https://evil.test]', 'go'],
    ['mention removed', 'ping [~admin] now', 'ping  now'],
    ['attachment link removed', 'file [^secret.txt]', 'file'],
    ['bare URL removed', 'open https://evil.test/a?b=1 now', 'open  now'],
    ['javascript URL removed', 'x javascript:alert(1) y', 'x  y'],
    [
      'Jira-host link kept',
      'see [PROJ-1|https://jira.example.com/browse/PROJ-1]',
      'see [PROJ-1|https://jira.example.com/browse/PROJ-1]',
    ],
    [
      'Jira-host bare URL kept',
      'see https://jira.example.com/browse/PROJ-1',
      'see https://jira.example.com/browse/PROJ-1',
    ],
    ['heading escaped', 'h1. Big', 'h1\\. Big'],
    ['heading h6 escaped', 'h6. Small', 'h6\\. Small'],
    ['bullet escaped', '* item', '\\* item'],
    ['numbered escaped', '# item', '\\# item'],
    ['dash escaped', '- item', '\\- item'],
    ['rule escaped', '----', '\\----'],
    ['table escaped', '|| a || b ||', '\\|| a || b ||'],
    ['quote escaped', 'bq. quoted', 'bq\\. quoted'],
    ['brackets escaped', '[ERROR] failed', '\\[ERROR\\] failed'],
    ['blank lines collapsed', 'a\n\n\n\n\n\nb', 'a\n\n\nb'],
    ['arabic text untouched', 'هاد النص عم بيظهر مرتين', 'هاد النص عم بيظهر مرتين'],
  ])('%s', (_name, input, expected) => {
    expect(sanitizeWikiText(input, JIRA)).toBe(expected);
  });

  it('caps length at 2000 without a dangling backslash', () => {
    const out = sanitizeWikiText('{'.repeat(3000), JIRA);
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out.endsWith('\\')).toBe(false);
  });
});

describe('sanitizeSummary', () => {
  it('is one line, capped at 120, without links or embeds', () => {
    expect(sanitizeSummary('Line one\nline two', JIRA)).toBe('Line one line two');
    expect(sanitizeSummary('x'.repeat(200), JIRA)).toHaveLength(120);
    expect(sanitizeSummary('Bug !x.png! at https://evil.test', JIRA)).toBe('Bug at');
  });
});

describe('sanitizeLabels', () => {
  it('lower-cases, keeps a-z0-9-, max 5, none starting with laqta-', () => {
    expect(
      sanitizeLabels(['UI Bug', 'billing!', 'laqta-1234', 'laqta', 'a', 'b', 'c', 'd', 'e']),
    ).toEqual(['ui-bug', 'billing', 'a', 'b', 'c']);
    expect(sanitizeLabels(['', '---', 'فاتورة'])).toEqual([]);
  });
});

const draft: BugDraft = {
  summary: 'Total {shown} twice',
  environment: 'h1. Env',
  stepsToReproduce: ['* one', '', 'two\nlines'],
  actualResult: 'x',
  expectedResult: 'y',
  issueType: 'Story',
  priority: 'Highest',
  assigneeQuery: '  Sara\u0000 ',
  assigneeTransliteration: '',
  labels: ['UI'],
  missingInfo: ['Which invoice?'],
};

describe('sanitizeDraft and enforceAllowed', () => {
  it('sanitizes every field', () => {
    const out = sanitizeDraft(draft, JIRA);
    expect(out.environment).toBe('h1\\. Env');
    expect(out.stepsToReproduce).toEqual(['\\* one', 'two lines']);
    expect(out.assigneeQuery).toBe('Sara');
    expect(out.assigneeTransliteration).toBeNull();
    expect(out.labels).toEqual(['ui']);
  });

  it('replaces a disallowed issue type with the first allowed one and drops unknown priority', () => {
    const out = enforceAllowed(draft, { issueTypes: ['Bug', 'Task'], priorities: ['Medium'] });
    expect(out.issueType).toBe('Bug');
    expect(out.priority).toBeNull();
    expect(
      enforceAllowed(
        { ...draft, issueType: 'Task', priority: 'Medium' },
        { issueTypes: ['Bug', 'Task'], priorities: ['Medium'] },
      ),
    ).toMatchObject({ issueType: 'Task', priority: 'Medium' });
  });
});
