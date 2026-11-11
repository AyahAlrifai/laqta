import { useEffect, useRef, useState } from 'react';
import type { VoiceLanguage } from '../../shared/types';
import { laqta } from '../shared/api';
import { useI18n } from '../shared/i18n';
import { MicIcon } from '../shared/icons';
import Select from '../shared/Select';
import styles from './Editor.module.css';

// Spec section 6 (Phase 2, behind voiceEnabled): toggle recording with the button or Space,
// 60 second limit, level meter, polite live region. Audio stays in memory.

const MAX_MS = 60_000;

interface Props {
  language: VoiceLanguage;
  onLanguage: (l: VoiceLanguage) => void;
  onTranscript: (text: string) => void;
}

export default function MicButton({ language, onLanguage, onTranscript }: Props) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<number | null>(null);
  const meter = useRef<number | null>(null);

  useEffect(() => () => stopTracks(), []);

  function stopTracks() {
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
    if (meter.current !== null) cancelAnimationFrame(meter.current);
  }

  async function start() {
    const allowed = await laqta.permissionsRequestMicrophone().catch(() => false);
    if (!allowed) {
      setDenied(true);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setDenied(true);
      return;
    }
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(peak / 128);
      meter.current = requestAnimationFrame(tick);
    };
    tick();
    chunks.current = [];
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    rec.ondataavailable = (e) => chunks.current.push(e.data);
    rec.onstop = () => {
      void audioCtx.close();
      void transcribe(new Blob(chunks.current, { type: 'audio/webm' }));
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setAnnounce(t('editor.recording'));
    stopTimer.current = window.setTimeout(stop, MAX_MS);
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stopTracks();
    setRecording(false);
    setLevel(0);
    setAnnounce(t('editor.stopped'));
  }

  async function transcribe(blob: Blob) {
    setBusy(true);
    try {
      const audio = new Uint8Array(await blob.arrayBuffer());
      const { text } = await laqta.voiceTranscribe({
        audio,
        mime: 'audio/webm;codecs=opus',
        language,
      });
      audio.fill(0);
      onTranscript(text);
    } catch {
      setAnnounce(t('error.AI_UNAVAILABLE'));
    } finally {
      chunks.current = [];
      setBusy(false);
    }
  }

  const toggle = () => (recording ? stop() : void start());

  return (
    <div className={styles.voiceRow}>
      <button
        type="button"
        className="btn"
        aria-pressed={recording}
        disabled={denied || busy}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <MicIcon />
        {recording ? t('editor.stop') : t('editor.speak')}
      </button>
      {recording && (
        <span
          className={styles.meter}
          style={{ transform: `scaleX(${String(Math.max(level, 0.05))})` }}
          aria-hidden="true"
        />
      )}
      <label className="visually-hidden" htmlFor="voice-language">
        {t('editor.voiceLanguage')}
      </label>
      <Select
        id="voice-language"
        label={t('editor.voiceLanguage')}
        className={styles.voiceSelect}
        value={language}
        onChange={(v) => onLanguage(v === 'ar-JO' ? 'ar-JO' : v === 'en' ? 'en' : 'auto')}
        options={[
          { value: 'ar-JO', label: t('lang.arJO') },
          { value: 'en', label: t('lang.en') },
          { value: 'auto', label: t('lang.auto') },
        ]}
      />
      <p className={styles.hint}>
        {denied ? t('editor.micDenied') : busy ? t('editor.transcribing') : t('editor.voiceHint')}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
