// Spec section 0, definition of done: no TODO or FIXME without a ticket id, e.g. `TODO(T-041)`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|mjs|cjs|css|html|yml|yaml|java)$/.test(f) && existsSync(f));

const bad = /\b(TODO|FIXME)\b(?!\(T-\d{3}\))/;
const hits = [];
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (bad.test(line) && !file.endsWith('check-todos.js')) hits.push(`${file}:${String(i + 1)}`);
    });
}
if (hits.length > 0) {
  console.error(`TODO/FIXME without a ticket id, use TODO(T-0xx):\n${hits.join('\n')}`);
  process.exit(1);
}
