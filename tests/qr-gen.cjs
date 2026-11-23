// Writes QR matrices for a set of strings so tests/qr_decode.py can check them with OpenCV.
const SL = require('../src/qr.js');
const out = process.argv[2] || '/tmp/qr/cases.json';
const cases = ['hi', 'https://github.com/mukeshkbj', 'é unicode ✓ 日本'];
for (const n of [20, 50, 100, 150, 250, 400, 600]) cases.push('X'.repeat(3) + Array.from({ length: n }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789'[(i * 7) % 36]).join(''));
const res = [];
for (const text of cases) for (const ecl of ['M', 'L']) { const q = SL.qr.encode(text, ecl); res.push({ text, ecl, version: q.version, m: q.modules.map(r => r.map(v => v ? 1 : 0).join('')) }); }
require('fs').writeFileSync(out, JSON.stringify(res));
console.log('wrote', res.length, 'codes, versions', [...new Set(res.map(r => r.version))].join(','));
