// Spec section 11: the release job checks that the built bundle does not contain the
// developer key name, i.e. the direct Anthropic provider was compiled out.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'app/out';
const needles = ['ANTHROPIC_API_KEY', 'api.anthropic.com'];
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|cjs|mjs|html|json)$/.test(name)) {
      const text = readFileSync(path, 'utf8');
      for (const needle of needles) if (text.includes(needle)) hits.push(`${path}: ${needle}`);
    }
  }
}

walk(root);
if (hits.length > 0) {
  console.error(`Release bundle contains the developer provider:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`Release bundle check passed (${root}).`);
