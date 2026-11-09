import { centredShape, commit, move, redo, undo, type Tool } from './model';
import type { WorkbenchStore } from '../workbench/store';

// Single-key tool shortcuts and canvas keyboard operation (spec section 5, accessibility).

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  b: 'box',
  a: 'arrow',
  t: 'text',
  r: 'redact',
};

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Returns true when the key was handled. */
export function handleEditorKey(
  event: KeyboardEvent,
  s: WorkbenchStore,
  image: { width: number; height: number },
): boolean {
  if (isTyping(event.target)) return false;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === 'z') {
    s.set({ history: event.shiftKey ? redo(s.history) : undo(s.history), selectedId: null });
    return true;
  }
  if (mod || event.altKey) return false;
  const tool = TOOL_KEYS[key];
  if (tool !== undefined) {
    s.set({ tool });
    return true;
  }
  const onCanvas = event.target instanceof HTMLCanvasElement;
  if (!onCanvas) return false;
  if ((event.key === 'Delete' || event.key === 'Backspace') && s.selectedId !== null) {
    s.set({
      history: commit(
        s.history,
        s.history.present.filter((x) => x.id !== s.selectedId),
      ),
      selectedId: null,
    });
    return true;
  }
  if (event.key === 'Escape' && s.selectedId !== null) {
    s.set({ selectedId: null });
    return true;
  }
  if (event.key.startsWith('Arrow') && s.selectedId !== null) {
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    s.set({
      history: commit(
        s.history,
        s.history.present.map((x) => (x.id === s.selectedId ? move(x, dx, dy) : x)),
      ),
    });
    return true;
  }
  if (event.key === 'Enter' && s.tool !== 'select') {
    if (s.tool === 'text' && s.textLabel.trim() === '') return false;
    const shape = centredShape(
      s.tool,
      image.width,
      image.height,
      s.textLabel.trim(),
      s.redactionMode,
    );
    s.set({ history: commit(s.history, [...s.history.present, shape]), selectedId: shape.id });
    return true;
  }
  return false;
}
