import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  dipRectToPixels,
  downscaleSteps,
  fitLongEdge,
  screenRectToDisplay,
} from './capture/geometry';
import { displayAccelerator } from './hotkey';
import { decide, rankCandidates, searchTerms } from './jira/assignee';
import { duplicateJql, duplicateWords, escapeJqlString } from './jira/duplicates';
import { isBelowVersion, verifyStatus } from './kill-switch';
import { isAllowedEvent, Telemetry } from './telemetry';
import { buildTrayTemplate } from './tray-menu';

describe('capture geometry (spec section 5)', () => {
  it('converts DIP to image pixels with the scale factor and clamps', () => {
    expect(
      dipRectToPixels({ x: 10, y: 20, width: 100, height: 50 }, 1.5, { width: 3000, height: 2000 }),
    ).toEqual({ x: 15, y: 30, width: 150, height: 75 });
    expect(
      dipRectToPixels({ x: -5, y: 0, width: 50, height: 50 }, 2, { width: 60, height: 60 }),
    ).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });

  it('maps window bounds onto one display', () => {
    expect(
      screenRectToDisplay(
        { x: 1500, y: 100, width: 800, height: 600 },
        { x: 1440, y: 0, width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 60, y: 100, width: 800, height: 600 });
    expect(
      screenRectToDisplay(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 1440, y: 0, width: 1920, height: 1080 },
      ),
    ).toBeNull();
  });

  it('fits the AI copy to 1568 px and downscales the attachment in 0.85 steps', () => {
    expect(fitLongEdge(3136, 1000, 1568)).toEqual({ width: 1568, height: 500 });
    expect(fitLongEdge(800, 600, 1568)).toEqual({ width: 800, height: 600 });
    expect(downscaleSteps(1000, 500).next().value).toEqual({ width: 850, height: 425 });
  });
});

describe('assignee ranking (spec section 8)', () => {
  const c = (username: string, displayName: string) => ({
    username,
    displayName,
    email: null,
    avatarUrl: null,
  });
  it('tries the spoken query, the transliteration, then the first fragment', () => {
    expect(searchTerms('سارة حسن', 'Sara Hasan')).toEqual([
      'سارة حسن',
      'Sara Hasan',
      'سارة',
      'Sara',
    ]);
  });
  it('dedupes by username and sorts exact, then prefix', () => {
    const ranked = rankCandidates(
      [c('x', 'Bob Sara'), c('b', 'Sara K.'), c('a', 'Sara'), c('b', 'Sara K.')],
      ['Sara'],
    );
    expect(ranked.map((r) => r.username)).toEqual(['a', 'b', 'x']);
  });
  it('preselects only a single matching candidate', () => {
    expect(decide([c('a', 'Sara H.')], ['Sara']).preselected).toBe('a');
    expect(decide([c('a', 'Sara H.'), c('b', 'Sara K.')], ['Sara']).preselected).toBeNull();
    expect(decide([c('a', 'Someone Else')], ['Sara']).preselected).toBeNull();
    expect(decide([], ['Sara'])).toEqual({ candidates: [], preselected: null, matchedFrom: null });
  });
});

describe('duplicate JQL (spec section 8)', () => {
  it('takes up to six words of four or more letters, including Arabic', () => {
    expect(duplicateWords('The invoice total is shown twice on the details page today')).toEqual([
      'invoice',
      'total',
      'shown',
      'twice',
      'details',
      'page',
    ]);
    expect(duplicateWords('الفاتورة تظهر مرتين')).toEqual(['الفاتورة', 'تظهر', 'مرتين']);
  });
  it('special characters cannot break the query', () => {
    const jql = duplicateJql('PROJ', 'Total "due" \\ OR project = X) {code} *wild*');
    expect(jql).toBe(
      'project = "PROJ" AND resolution = Unresolved AND created >= -90d AND text ~ "Total project code wild" ORDER BY created DESC',
    );
    expect(escapeJqlString('a"b\\c')).toBe('a\\"b\\\\c');
    expect(duplicateJql('PROJ', '!! ??')).toBeNull();
  });
});

describe('telemetry (spec section 10)', () => {
  it('accepts only counts and timings, never content', () => {
    expect(isAllowedEvent({ name: 'hotkey_to_created', ms: 1000 })).toBe(true);
    expect(isAllowedEvent({ name: 'error', code: 'AUTH_INVALID' })).toBe(true);
    expect(isAllowedEvent({ name: 'hotkey_to_created', ms: 1, summary: 'x' })).toBe(false);
    expect(isAllowedEvent({ name: 'error', code: 'the customer Sara' })).toBe(false);
    expect(isAllowedEvent({ name: 'prompt', text: 'x' })).toBe(false);
  });
  it('records nothing when opted out', () => {
    let enabled = false;
    const tm = new Telemetry(
      () => enabled,
      null,
      () => Promise.reject(new Error('no')),
    );
    tm.record({ name: 'draft_accepted', edited: true });
    expect(tm.pending()).toHaveLength(0);
    enabled = true;
    tm.record({ name: 'draft_accepted', edited: true });
    expect(tm.pending()).toHaveLength(1);
  });
});

describe('kill switch (spec section 11)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const envelope = (obj: unknown, key = privateKey) => {
    const payload = Buffer.from(JSON.stringify(obj));
    return {
      payload: payload.toString('base64'),
      signature: sign(null, payload, key).toString('base64'),
    };
  };
  it('accepts a correctly signed status', () => {
    expect(verifyStatus(envelope({ aiDisabled: true, message: 'maintenance' }), pub)).toEqual({
      aiDisabled: true,
      appDisabled: false,
      message: 'maintenance',
    });
  });
  it('rejects a bad signature', () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    expect(verifyStatus(envelope({ appDisabled: true }, other), pub)).toBeNull();
    expect(verifyStatus({ payload: 'x' }, pub)).toBeNull();
  });
  it('compares versions', () => {
    expect(isBelowVersion('1.2.3', '1.10.0')).toBe(true);
    expect(isBelowVersion('2.0.0', '1.10.0')).toBe(false);
    expect(isBelowVersion('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('tray menu (board 4, card 4)', () => {
  const actions = {
    capture: () => undefined,
    openRecent: () => undefined,
    resumeDraft: () => undefined,
    openSettings: () => undefined,
    quit: () => undefined,
  };
  it('shows the connection status row, captures, recent, settings and quit', () => {
    const items = buildTrayTemplate(
      {
        lang: 'en',
        status: 'connected',
        hotkeyArea: 'CommandOrControl+Shift+J',
        hotkeyWindow: 'CommandOrControl+Shift+W',
        windowModeAvailable: true,
        recent: [
          {
            key: 'PROJ-1',
            summary: 'Invoice total shown twice',
            browseUrl: 'https://j/browse/PROJ-1',
          },
        ],
        savedDrafts: [],
        aiDisabledMessage: null,
      },
      actions,
    );
    const labels = items.map((i) => i.label).filter(Boolean);
    expect(labels).toEqual([
      'Connected to Jira',
      'Capture area',
      'Capture window',
      'Capture full screen',
      'Recent',
      'PROJ-1 · Invoice total shown twice',
      'Settings',
      'Quit Laqta',
    ]);
    expect(items[0]?.enabled).toBe(false);
  });
  it('hides window capture when unavailable and shows Offline', () => {
    const items = buildTrayTemplate(
      {
        lang: 'en',
        status: 'offline',
        hotkeyArea: '',
        hotkeyWindow: '',
        windowModeAvailable: false,
        recent: [],
        savedDrafts: [],
        aiDisabledMessage: null,
      },
      actions,
    );
    expect(items.map((i) => i.label)).not.toContain('Capture window');
    expect(items[0]?.label).toBe('Offline');
  });
  it('formats accelerators per platform', () => {
    expect(displayAccelerator('CommandOrControl+Shift+J', 'win32')).toBe('Ctrl+Shift+J');
    expect(displayAccelerator('CommandOrControl+Shift+J', 'darwin')).toBe('⌘⇧J');
  });
});
