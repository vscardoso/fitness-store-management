// Service worker mínimo: torna o app instalável. Não faz cache de API nem de telas,
// então a loja sempre vê dados e versão atuais (rede primeiro, sem offline).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
