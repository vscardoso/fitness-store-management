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
// Sem <script> embutido (a CSP abaixo só aceita script do próprio site): versão + service worker num arquivo
// com o número do build no nome, para o navegador nunca usar um antigo guardado.
const BOOT = `/pwa-boot.${BUILD_ID}.js`;
fs.writeFileSync(
  path.join(__dirname, '..', 'dist', BOOT.slice(1)),
  `window.__APP_BUILD__=${JSON.stringify(BUILD_ID)};\n` +
    "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js')})}\n",
);
// CSP (item 2.7): script só do próprio site (mais o jsQR do leitor de QR); conexões só com a API, consultas de CEP e Sentry. Estilo inline é
// obrigatório (react-native-web gera <style>). Imagem de qualquer https (logo/foto podem vir de CDN).
// frame-ancestors não vale em <meta>: anti-iframe fica para o nginx.
const apiOrigin = (() => {
  try { return new URL(process.env.EXPO_PUBLIC_API_URL || 'https://api.provadorfit.com.br/api/v1').origin; }
  catch { return 'https://api.provadorfit.com.br'; }
})();
const CSP = [
  "default-src 'self'",
  // leitor de QR do expo-camera: worker criado de blob: que importa o jsQR deste endereço fixo
  "script-src 'self' https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://viacep.com.br https://brasilapi.com.br https://ws.apicep.com https://*.ingest.us.sentry.io`,
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'self' blob:",
  "frame-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
const tags = `
    <script src="${BOOT}"></script>
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
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`;
html = html
  .replace(/<title>[^<]*<\/title>/, '<title>Provador</title>')
  .replace('<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />',
           '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover" />')
  .replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  .replace('</head>', tags + '\n  </head>');
if (!html.includes('Content-Security-Policy') || /<script>/.test(html)) {
  console.error('PWA: CSP não injetada ou ainda há <script> embutido no index.html');
  process.exit(1);
}
fs.writeFileSync(file, html);
console.log('PWA: tags injetadas em dist/index.html (build ' + BUILD_ID + ')');
