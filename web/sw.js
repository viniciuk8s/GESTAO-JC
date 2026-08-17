/* Service Worker — JC Gestão (PWA)
 * - torna o app instalável (manifest + SW com handler de fetch)
 * - cacheia o "shell" (páginas/CSS/JS/ícones já visitados) para abrir offline
 * - NUNCA cacheia a API (:3000, origem diferente): sempre rede
 * - clique na notificação foca/abre a tela certa
 */
const CACHE = 'jc-gestao-1786972943';
const CORE = ['./css/app.css', './img/icon-192.png', './img/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // adiciona o núcleo item a item (se um falhar, não quebra a instalação)
      .then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // outra origem (ex.: API em :3000) → deixa ir direto para a rede
  if (url.origin !== self.location.origin) return;

  // navegação de página → rede primeiro, cai para o cache quando offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then((m) => m || caches.match('./home.html')))
    );
    return;
  }

  // CSS e JS → REDE PRIMEIRO (sempre pega a versão nova); cache é só reserva offline.
  if (/\.(?:css|js)(?:\?|$)/.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((r) => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return r; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // imagens e demais estáticos → cache primeiro (raramente mudam)
  e.respondWith(
    caches.match(req).then((m) => m || fetch(req).then((r) => {
      if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return r;
    }).catch(() => m))
  );
});

// clique na notificação → foca uma janela aberta (ou abre) e navega para o href
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || './home.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) { try { c.navigate(href); } catch (_) { /* noop */ } return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
      return undefined;
    })
  );
});

// (opcional) suporte futuro a Web Push do servidor — mostra a notificação recebida
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  const titulo = d.titulo || 'JC Gestão';
  const opts = {
    body: d.descricao || '',
    icon: 'img/icon-192.png',
    badge: 'img/icon-192.png',
    tag: d.id ? ('jc-' + d.id) : undefined,
    data: { href: d.href || './home.html' }
  };
  e.waitUntil(self.registration.showNotification(titulo, opts));
});
