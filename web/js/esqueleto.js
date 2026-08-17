/* Esqueletos (shimmer) + estados vazios com ação — JC Gestão
 * - Ao carregar, cobre as áreas de dados (gráficos, feed, alertas, agenda) com
 *   um shimmer — dá sensação de rapidez.
 * - Quando o conteúdo real chega (o bundle renderiza), o shimmer some.
 * - Se nada vier (sem dados), vira um estado vazio amigável com "Atualizar".
 */
(function () {
  'use strict';
  var ALVOS = '.chart-box, .feed, #h-alertas, #h-ag';
  var MAX = 3500;

  function estadoVazio(el) {
    if (el.querySelector('.estado-vazio')) return;
    var v = document.createElement('div');
    v.className = 'estado-vazio';
    v.innerHTML =
      '<iconify-icon icon="ion:file-tray-outline"></iconify-icon>' +
      '<p>Sem dados para mostrar ainda</p>' +
      '<button type="button" class="ev-btn"><iconify-icon icon="ion:refresh-outline"></iconify-icon> Atualizar</button>';
    v.querySelector('.ev-btn').addEventListener('click', function () { window.location.reload(); });
    el.appendChild(v);
  }

  function skel(el) {
    if (el._skel) return;
    // já tem conteúdo? (bundle já renderizou) — não cobre
    if (el.children.length && !el.querySelector('.skel')) return;
    el._skel = true;
    el.classList.add('skel-host');
    var s = document.createElement('div');
    s.className = 'skel';
    var isChart = el.classList.contains('chart-box');
    s.innerHTML = isChart
      ? '<div class="skel-bar"></div>'
      : '<div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div>';
    el.appendChild(s);

    var done = false, t;
    function limpar(vazio) {
      if (done) return; done = true;
      try { obs.disconnect(); } catch (e) { /* noop */ }
      window.clearTimeout(t);
      if (s.parentNode) s.parentNode.removeChild(s);
      el.classList.remove('skel-host');
      if (vazio && el.children.length === 0) estadoVazio(el);
    }
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var add = muts[i].addedNodes;
        for (var j = 0; j < add.length; j++) {
          if (add[j] !== s && add[j].nodeType === 1) { limpar(false); return; }
        }
      }
    });
    try { obs.observe(el, { childList: true }); } catch (e) { /* noop */ }
    t = window.setTimeout(function () { limpar(true); }, MAX);
  }

  function init() {
    var els = document.querySelectorAll(ALVOS);
    for (var i = 0; i < els.length; i++) skel(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
