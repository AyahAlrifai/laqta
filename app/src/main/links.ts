// Spec section 10: links open only through this helper, which accepts the configured Jira
// host (for example a browse URL the app just created) and nothing else. The macOS
// permission deep links are fixed constants, never built from input.

export const MAC_SCREEN_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
export const MAC_MICROPHONE_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';

export function isAllowedJiraLink(url: string, jiraBaseUrl: string): boolean {
  if (jiraBaseUrl === '') return false;
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(jiraBaseUrl);
  } catch {
    return false;
  }
  return (
    target.protocol === 'https:' &&
    target.username === '' &&
    target.password === '' &&
    target.host === base.host
  );
}
