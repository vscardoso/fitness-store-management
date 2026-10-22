// Mede o que o navegador baixa de um build web (bruto e com gzip). Uso: node scripts/measure-dist.js [pasta]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(process.argv[2] || 'dist');
const kb = (n) => Math.round(n / 1024);
const rows = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js|ttf|png)$/.test(f.name)) {
      const buf = fs.readFileSync(p);
      rows.push({ nome: f.name.replace(/\.[0-9a-f]{32}/, ''), raw: buf.length, gz: zlib.gzipSync(buf, { level: 6 }).length });
    }
  }
})(root);

const sum = (list, k) => list.reduce((s, r) => s + r[k], 0);
const js = rows.filter((r) => r.nome.endsWith('.js'));
const ttf = rows.filter((r) => r.nome.endsWith('.ttf'));
console.log(`JS:   bruto ${kb(sum(js, 'raw'))} KB, gzip ${kb(sum(js, 'gz'))} KB`);
console.log(`TTF:  ${ttf.length} arquivos, bruto ${kb(sum(ttf, 'raw'))} KB, gzip ${kb(sum(ttf, 'gz'))} KB`);
for (const r of ttf.sort((a, b) => b.raw - a.raw)) console.log(`  ${r.nome}: bruto ${kb(r.raw)} KB, gzip ${kb(r.gz)} KB`);
