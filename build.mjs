// Builds dist/chromium (Chrome, Edge, Brave, Opera, Safari via converter) and dist/firefox,
// plus a zip of each, ready for "Load unpacked" or store upload.  Usage: node build.mjs
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const targets = {
  chromium: { manifest: 'manifests/chromium.json', drop: [] },
  firefox: { manifest: 'manifests/firefox.json', drop: ['offscreen.html', 'offscreen.js'] }
};
rmSync('dist', { recursive: true, force: true });
for (const [name, cfg] of Object.entries(targets)) {
  const out = `dist/${name}`;
  mkdirSync(out, { recursive: true });
  cpSync('src', out, { recursive: true, filter: f => !cfg.drop.some(d => f.endsWith('/' + d)) });
  const m = JSON.parse(readFileSync(cfg.manifest, 'utf8'));
  writeFileSync(`${out}/manifest.json`, JSON.stringify(m, null, 2) + '\n');
  execSync(`cd ${out} && zip -qr ../social-links-${name}-${m.version}.zip .`);
  console.log(`built ${out}  →  dist/social-links-${name}-${m.version}.zip`);
}
