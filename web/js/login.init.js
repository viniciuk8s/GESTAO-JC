(function(){
  var API=(window.JC_API)||'http://localhost:3000';
  var L=document.getElementById('card-login'),S=document.getElementById('card-signup'),O=document.getElementById('card-ok');
  function mostra(el){[L,S,O].forEach(function(c){if(c)c.hidden=(c!==el)});try{window.scrollTo(0,0)}catch(e){}}
  function bindEye(be,bs){if(be&&bs)be.addEventListener('click',function(){var v=bs.type==='password';bs.type=v?'text':'password';be.innerHTML=v?'<iconify-icon icon="ion:eye-off-outline"></iconify-icon>':'<iconify-icon icon="ion:eye-outline"></iconify-icon>';bs.focus()})}
  bindEye(document.getElementById('lg-eye'),document.getElementById('lg-senha'));
  bindEye(document.getElementById('sg-eye'),document.getElementById('sg-senha'));
  var a1=document.getElementById('ir-criar');if(a1)a1.addEventListener('click',function(){mostra(S)});
  var a2=document.getElementById('ir-login');if(a2)a2.addEventListener('click',function(){mostra(L)});
  var a3=document.getElementById('ok-voltar');if(a3)a3.addEventListener('click',function(){mostra(L)});
  var btn=document.getElementById('sg-enviar');
  function erro(m){var e=document.getElementById('sg-erro');e.textContent=m;e.hidden=false}
  if(btn)btn.addEventListener('click',async function(){
    var nome=(document.getElementById('sg-nome').value||'').trim();
    var email=(document.getElementById('sg-email').value||'').trim();
    var senha=document.getElementById('sg-senha').value||'';
    document.getElementById('sg-erro').hidden=true;
    if(nome.length<2)return erro('Informe seu nome completo.');
    if(email.indexOf('@')<1||email.indexOf('.',email.indexOf('@'))<0)return erro('E-mail inválido.');
    if(senha.length<6)return erro('A senha deve ter ao menos 6 caracteres.');
    btn.disabled=true;var t=btn.textContent;btn.textContent='Enviando...';
    try{var r=await fetch(API+'/auth/registrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:nome,email:email,senha:senha})});var d=await r.json().catch(function(){return{}});if(r.ok){mostra(O)}else{erro((d&&d.erro)||'Não foi possível enviar. Tente novamente.')}}catch(e){erro('Sem conexão. Verifique se o sistema (API) está ligado.')}
    btn.disabled=false;btn.textContent=t;
  });
})()
