import { describe, expect, it } from 'vitest';
import { isAllowedJiraLink } from './links';

const base = 'https://jira.example.com';

describe('isAllowedJiraLink', () => {
  it.each([
    ['https://jira.example.com/browse/PROJ-1', true],
    ['http://jira.example.com/browse/PROJ-1', false],
    ['https://jira.example.com.evil.test/browse/PROJ-1', false],
    ['https://user:pw@jira.example.com/browse/PROJ-1', false],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(isAllowedJiraLink(url, base)).toBe(expected);
  });

  it('allows nothing when Jira is not configured', () => {
    expect(isAllowedJiraLink('https://jira.example.com/browse/PROJ-1', '')).toBe(false);
  });
});
