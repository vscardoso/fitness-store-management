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
const tags = `
    <style id="pwa-fill">
      /* No iPhone instalado, 100% de altura deixava uma faixa branca embaixo: prende o app nas 4 bordas */
      html, body { height: 100%; margin: 0; background-color: #F8F9FA; }
      #root { position: fixed; top: 0; right: 0; bottom: 0; left: 0; height: auto; }
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
           '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />')
  .replace('</head>', tags + '\n  </head>');
fs.writeFileSync(file, html);
console.log('PWA: tags injetadas em dist/index.html');
