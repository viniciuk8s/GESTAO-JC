/* Perfil + Configurar conta (mobile) — JC Gestão
 * - Avatar no topo com FOTO (busca /auth/me) ou iniciais.
 * - Ao tocar no avatar abre uma ABA INFERIOR (mesmo layout da confirmação de
 *   sair) com: nome, e-mail, "Configurar conta" e "Sair da conta".
 * - Configurar conta: trocar foto, e-mail e senha → vai para o TI aprovar.
 */
(function () {
  'use strict';
  var btn = document.getElementById('pf-btn');
  if (!btn) return;
  var API = (window.JC_API) || 'http://localhost:3000';

  var nome = 'João Carlos', mail = 'ceo@jcsolar.com', foto = '';
  try { var u = JSON.parse(localStorage.getItem('jc_user') || 'null'); if (u) { nome = u.nome || u.name || nome; mail = u.email || mail; foto = u.foto || ''; } } catch (e) { /* noop */ }

  function iniciais(n) { return n.trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function conteudoAvatar() { return foto ? '<img src="' + foto + '" alt="">' : iniciais(nome); }
  function pintarAvatares() {
    var ini = conteudoAvatar();
    document.querySelectorAll('#pf-btn .pf-av, #pf-menu .pf-av.lg, #cfg-av').forEach(function (el) { el.innerHTML = ini; el.classList.toggle('foto', !!foto); });
    var nEl = document.querySelector('#pf-menu .pf-id b'), mEl = document.querySelector('#pf-menu .pf-id small');
    if (nEl) nEl.textContent = nome; if (mEl) mEl.textContent = mail;
  }

  // ---- ABA INFERIOR de conta (mesmo layout da confirmação de sair) ----
  var menu = document.createElement('div');
  menu.className = 'cf-overlay'; menu.id = 'pf-menu'; menu.hidden = true;
  menu.innerHTML =
    '<div class="cf-sheet pf-sheet" role="dialog" aria-modal="true">' +
      '<div class="pf-head"><span class="pf-av lg">' + conteudoAvatar() + '</span>' +
        '<div class="pf-id"><b>' + nome + '</b><small>' + mail + '</small></div></div>' +
      '<div class="pf-opts">' +
        '<button class="pf-item neutro" id="pf-config"><iconify-icon icon="ion:settings-outline"></iconify-icon> Configurar conta</button>' +
        '<button class="pf-item" data-logout><iconify-icon icon="ion:log-out-outline"></iconify-icon> Sair da conta</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(menu);

  function abrir() { menu.hidden = false; requestAnimationFrame(function () { menu.classList.add('on'); }); btn.classList.add('on'); }
  function fechar() { menu.classList.remove('on'); btn.classList.remove('on'); window.setTimeout(function () { menu.hidden = true; }, 240); }
  btn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden ? abrir() : fechar(); });
  menu.addEventListener('click', function (e) { if (e.target === menu) fechar(); });      // toca no fundo → fecha
  menu.addEventListener('click', function (e) { if (e.target.closest('[data-logout]')) fechar(); }, true);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) fechar(); });

  // ---- Folha "Configurar conta" (bottom-sheet) ----
  var sheet = document.createElement('div');
  sheet.className = 'modal-wrap'; sheet.id = 'cfg-sheet';
  sheet.innerHTML =
    '<div class="modal modal-lg"><div class="modal-head"><h3>Configurar conta</h3><button class="mclose" aria-label="Fechar">&times;</button></div>' +
    '<div class="modal-body">' +
      '<div class="f-erros" id="cfg-erro" hidden></div>' +
      '<div class="cfg-foto"><span class="pf-av lg" id="cfg-av">' + conteudoAvatar() + '</span>' +
        '<label class="btn btn-ghost" for="cfg-file"><iconify-icon icon="ion:camera-outline"></iconify-icon> Trocar foto</label>' +
        '<input type="file" id="cfg-file" accept="image/*" hidden></div>' +
      '<div class="form-grid">' +
        '<div class="field span2"><label>Novo e-mail (opcional)</label><input class="inp" id="cfg-email" type="email" inputmode="email" autocomplete="off" placeholder="deixe em branco para não mudar"></div>' +
        '<div class="field span2"><label>Nova senha (opcional)</label><input class="inp" id="cfg-senha" type="password" autocomplete="new-password" placeholder="mínimo de 6 caracteres"></div>' +
        '<div class="field span2"><label>Confirmar nova senha</label><input class="inp" id="cfg-senha2" type="password" autocomplete="new-password" placeholder="repita a nova senha"></div>' +
      '</div>' +
      '<p class="cfg-nota"><iconify-icon icon="ion:shield-checkmark-outline"></iconify-icon> As mudanças só valem depois que o TI aprovar.</p>' +
    '</div>' +
    '<div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="cfg-enviar">Enviar para o TI</button></div></div>';
  document.body.appendChild(sheet);

  var fotoNova = '';
  function erro(m) { var e = document.getElementById('cfg-erro'); if (!e) return; if (m) { e.textContent = m; e.hidden = false; } else { e.hidden = true; } }

  document.getElementById('pf-config').addEventListener('click', function () {
    fechar(); erro(''); fotoNova = '';
    document.getElementById('cfg-email').value = ''; document.getElementById('cfg-senha').value = ''; document.getElementById('cfg-senha2').value = '';
    var av = document.getElementById('cfg-av'); av.innerHTML = conteudoAvatar(); av.classList.toggle('foto', !!foto);
    window.setTimeout(function () { document.body.classList.add('cfg-open'); }, 200);
  });

  document.getElementById('cfg-file').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var img = new Image();
    img.onload = function () {
      var max = 256, s = Math.min(max / img.width, max / img.height, 1);
      var w = Math.round(img.width * s), h = Math.round(img.height * s);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      fotoNova = cv.toDataURL('image/jpeg', 0.82);
      var av = document.getElementById('cfg-av'); av.innerHTML = '<img src="' + fotoNova + '" alt="">'; av.classList.add('foto');
      try { URL.revokeObjectURL(img.src); } catch (e) { /* noop */ }
    };
    img.src = URL.createObjectURL(f);
  });

  document.getElementById('cfg-enviar').addEventListener('click', async function () {
    var email = (document.getElementById('cfg-email').value || '').trim();
    var senha = document.getElementById('cfg-senha').value || '', senha2 = document.getElementById('cfg-senha2').value || '';
    erro('');
    if (!email && !senha && !fotoNova) return erro('Informe ao menos uma mudança.');
    if (senha && senha.length < 6) return erro('A nova senha deve ter ao menos 6 caracteres.');
    if (senha && senha !== senha2) return erro('As senhas não conferem.');
    var body = {}; if (email) body.email = email; if (senha) body.senha = senha; if (fotoNova) body.foto = fotoNova;
    var btnE = this; btnE.disabled = true; var txt = btnE.textContent; btnE.textContent = 'Enviando...';
    try {
      var r = await fetch(API + '/auth/alteracoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok) { document.body.classList.remove('cfg-open'); if (window.jcToast) window.jcToast('Enviado para o TI aprovar'); }
      else erro((d && d.erro) || 'Não foi possível enviar.');
    } catch (e) { erro('Sem conexão com o sistema (API).'); }
    btnE.disabled = false; btnE.textContent = txt;
  });

  pintarAvatares();
  fetch(API + '/auth/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (d && d.user) {
      nome = d.user.nome || nome; mail = d.user.email || mail; foto = d.user.foto || '';
      try { localStorage.setItem('jc_user', JSON.stringify({ nome: nome, email: mail, foto: foto })); } catch (e) { /* noop */ }
      pintarAvatares();
    }
  }).catch(function () { /* noop */ });
})();
