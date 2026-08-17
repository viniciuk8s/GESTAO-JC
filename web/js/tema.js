/* Alternador de tema (claro/escuro) — JC Gestão
 * Guarda a escolha em localStorage ('jc-tema') e troca as logos por versão
 * clara (azul-marinho) ou escura (azul-claro). O data-theme já é aplicado
 * cedo por um script no <head> para não piscar.
 */
(function () {
  'use strict';
  var KEY = 'jc-tema';
  function get() { try { var t = localStorage.getItem(KEY); if (t) return t; return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; } }
  function save(t) { try { localStorage.setItem(KEY, t); } catch (e) { /* noop */ } }

  function trocarLogos(t) {
    var lg = t === 'light' ? 'img/logo-light.png' : 'img/logo-dark.png';
    var at = t === 'light' ? 'img/atom-light.png' : 'img/atom-dark.png';
    document.querySelectorAll('.sb-logo, .auth-logo img').forEach(function (i) { i.src = lg; });
    document.querySelectorAll('.atom').forEach(function (i) { i.src = at; });
    var wv = t === 'light' ? 'img/elemento-light.png' : 'img/elemento-dark.png';
    document.querySelectorAll('.auth-wave').forEach(function (i) { i.src = wv; });
  }
  function trocarIcone(t) {
    var b = document.getElementById('theme-btn'); if (!b) return;
    b.innerHTML = t === 'light'
      ? '<iconify-icon icon="ion:sunny-outline"></iconify-icon>'
      : '<iconify-icon icon="ion:moon-outline"></iconify-icon>';
  }
  var _timer = null;
  function aplicar(t, anim) {
    var el = document.documentElement;
    if (anim) {
      el.classList.add('tema-anim');
      if (_timer) window.clearTimeout(_timer);
      _timer = window.setTimeout(function () { el.classList.remove('tema-anim'); }, 300);
    }
    el.setAttribute('data-theme', t);
    trocarLogos(t); trocarIcone(t);
  }

  aplicar(get());
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (ev) { try { if (!localStorage.getItem(KEY)) aplicar(ev.matches ? 'dark' : 'light', true); } catch (e) {} }); } catch (e) { /* noop */ }
  var btn = document.getElementById('theme-btn');
  if (btn) btn.addEventListener('click', function () {
    var t = get() === 'light' ? 'dark' : 'light';
    save(t); aplicar(t, true);
  });
})();
