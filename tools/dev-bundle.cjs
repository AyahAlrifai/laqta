// macOS development runs use the stock Electron.app, so the Dock, the app menu and
// Cmd+Tab say "Electron" with Electron's icon. Both come from the bundle's Info.plist and
// cannot be changed at runtime. This copies Electron.app to app/.dev/Laqta.app, renames it,
// gives it the Laqta icon and re-signs it ad hoc (editing Info.plist breaks the signature).
// It rebuilds only when the Electron version or the icon changes.
//   node tools/dev-bundle.cjs                      prints the executable path
//   node tools/dev-bundle.cjs <command> [args...]  runs the command with ELECTRON_EXEC_PATH
//                                                  set (electron-vite honours it)
// On Windows and Linux the command runs unchanged: the stock binary is used there.
const { execFileSync, spawnSync } = require('node:child_process');
const {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const command = process.argv.slice(2);

function run(env) {
  // shell: true resolves the package's bin scripts on every platform.
  const result = spawnSync(command.join(' '), { stdio: 'inherit', shell: true, env });
  process.exit(result.status ?? 1);
}

if (process.platform !== 'darwin') {
  if (command.length > 0) run(process.env);
  console.error('dev-bundle: macOS only');
  process.exit(1);
}

const appDir = join(__dirname, '..', 'app');
const electronDir = join(appDir, 'node_modules', 'electron');
const source = join(electronDir, 'dist', 'Electron.app');
const icon = join(appDir, 'build', 'icon.png');
const target = join(appDir, '.dev', 'Laqta.app');
const stamp = join(appDir, '.dev', 'stamp.json');
const executable = join(target, 'Contents', 'MacOS', 'Electron');

const want = JSON.stringify({
  electron: JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8')).version,
  icon: statSync(icon).mtimeMs,
});
const have = existsSync(stamp) ? readFileSync(stamp, 'utf8') : '';

if (want !== have || !existsSync(executable)) {
  rmSync(target, { recursive: true, force: true });
  // verbatimSymlinks keeps the framework's relative links intact.
  cpSync(source, target, { recursive: true, verbatimSymlinks: true });

  const plist = join(target, 'Contents', 'Info.plist');
  const set = (key, value) =>
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
  set('CFBundleName', 'Laqta');
  set('CFBundleDisplayName', 'Laqta');
  // A separate id keeps macOS permissions for the dev copy apart from the released app.
  set('CFBundleIdentifier', 'com.laqta.app.dev');

  const work = mkdtempSync(join(tmpdir(), 'laqta-icon-'));
  const iconset = join(work, 'icon.iconset');
  execFileSync('mkdir', [iconset]);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const px = String(size * scale);
      const name = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
      execFileSync('sips', ['-z', px, px, icon, '--out', join(iconset, name)], { stdio: 'ignore' });
    }
  }
  const iconFile = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIconFile', plist])
    .toString()
    .trim();
  const icns = join(
    target,
    'Contents',
    'Resources',
    iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`,
  );
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns]);
  rmSync(work, { recursive: true, force: true });

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', target], { stdio: 'ignore' });
  // Make Finder and the Dock pick up the new name and icon.
  execFileSync('touch', [target]);
  writeFileSync(stamp, want);
}

if (command.length > 0) run({ ...process.env, ELECTRON_EXEC_PATH: executable });
console.log(executable);
