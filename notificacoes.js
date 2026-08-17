/* Painel de Notificações (mobile) — JC Gestão
 * - Sino abre uma SEÇÃO com a lista (carregada de GET /api/notificacoes).
 * - Tocar numa notificação abre um MENU de ações (sem backdrop) com ícones:
 *     Marcar como lida · Marcar como não lida · Excluir.
 * - Cada ação PERSISTE no servidor (por usuário) via a API:
 *     lida/não lida → POST /api/notificacoes/:id/ler {lida}
 *     excluir       → POST /api/notificacoes/:id/dispensar
 *     todas lidas   → POST /api/notificacoes/ler-todas {chaves}
 * O token é anexado automaticamente pelo patch de fetch do auth.js.
 */
(function () {
  'use strict';
  var bell = document.querySelector('.bell');
  if (!bell) return;
  var API = (window.JC_API) || 'http://localhost:3000';

  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="nt-overlay" id="nt-overlay" hidden></div>' +
    '<aside class="nt-panel" id="nt-panel" hidden aria-label="Notificações">' +
      '<header class="nt-head">' +
        '<b>Notificações</b>' +
        '<button class="nt-readall" id="nt-readall">Marcar todas como lidas</button>' +
        '<button class="nt-close" id="nt-close" aria-label="Fechar">&times;</button>' +
      '</header>' +
      '<div class="nt-push" id="nt-push" hidden>' +
        '<span class="nt-push-lbl"><iconify-icon icon="ion:notifications-outline"></iconify-icon> Avisos no celular</span>' +
        '<button class="nt-push-btn" id="nt-push-btn" type="button">Ativar</button>' +
      '</div>' +
      '<div class="nt-list" id="nt-list"></div>' +
    '</aside>' +
    '<div class="nt-menu" id="nt-menu" hidden role="menu">' +
      '<button data-act="lida" role="menuitem"><iconify-icon icon="ion:checkmark-done-outline"></iconify-icon> Marcar como lida</button>' +
      '<button data-act="nao-lida" role="menuitem"><iconify-icon icon="ion:arrow-undo-outline"></iconify-icon> Marcar como não lida</button>' +
      '<button data-act="excluir" class="danger" role="menuitem"><iconify-icon icon="ion:trash-outline"></iconify-icon> Excluir</button>' +
    '</div>';
  document.body.appendChild(wrap);

  var overlay = document.getElementById('nt-overlay');
  var panel = document.getElementById('nt-panel');
  var list = document.getElementById('nt-list');
  var menu = document.getElementById('nt-menu');
  var alvo = null;
  var dados = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function icone(n) { return ({ servico: 'calendar-number-outline', pagamento: 'wallet-outline', documento: 'document-text-outline' })[n.tipo] || 'notifications-outline'; }
  function quando(n) { if (n.dias === 0) return 'hoje'; if (n.dias < 0) return Math.abs(n.dias) + 'd atrás'; return 'em ' + n.dias + 'd'; }

  function render() {
    if (!dados.length) { list.innerHTML = '<div class="nt-vazio"><iconify-icon icon="ion:notifications-off-outline"></iconify-icon><p>Nenhuma notificação por aqui.</p></div>'; return; }
    list.innerHTML = dados.map(function (n) {
      return '<div class="nt-item ' + (n.lida ? 'lida' : '') + ' sev-' + n.severidade + '" data-id="' + esc(n.id) + '">' +
        '<span class="nt-ic"><iconify-icon icon="ion:' + icone(n) + '"></iconify-icon></span>' +
        '<div class="nt-txt"><b>' + esc(n.titulo) + '</b><small>' + esc(n.descricao) + '</small></div>' +
        '<span class="nt-quando">' + quando(n) + '</span>' +
        (n.lida ? '' : '<span class="nt-dot" aria-label="não lida"></span>') +
      '</div>';
    }).join('');
  }

  function atualizarBadge() {
    var n = dados.filter(function (x) { return !x.lida; }).length;
    var b = document.querySelector('.bell .badge');
    if (b) b.textContent = n > 0 ? String(n) : '';
    // atualiza IMEDIATAMENTE o badge visível (do bundle): some quando zera
    var nb = document.querySelector('.bell .notif-badge');
    if (nb) { if (n > 0) { nb.hidden = false; nb.textContent = n > 99 ? '99+' : String(n); } else { nb.hidden = true; nb.textContent = ''; } }
    bell.classList.toggle('has-notif', n > 0);
  }
  function avisarMudou() { try { window.dispatchEvent(new Event('jc:mudou')); } catch (e) { /* noop */ } }

  function carregar() {
    list.innerHTML = '<div class="nt-vazio">Carregando…</div>';
    fetch(API + '/api/notificacoes').then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) { dados = (d && d.notificacoes) || []; render(); atualizarBadge(); })
      .catch(function () { list.innerHTML = '<div class="nt-vazio">Não foi possível carregar. O sistema (API) está ligado?</div>'; });
  }

  function abrirPainel() { panel.hidden = false; syncPush(); overlay.hidden = false; requestAnimationFrame(function () { panel.classList.add('on'); overlay.classList.add('on'); }); carregar(); }
  function fecharPainel() { fecharMenu(); panel.classList.remove('on'); overlay.classList.remove('on'); window.setTimeout(function () { panel.hidden = true; overlay.hidden = true; }, 240); }

  function abrirMenu(item) {
    alvo = item.getAttribute('data-id');
    var n = dados.find(function (x) { return x.id === alvo; });
    menu.querySelector('[data-act=lida]').style.display = (n && n.lida) ? 'none' : '';
    menu.querySelector('[data-act=nao-lida]').style.display = (n && !n.lida) ? 'none' : '';
    menu.hidden = false; menu.classList.remove('on');
    var r = item.getBoundingClientRect();
    var h = menu.offsetHeight || 160;
    var top = Math.min(r.bottom + 6, window.innerHeight - h - 12);
    menu.style.top = Math.max(12, top) + 'px';
    requestAnimationFrame(function () { menu.classList.add('on'); });
  }
  function fecharMenu() { menu.classList.remove('on'); menu.hidden = true; alvo = null; }

  function acao(tipo) {
    if (!alvo) return;
    var id = alvo, url, opts;
    if (tipo === 'excluir') { url = API + '/api/notificacoes/' + encodeURIComponent(id) + '/dispensar'; opts = { method: 'POST' }; }
    else { url = API + '/api/notificacoes/' + encodeURIComponent(id) + '/ler'; opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lida: tipo === 'lida' }) }; }
    fecharMenu();
    fetch(url, opts).then(function (r) { if (!r.ok) throw 0; return r.json().catch(function () { return {}; }); })
      .then(function () {
        if (tipo === 'excluir') dados = dados.filter(function (x) { return x.id !== id; });
        else { var n = dados.find(function (x) { return x.id === id; }); if (n) n.lida = (tipo === 'lida'); }
        render(); atualizarBadge(); avisarMudou();
      })
      .catch(function () { carregar(); });
  }

  // sino → abre o painel (antes do handler do bundle antigo)
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.bell')) { e.stopPropagation(); e.preventDefault(); abrirPainel(); }
  }, true);
  document.getElementById('nt-close').addEventListener('click', fecharPainel);
  overlay.addEventListener('click', fecharPainel);
  document.getElementById('nt-readall').addEventListener('click', function () {
    var chaves = dados.filter(function (x) { return !x.lida; }).map(function (x) { return x.id; });
    if (!chaves.length) return;
    fetch(API + '/api/notificacoes/ler-todas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chaves: chaves }) })
      .then(function (r) { if (!r.ok) throw 0; return r.json().catch(function () { return {}; }); })
      .then(function () { dados.forEach(function (x) { x.lida = true; }); render(); atualizarBadge(); avisarMudou(); })
      .catch(function () { carregar(); });
  });
  list.addEventListener('click', function (e) { var it = e.target.closest('.nt-item'); if (it) { e.stopPropagation(); abrirMenu(it); } });
  menu.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (b) { e.stopPropagation(); acao(b.getAttribute('data-act')); } });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target) && !(e.target.closest && e.target.closest('.nt-item'))) fecharMenu(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!menu.hidden) fecharMenu(); else if (!panel.hidden) fecharPainel(); } });

  // ---- Avisos nativos no celular (push local) ----
  var pushBar = document.getElementById('nt-push');
  var pushBtn = document.getElementById('nt-push-btn');
  function syncPush() {
    if (!pushBar || !pushBtn || typeof window.jcNotifStatus !== 'function') return;
    var st = window.jcNotifStatus();
    if (st === 'sem-suporte') { pushBar.hidden = true; return; }
    pushBar.hidden = false;
    pushBar.classList.toggle('on', st === 'on');
    pushBtn.textContent = st === 'on' ? 'Ativado' : st === 'bloqueado' ? 'Bloqueado' : 'Ativar';
    pushBtn.disabled = (st === 'bloqueado');
  }
  if (pushBtn) pushBtn.addEventListener('click', function () {
    var st = window.jcNotifStatus && window.jcNotifStatus();
    if (st === 'on') { window.jcDesativarNotificacoes && window.jcDesativarNotificacoes(); syncPush(); if (window.jcToast) window.jcToast('Avisos no celular desativados'); return; }
    if (window.jcPedirNotificacoes) window.jcPedirNotificacoes(function (ok, motivo) {
      syncPush();
      if (window.jcToast) window.jcToast(ok ? 'Avisos no celular ativados' : motivo === 'denied' ? 'Permissão negada pelo navegador' : 'Não foi possível ativar');
    });
  });

})();
