/* Interação de toque — JC Gestão
 * Som, ripple e atraso de navegação removidos: navegação é instantânea e silenciosa.
 * Mantém window.jcVibe como no-op para não quebrar quem chama.
 */
(function () {
  'use strict';
  window.jcVibe = function () { /* sem vibração por toque */ };
  window.jcSom = { plink: function () {} };
})();
