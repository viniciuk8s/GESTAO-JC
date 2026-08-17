/* Logout com confirmação (mobile) — JC Gestão
 * Folha de confirmação (bottom-sheet no celular). Intercepta qualquer botão
 * "sair" (.uicon ou [data-logout]) ANTES do handler do auth.js, evitando saída
 * acidental. Ao confirmar, limpa a sessão e volta ao login.
 */
(function () {
  'use strict';
  if (!document.querySelector('.uicon, [data-logout]')) return;

  var HTML =
    '<div class="cf-overlay" id="cf-sair" hidden>' +
      '<div class="cf-sheet" role="dialog" aria-modal="true">' +
        '<div class="cf-ic"><iconify-icon icon="ion:log-out-outline"></iconify-icon></div>' +
        '<h3>Sair da conta?</h3>' +
        '<p>Você vai precisar entrar de novo com seu e-mail e senha.</p>' +
        '<div class="cf-actions">' +
          '<button class="btn btn-ghost" data-cf="cancel">Cancelar</button>' +
          '<button class="btn btn-primary" data-cf="ok">Sair</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', HTML);
  var ov = document.getElementById('cf-sair');

  function abrir() {
    document.body.classList.remove('drawer-open');
    var pm = document.getElementById('pf-menu');
    if (pm) { pm.hidden = true; pm.classList.remove('on'); }
    ov.hidden = false;
    requestAnimationFrame(function () { ov.classList.add('on'); });
  }
  function fechar() { ov.classList.remove('on'); window.setTimeout(function () { ov.hidden = true; }, 240); }
  function sair() {
    try { localStorage.removeItem('jc_token'); localStorage.removeItem('jc_user'); } catch (e) { /* noop */ }
    window.location.href = 'login.html';
  }

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.uicon, [data-logout]');
    if (b) { e.stopPropagation(); e.preventDefault(); abrir(); }
  }, true);

  ov.addEventListener('click', function (e) {
    var t = e.target;
    if (t === ov || (t.closest && t.closest('[data-cf="cancel"]'))) fechar();
    else if (t.closest && t.closest('[data-cf="ok"]')) sair();
  });
})();
