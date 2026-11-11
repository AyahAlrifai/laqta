import { describe, expect, it } from 'vitest';
import { stripBrowserHeaders } from './api-session';

describe('stripBrowserHeaders', () => {
  it('drops Sec-Fetch-* in any case and keeps everything else', () => {
    expect(
      stripBrowserHeaders({
        'Sec-Fetch-Site': 'none',
        'sec-fetch-mode': 'no-cors',
        'Sec-Fetch-Dest': 'empty',
        'User-Agent': 'Laqta',
        'X-Atlassian-Token': 'no-check',
        Authorization: 'Basic x',
      }),
    ).toEqual({ 'User-Agent': 'Laqta', 'X-Atlassian-Token': 'no-check', Authorization: 'Basic x' });
  });
});
