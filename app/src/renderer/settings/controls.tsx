import { useState, type ReactNode } from 'react';
import { useI18n } from '../shared/i18n';
import { acceleratorKeycaps, recordAccelerator } from './accelerator';
import styles from './Settings.module.css';

// Small form controls used only by the Settings window. Each one is a real form element
// (radio, checkbox, button) underneath, so keyboard and screen-reader behaviour is native.

interface SegmentedProps<T extends string> {
  name: string;
  labelledBy: string;
  value: T;
  options: { value: T; label: string; lang?: string }[];
  onChange: (value: T) => void;
}

/** A radio group drawn as a segmented control. */
export function Segmented<T extends string>(props: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-labelledby={props.labelledBy}>
      {props.options.map((option) => {
        const id = `${props.name}-${option.value}`;
        return (
          <span key={option.value} className={styles.segment}>
            <input
              id={id}
              type="radio"
              name={props.name}
              value={option.value}
              checked={props.value === option.value}
              onChange={() => props.onChange(option.value)}
            />
            <label htmlFor={id} lang={option.lang}>
              {option.label}
            </label>
          </span>
        );
      })}
    </div>
  );
}

interface SwitchRowProps {
  id: string;
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A whole-row label around a checkbox with the switch role, so the hit area is the row. */
export function SwitchRow(props: SwitchRowProps) {
  const helpId = props.help === undefined ? undefined : `${props.id}-help`;
  return (
    <label className={`${styles.row} ${styles.clickable}`} htmlFor={props.id}>
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{props.label}</span>
        {props.help !== undefined && (
          <span id={helpId} className={styles.rowHelp}>
            {props.help}
          </span>
        )}
      </span>
      <input
        id={props.id}
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={props.checked}
        aria-describedby={helpId}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

interface RowProps {
  labelId?: string;
  htmlFor?: string;
  label: string;
  help?: string;
  children: ReactNode;
}

/** Label (and optional help) at the start, control at the end. */
export function Row(props: RowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowText}>
        {props.htmlFor !== undefined ? (
          <label id={props.labelId} className={styles.rowLabel} htmlFor={props.htmlFor}>
            {props.label}
          </label>
        ) : (
          <span id={props.labelId} className={styles.rowLabel}>
            {props.label}
          </span>
        )}
        {props.help !== undefined && <span className={styles.rowHelp}>{props.help}</span>}
      </span>
      <span className={styles.rowControl}>{props.children}</span>
    </div>
  );
}

interface ShortcutProps {
  id: string;
  label: string;
  value: string;
  mac: boolean;
  onChange: (accelerator: string) => void;
}

/**
 * Click, then press the keys. Escape or leaving the control cancels. The shortcut that is
 * currently registered cannot be recorded again: the system delivers it to Laqta's global
 * handler, not to this page, which is harmless because it is already the value.
 */
export function ShortcutRecorder(props: ShortcutProps) {
  const { t, f } = useI18n();
  const [listening, setListening] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const keycaps = acceleratorKeycaps(props.value, props.mac);

  const stop = () => {
    setListening(false);
    setInvalid(false);
  };

  return (
    <span className={styles.shortcut}>
      <button
        id={props.id}
        type="button"
        className={`${styles.shortcutButton} ${listening ? styles.listening : ''}`}
        aria-label={f('settings.shortcutButton', {
          label: props.label,
          shortcut: keycaps.join(' '),
        })}
        aria-pressed={listening}
        onClick={() => (listening ? stop() : setListening(true))}
        onBlur={stop}
        onKeyDown={(e) => {
          if (!listening) return;
          // Let Tab move focus as usual; it also ends recording through onBlur.
          if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) return;
          e.preventDefault();
          const result = recordAccelerator(e, props.mac);
          if (result.kind === 'accelerator') {
            props.onChange(result.value);
            stop();
          } else if (result.kind === 'cancel') {
            stop();
          } else if (result.kind === 'invalid') {
            setInvalid(true);
          }
        }}
      >
        {listening ? (
          <span className={styles.listeningText}>{t('settings.shortcutListening')}</span>
        ) : (
          keycaps.map((cap, i) => (
            <kbd key={`${cap}-${i}`} className={styles.keycap}>
              {cap}
            </kbd>
          ))
        )}
      </button>
      <span className={styles.shortcutHint} aria-live="polite">
        {listening && invalid ? t('settings.shortcutInvalid') : ''}
      </span>
    </span>
  );
}
