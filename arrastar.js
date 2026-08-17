/* Arrastar a aba (bottom-sheet) para baixo para fechar — mobile — JC Gestão
 * Pega pelo topo da folha (puxador/cabeçalho), acompanha o dedo e, se passar
 * do limite, desce e fecha; senão, volta ao lugar. Vibração leve ao fechar.
 */
(function () {
  'use strict';
  var sheet = null, wrap = null, startY = 0, dy = 0, h = 0, dragging = false;
  function vibe(n) { try { navigator.vibrate && navigator.vibrate(n); } catch (e) { /* noop */ } }

  function grab(e) {
    if (!window.matchMedia('(max-width:640px)').matches) return;      // só mobile
    var t = e.target;
    var s = t.closest && t.closest('.modal');
    if (!s) return;
    var w = s.closest('.modal-wrap');
    if (!w) return;
    if (t.closest('input, select, textarea, button, a, label, .selwrap')) return; // não em controles
    var rect = s.getBoundingClientRect();
    if ((e.touches[0].clientY - rect.top) > 92) return;               // pega só pelo topo
    sheet = s; wrap = w; startY = e.touches[0].clientY; dy = 0; h = s.offsetHeight || 400; dragging = true;
    sheet.style.transition = 'none';
  }
  function move(e) {
    if (!dragging) return;
    dy = e.touches[0].clientY - startY;
    if (dy < 0) dy = 0;
    sheet.style.transform = 'translateY(' + dy + 'px)';
    if (dy > 4 && e.cancelable) e.preventDefault();
  }
  function fecharBody() {
    document.body.className.split(/\s+/).forEach(function (c) {
      if (/-open$/.test(c) && c !== 'drawer-open') document.body.classList.remove(c);
    });
  }
  function release() {
    if (!dragging) return;
    dragging = false;
    var s = sheet, w = wrap;
    var fechar = dy > (h * 0.28) || dy > 130;
    if (fechar) {
      vibe(12);
      s.style.transition = 'transform .26s cubic-bezier(.33,0,.3,1)';
      s.style.transform = 'translateY(100%)';
      w.style.transition = 'opacity .26s ease';
      w.style.opacity = '0';
      window.setTimeout(function () {
        fecharBody();
        s.style.transition = s.style.transform = '';
        w.style.transition = w.style.opacity = '';
      }, 270);
    } else {
      s.style.transition = 'transform .22s cubic-bezier(.22,.61,.36,1)';
      s.style.transform = '';
      window.setTimeout(function () { s.style.transition = s.style.transform = ''; }, 230);
    }
    sheet = wrap = null;
  }
  document.addEventListener('touchstart', grab, { passive: true });
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', release);
  document.addEventListener('touchcancel', release);
})();
