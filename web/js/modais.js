/* Fecho animado de modais — JC Gestão
 * Ao clicar FORA do modal (no fundo) ou no X / Cancelar, o modal desce
 * rapidamente e o fundo esvaece; só então ele é removido de fato.
 * Intercepta em fase de captura para animar antes do fecho do bundle.
 */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var wrap = t.closest('.modal-wrap');
    if (!wrap) return;
    // é um fecho? clicou no próprio fundo, no X (.mclose) ou em [data-close]
    var fechar = (t === wrap) || t.closest('.mclose') || t.closest('[data-close]');
    if (!fechar) return;
    if (wrap.classList.contains('closing')) return; // já animando
    e.stopPropagation(); e.preventDefault();
    wrap.classList.add('closing');
    window.setTimeout(function () {
      wrap.classList.remove('closing');
      // remove a classe *-open do body (fecha), preservando o drawer lateral
      document.body.className.split(/\s+/).forEach(function (c) {
        if (/-open$/.test(c) && c !== 'drawer-open') document.body.classList.remove(c);
      });
    }, 230);
  }, true);
})();
