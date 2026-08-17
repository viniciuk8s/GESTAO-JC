/* Máscara de moeda (R$ 1.234,56) — JC Gestão
 * Formata os campos de dinheiro (.money-input input) enquanto digita.
 * O backend/bundle já entende esse formato (remove pontos, vírgula = decimal).
 */
(function () {
  'use strict';
  function fmt(v) {
    var d = String(v).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    if (!d) return '';
    while (d.length < 3) d = '0' + d;
    var cents = d.slice(-2), int = d.slice(0, -2);
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return int + ',' + cents;
  }
  function aplicar(inp) {
    if (inp._mask) return; inp._mask = true;
    inp.addEventListener('input', function () {
      var v = fmt(inp.value);
      if (v !== inp.value) { inp.value = v; }
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* noop */ }
    });
  }
  function init() {
    var ins = document.querySelectorAll('.money-input input');
    for (var i = 0; i < ins.length; i++) aplicar(ins[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // reaplica quando modais aparecem (campos já existem no DOM, mas garante)
  try { new MutationObserver(init).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) { /* noop */ }
})();
