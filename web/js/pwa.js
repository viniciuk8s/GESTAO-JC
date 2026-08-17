/* PWA — JC Gestão
 * 1) Registra o service worker (torna o app instalável e abre offline).
 * 2) Dispara NOTIFICAÇÕES DO SISTEMA reutilizando a central de notificações do app:
 *    ouve o mesmo sinal `jc:mudou` (SSE) que o sino usa, relê /api/notificacoes
 *    (autenticada pelo patch global do fetch) e avisa quando surge algo novo.
 *    Só avisa com o app em segundo plano (senão já está à vista) e nunca duplica.
 */
(function () {
  'use strict';

  // ---- 1) service worker -------------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* noop */ });
    });
  }

  if (!('Notification' in window)) return;
  var API = (typeof window !== 'undefined' && window.JC_API) || 'http://localhost:3000';

  // ---- 2) permissão ao tocar no sino (gesto do usuário) ------------------
  // captura ANTES do stopPropagation do sino, senão o clique não chegaria aqui.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('.bell') && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (_) { /* noop */ }
    }
  }, true);

  // páginas sem sino (ex.: login) só registram o SW
  if (!document.querySelector('.bell')) return;

  // ---- 3) notificações nativas para novidades ---------------------------
  var vistos = null; // null = 1ª carga (só memoriza); depois vira { id: true }

  function notificar(n) {
    var opts = {
      body: n.descricao || '',
      icon: 'img/icon-192.png',
      badge: 'img/icon-192.png',
      tag: 'jc-' + n.id,
      data: { href: n.href || './home.html' }
    };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready
          .then(function (reg) { reg.showNotification(n.titulo, opts); })
          .catch(function () { new Notification(n.titulo, opts); });
      } else {
        new Notification(n.titulo, opts);
      }
    } catch (_) { /* noop */ }
  }

  function checar() {
    if (Notification.permission !== 'granted') return;
    fetch(API + '/api/notificacoes').then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (p) {
      if (!p) return;
      var lista = (p.notificacoes && typeof p.notificacoes.length === 'number') ? p.notificacoes : [];
      if (vistos === null) { // 1ª carga: memoriza o que já existia, sem avisar
        vistos = {};
        lista.forEach(function (n) { vistos[n.id] = true; });
        return;
      }
      var novas = lista.filter(function (n) { return !n.lida && !vistos[n.id]; });
      lista.forEach(function (n) { vistos[n.id] = true; });
      if (!novas.length) return;
      // não avisa se o app está em primeiro plano (o usuário já vê o sino)
      if (document.visibilityState === 'visible' && document.hasFocus && document.hasFocus()) return;
      novas.slice(0, 3).forEach(notificar);
    }).catch(function () { /* offline: ignora */ });
  }

  window.addEventListener('jc:mudou', checar);   // SSE → mudou o negócio
  window.setInterval(checar, 60000);              // rede de segurança
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', checar);
  else checar();
})();
