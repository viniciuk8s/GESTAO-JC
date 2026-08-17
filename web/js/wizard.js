/* Wizard de formulários em etapas — JC Gestão
 * - Barra de progresso no RODAPÉ (footer) do form.
 * - AVANÇO AUTOMÁTICO só quando TODOS os campos da etapa estão preenchidos:
 *     texto/número/data com valor · seleção tocada · arquivo escolhido.
 *   Ao completar, avança de imediato (com uma pequena espera só na digitação).
 * - "Próximo" manual continua exigindo apenas os campos obrigatórios (atalho
 *   para pular campos opcionais).
 * - Mantém todos os campos no DOM: a lógica de salvar dos bundles não muda.
 */
(function () {
  'use strict';

  function initWizard(wz) {
    var modal = wz.closest('.modal') || wz.parentNode;
    var steps = Array.prototype.slice.call(wz.querySelectorAll('.wz-step'));
    if (steps.length < 2) return;
    var total = steps.length;

    var foot = modal.querySelector('.wz-foot');
    var head = wz.querySelector('.wz-head');
    if (head && foot && head.parentNode !== foot) foot.appendChild(head);

    var back = modal.querySelector('.wz-back');
    var next = modal.querySelector('.wz-next');
    var submit = modal.querySelector('.wz-submit');
    var cancel = modal.querySelector('.wz-cancel');
    var dots = modal.querySelectorAll('.wz-dots i');
    var nameEl = modal.querySelector('.wz-name');
    var curEl = modal.querySelector('.wz-cur');
    var totEl = modal.querySelector('.wz-total');
    if (totEl) totEl.textContent = String(total);

    var i = 0;
    var timer = null;

    function render(dir) {
      steps.forEach(function (s, k) { s.classList.toggle('on', k === i); });
      wz.classList.toggle('back', dir < 0);
      for (var k = 0; k < dots.length; k++) dots[k].classList.toggle('on', k <= i);
      if (nameEl) nameEl.textContent = steps[i].getAttribute('data-name') || ('Etapa ' + (i + 1));
      if (curEl) curEl.textContent = String(i + 1);
      if (cancel) cancel.style.display = i === 0 ? '' : 'none';
      if (back) back.style.display = i === 0 ? 'none' : '';
      if (next) next.style.display = i < total - 1 ? '' : 'none';
      if (submit) submit.style.display = i === total - 1 ? '' : 'none';
      if (dir !== 0) {
        var f = steps[i].querySelector('input:not([type=hidden]):not([type=file]), select, textarea');
        if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* noop */ } }
      }
    }

    // um campo específico está "ok"?
    function campoOk(f) {
      if (f.disabled) return true;
      var tag = f.tagName, type = (f.type || '').toLowerCase();
      if (type === 'hidden' || type === 'checkbox' || type === 'radio') return true;
      if (tag === 'TEXTAREA') return true;                       // opcional
      if (type === 'file') return !!(f.files && f.files.length); // precisa de arquivo
      if (tag === 'SELECT') return f.dataset.wzTouched === '1';  // precisa tocar
      return !!String(f.value != null ? f.value : '').trim();    // texto/número/data
    }
    // TODOS os campos da etapa preenchidos? (para o avanço automático)
    function etapaCompleta(step) {
      var fs = step.querySelectorAll('input, select, textarea');
      for (var k = 0; k < fs.length; k++) { if (!campoOk(fs[k])) return false; }
      return true;
    }
    // só os obrigatórios (para o "Próximo" manual)
    function faltaObrig(step) {
      var reqs = step.querySelectorAll('[required]');
      for (var k = 0; k < reqs.length; k++) {
        if (!String(reqs[k].value != null ? reqs[k].value : '').trim()) return reqs[k];
      }
      return null;
    }

    function valida() {
      var f = faltaObrig(steps[i]);
      if (f) {
        f.classList.add('wz-invalid');
        try { f.focus({ preventScroll: true }); } catch (e) { /* noop */ }
        window.setTimeout(function () { f.classList.remove('wz-invalid'); }, 700);
        return false;
      }
      return true;
    }

    function ir(dir) { i += dir; render(dir); }

    // avança sozinho quando a etapa fica 100% completa
    function agendarAuto(delay) {
      window.clearTimeout(timer);
      if (i >= total - 1) return;                 // última etapa: só salvar
      if (!etapaCompleta(steps[i])) return;
      var alvo = i;
      timer = window.setTimeout(function () {
        if (i === alvo && i < total - 1 && etapaCompleta(steps[i])) {
          wz.classList.add('wz-auto');
          ir(1);
          window.setTimeout(function () { wz.classList.remove('wz-auto'); }, 400);
        }
      }, delay);
    }

    if (next) next.addEventListener('click', function () { window.clearTimeout(timer); if (i < total - 1 && valida()) ir(1); });
    if (back) back.addEventListener('click', function () { window.clearTimeout(timer); if (i > 0) ir(-1); });

    // marca seleção como "tocada" (mesmo mantendo o padrão) ao mexer/sair dela
    function marcar(e) { var t = e.target; if (t && t.tagName === 'SELECT') t.dataset.wzTouched = '1'; }

    wz.addEventListener('input', function () { agendarAuto(550); });      // digitação: espera curta
    wz.addEventListener('change', function (e) { marcar(e); agendarAuto(160); }); // discreto: imediato
    wz.addEventListener('focusout', function (e) { marcar(e); agendarAuto(160); });
    wz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA' && i < total - 1) {
        e.preventDefault(); window.clearTimeout(timer);
        if (valida()) ir(1);
      }
    });

    wz._reset = function () {
      window.clearTimeout(timer);
      var sels = wz.querySelectorAll('select');
      for (var k = 0; k < sels.length; k++) delete sels[k].dataset.wzTouched;
      i = 0; render(0);
    };
    render(0);
  }

  function boot() {
    var ws = document.querySelectorAll('[data-wizard]');
    for (var k = 0; k < ws.length; k++) { if (!ws[k]._init) { ws[k]._init = true; initWizard(ws[k]); } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  var visto = new WeakMap();
  function aoMudar() {
    var ws = document.querySelectorAll('[data-wizard]');
    for (var k = 0; k < ws.length; k++) {
      var wz = ws[k];
      var vis = wz.offsetParent !== null;
      if (vis && !visto.get(wz) && wz._reset) wz._reset();
      visto.set(wz, vis);
    }
  }
  try { new MutationObserver(aoMudar).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] }); } catch (e) { /* noop */ }
})();
