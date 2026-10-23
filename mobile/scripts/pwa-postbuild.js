// Roda depois de `expo export --platform web`: injeta as tags de PWA no dist/index.html
// (o modo "single" do Expo ignora app/+html.tsx). Uso: node scripts/pwa-postbuild.js
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(file, 'utf8');
if (html.includes('rel="manifest"')) {
  console.log('PWA: tags ja presentes');
  process.exit(0);
}
// O Ionicons só começaria a baixar depois do JS de 5 MB rodar; o preload antecipa o download.
// crossorigin é obrigatório: fonte é sempre buscada em modo CORS, sem ele o preload é baixado duas vezes.
const iconFont = (function find(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      const r = find(p);
      if (r) return r;
    } else if (/^Ionicons\.[0-9a-f]+\.ttf$/.test(f.name)) {
      return '/' + path.relative(path.join(__dirname, '..', 'dist'), p).split(path.sep).join('/');
    }
  }
  return null;
})(path.join(__dirname, '..', 'dist', 'assets'));
if (!iconFont) {
  console.error('PWA: fonte Ionicons nao encontrada em dist/assets');
  process.exit(1);
}
// Versão deste build (commit do GitHub; local = hora). O app compara com /version.json para avisar/atualizar sozinho.
const BUILD_ID = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);
fs.writeFileSync(
  path.join(__dirname, '..', 'dist', 'version.json'),
  JSON.stringify({ build: BUILD_ID, builtAt: new Date().toISOString() }),
);
const tags = `
    <script>window.__APP_BUILD__=${JSON.stringify(BUILD_ID)};</script>
    <link rel="preload" href="${iconFont}" as="font" type="font/ttf" crossorigin />
    <style id="pwa-fill">
      /* No iPhone instalado, 100% de altura deixava uma faixa branca embaixo: prende o app nas 4 bordas */
      body { height: 100%; margin: 0; background-color: #F8F9FA; }
      /* 100lvh = altura real da tela; no iOS instalado 100% e bottom:0 ficam ~55pt menores */
      html { height: 100vh; height: 100lvh; touch-action: manipulation; -webkit-text-size-adjust: 100%; }
      /* iOS dá zoom ao focar campo com fonte menor que 16px; o maximum-scale=1 do viewport impede, e isto garante */
      input, textarea, select { font-size: max(16px, 1em); }
      #root { position: fixed; top: 0; left: 0; width: 100%; height: 100vh; height: 100lvh; }
    </style>
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#7C3AED" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Provador" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js')})}</script>`;
html = html
  .replace(/<title>[^<]*<\/title>/, '<title>Provador</title>')
  .replace('<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />',
           '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover" />')
  .replace('</head>', tags + '\n  </head>');
fs.writeFileSync(file, html);
console.log('PWA: tags injetadas em dist/index.html (build ' + BUILD_ID + ')');
