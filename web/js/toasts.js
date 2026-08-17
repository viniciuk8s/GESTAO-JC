/* Toasts de confirmação — JC Gestão
 * window.jcToast(msg, tipo) mostra um aviso curto que some sozinho.
 * Também envolve o fetch para dar feedback automático em salvar/excluir
 * (POST/PUT/DELETE em /api/, exceto notificações, que têm feedback próprio).
 */
(function () {
  'use strict';
  window.jcToast = function (msg, tipo) {
    var box = document.getElementById('jc-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'jc-toasts'; document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'jc-toast' + (tipo === 'erro' ? ' erro' : '');
    t.innerHTML = '<iconify-icon icon="' + (tipo === 'erro' ? 'ion:alert-circle-outline' : 'ion:checkmark-circle-outline') + '"></iconify-icon><span></span>';
    t.querySelector('span').textContent = msg;
    box.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    window.setTimeout(function () {
      t.classList.remove('on');
      window.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, 2600);
  };

  var _f = window.fetch;
  if (typeof _f === 'function') {
    window.fetch = function (url, opts) {
      var p = _f.apply(this, arguments);
      try {
        var u = String(url), m = ((opts && opts.method) || 'GET').toUpperCase();
        if (/\/api\//.test(u) && /^(POST|PUT|PATCH|DELETE)$/.test(m) && !/\/notificacoes\//.test(u)) {
          p.then(function (r) {
            if (r && r.ok) {
              var msg = m === 'DELETE' ? 'Excluído' : (/importar/.test(u) ? 'Importado' : 'Salvo');
              window.jcToast(msg);
              try { navigator.vibrate && navigator.vibrate(10); } catch (e) { /* noop */ }
            }
          }).catch(function () { /* noop */ });
        }
      } catch (e) { /* noop */ }
      return p;
    };
  }
})();
