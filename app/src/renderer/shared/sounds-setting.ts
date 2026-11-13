import { laqta } from './api';
import { playCue, type CueName } from './sounds';

/**
 * Plays a cue unless Settings › Appearance › Play sounds is off. Reads the setting fresh, so a
 * change saved while the Workbench or a toast is open applies at once. Never throws.
 */
export function playCueIfEnabled(name: CueName): void {
  void laqta.settingsGet().then(
    (view) => {
      if (view.settings.soundsEnabled) playCue(name);
    },
    () => undefined,
  );
}
