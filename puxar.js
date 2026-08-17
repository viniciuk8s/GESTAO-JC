/* Puxar para atualizar (pull-to-refresh) — mobile — JC Gestão
 * No topo da página, puxar para baixo mostra o indicador e, ao soltar depois
 * do limite, recarrega os dados. Desativado com modal/menu aberto.
 */
(function () {
  'use strict';
  var startY = 0, pulling = false, dist = 0, THRESH = 70;
  var ind = document.createElement('div');
  ind.className = 'ptr';
  ind.innerHTML = '<span class="ptr-spin"><iconify-icon icon="ion:refresh-outline"></iconify-icon></span>';
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(ind); });
  if (document.body) document.body.appendChild(ind);

  function atTop() { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; }
  function bloqueado() { return /(^|\s)[a-z-]+-open(\s|$)/.test(document.body.className); }

  function start(e) {
    if (!window.matchMedia('(max-width:640px)').matches) return;
    if (!atTop() || bloqueado()) return;
    startY = e.touches[0].clientY; pulling = true; dist = 0;
  }
  function move(e) {
    if (!pulling) return;
    var d = e.touches[0].clientY - startY;
    if (d <= 0 || !atTop()) { dist = 0; ind.style.transform = ''; ind.classList.remove('ready'); return; }
    dist = Math.min(d * 0.5, 120);
    ind.style.transform = 'translate(-50%,' + (dist - 46) + 'px)';
    ind.classList.toggle('ready', dist >= THRESH);
    var sp = ind.querySelector('.ptr-spin'); if (sp) sp.style.transform = 'rotate(' + (dist * 3) + 'deg)';
    if (d > 6 && e.cancelable) e.preventDefault();
  }
  function end() {
    if (!pulling) return;
    pulling = false;
    if (dist >= THRESH) {
      ind.classList.add('loading', 'ready');
      ind.style.transform = 'translate(-50%,24px)';
      try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* noop */ }
      window.setTimeout(function () { window.location.reload(); }, 360);
    } else {
      ind.style.transform = ''; ind.classList.remove('ready');
    }
  }
  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
})();
