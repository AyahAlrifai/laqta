import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  HARDENED_WEB_PREFERENCES,
  isAppUrl,
  permissionDecision,
  windowBackground,
} from './window-policy';

describe('window hardening (spec section 10)', () => {
  it('uses the hardened webPreferences', () => {
    expect(HARDENED_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });

  it('has the strict CSP with no network access', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe');
  });

  it('denies every permission except workbench microphone with voice on', () => {
    expect(permissionDecision('media', 'workbench', true, ['audio'])).toBe(true);
    expect(permissionDecision('media', 'workbench', false, ['audio'])).toBe(false);
    expect(permissionDecision('media', 'workbench', true, ['audio', 'video'])).toBe(false);
    expect(permissionDecision('media', 'overlay', true, ['audio'])).toBe(false);
    expect(permissionDecision('media', 'workbench', true, [])).toBe(false);
    for (const p of [
      'geolocation',
      'notifications',
      'clipboard-read',
      'openExternal',
      'display-capture',
    ]) {
      expect(permissionDecision(p, 'workbench', true, ['audio'])).toBe(false);
    }
  });

  it('recognises only app renderer URLs', () => {
    const dir = '/Applications/Laqta.app/Contents/Resources/app.asar/out/renderer';
    expect(isAppUrl(`file://${dir}/workbench/index.html`, undefined, dir)).toBe(true);
    expect(isAppUrl('file:///etc/passwd', undefined, dir)).toBe(false);
    expect(isAppUrl(`file://${dir}-evil/x.html`, undefined, dir)).toBe(false);
    expect(isAppUrl('https://evil.test/', undefined, dir)).toBe(false);
    expect(isAppUrl('http://localhost:5173/overlay/index.html', 'http://localhost:5173', dir)).toBe(
      true,
    );
    expect(isAppUrl('http://localhost:5174/overlay/index.html', 'http://localhost:5173', dir)).toBe(
      false,
    );
  });
});

describe('window background (spec section 9, appearance)', () => {
  it('matches the surface token of the active theme, so windows never flash', () => {
    expect(windowBackground('settings', false)).toBe('#FFFFFF');
    expect(windowBackground('workbench', true)).toBe('#1B1E26');
    expect(windowBackground('toast', true)).toBe('#1B1E26');
  });

  it('keeps the overlay transparent in both themes', () => {
    expect(windowBackground('overlay', false)).toBe('#00000000');
    expect(windowBackground('overlay', true)).toBe('#00000000');
  });
});
