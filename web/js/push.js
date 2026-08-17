/* Notificações nativas na bandeja do celular — JC Gestão
 * Mostra avisos do sistema (serviços a chegar, contas a vencer, documentos)
 * como notificações do celular, com ícone e texto. Usa Notification API +
 * Service Worker (registration.showNotification). Sem servidor externo.
 *
 * Disparo: ao mudar algo em tempo real (SSE 'jc:mudou') e por segurança a cada
 * 2 min. Só mostra o que é NOVO (dedup por id via localStorage) e não repete o
 * que já estava lá quando você ativou.
 *
 * API pública (usada pelo painel do sino):
 *   window.jcNotifStatus()        -> 'on' | 'off' | 'bloqueado' | 'sem-suporte'
 *   window.jcPedirNotificacoes(cb)-> pede permissão (precisa de clique do usuário)
 *   window.jcDesativarNotificacoes()
 */
(function () {
  'use strict';
  var API = (window.JC_API) || 'http://localhost:3000';
  var K_VISTAS = 'jc-notif-vistas';
  var K_ATIVO = 'jc-notif-push';

  function suportado() { return ('Notification' in window) && ('serviceWorker' in navigator); }
  function ativo() { try { return localStorage.getItem(K_ATIVO) === 'on'; } catch (e) { return false; } }
  function vistas() { try { return JSON.parse(localStorage.getItem(K_VISTAS) || '[]'); } catch (e) { return []; } }
  function salvarVistas(a) { try { localStorage.setItem(K_VISTAS, JSON.stringify(a.slice(-300))); } catch (e) { /* noop */ } }
  function reg() { return (navigator.serviceWorker && navigator.serviceWorker.ready) || Promise.reject(new Error('sw')); }

  window.jcNotifStatus = function () {
    if (!suportado()) return 'sem-suporte';
    if (Notification.permission === 'denied') return 'bloqueado';
    return ativo() && Notification.permission === 'granted' ? 'on' : 'off';
  };
  window.jcDesativarNotificacoes = function () { try { localStorage.setItem(K_ATIVO, 'off'); } catch (e) { /* noop */ } };
  window.jcPedirNotificacoes = function (cb) {
    if (!suportado()) { if (cb) cb(false, 'sem-suporte'); return; }
    Notification.requestPermission().then(function (p) {
      var ok = p === 'granted';
      try { localStorage.setItem(K_ATIVO, ok ? 'on' : 'off'); } catch (e) { /* noop */ }
      if (ok) {
        // não floodar: marca o que já existe como visto e mostra um aviso de boas-vindas
        marcarTudoVisto().then(function () {
          reg().then(function (r) {
            r.showNotification('Avisos ativados', {
              body: 'Você será avisado aqui sobre serviços, contas e documentos.',
              icon: 'img/icon-192.png', badge: 'img/icon-192.png', tag: 'jc-boasvindas',
              data: { href: './home.html' }
            });
          }).catch(function () { /* noop */ });
          if (cb) cb(true);
        });
      } else if (cb) cb(false, p);
    });
  };

  function fetchNotifs() {
    return fetch(API + '/api/notificacoes').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function marcarTudoVisto() {
    return fetchNotifs().then(function (d) {
      if (d && d.notificacoes) salvarVistas(d.notificacoes.map(function (n) { return n.id; }));
    });
  }
  function mostrar(n) {
    return reg().then(function (r) {
      return r.showNotification(n.titulo, {
        body: n.descricao || '',
        icon: 'img/icon-192.png',
        badge: 'img/icon-192.png',
        tag: 'jc-' + n.id,
        renotify: false,
        data: { href: n.href || './home.html' },
        vibrate: [40, 30, 40]
      });
    }).catch(function () { /* noop */ });
  }

  var verificando = false;
  function verificar() {
    if (verificando || !ativo() || !suportado() || Notification.permission !== 'granted') return;
    verificando = true;
    fetchNotifs().then(function (d) {
      verificando = false;
      if (!d || !d.notificacoes) return;
      var ja = vistas();
      var novas = d.notificacoes.filter(function (n) { return !n.lida && ja.indexOf(n.id) < 0; });
      novas.slice(0, 3).forEach(mostrar); // no máximo 3 por rodada
      salvarVistas(ja.concat(d.notificacoes.map(function (n) { return n.id; })));
    }).catch(function () { verificando = false; });
  }

  // gatilhos
  window.addEventListener('jc:mudou', function () { window.setTimeout(verificar, 900); });
  window.addEventListener('jc:evento', function () { window.setTimeout(verificar, 900); });
  if (suportado()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { window.setTimeout(verificar, 2500); });
    else window.setTimeout(verificar, 2500);
    window.setInterval(verificar, 120000);
  }
})();
