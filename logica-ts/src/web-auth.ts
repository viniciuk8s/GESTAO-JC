/**
 * Guarda de autenticação — incluída em TODAS as páginas do app (menos o login).
 * - Sem token → redireciona para login.html.
 * - Injeta o token no fetch (para /api e /auth) e trata 401 (sessão expirada).
 * - Valida a sessão (/auth/me), preenche o cartão do usuário e o botão Sair.
 * - Marca body.role-admin | body.role-viewer (o CSS esconde ações de escrita p/ viewer).
 */
interface UsuarioPublico { id: string; nome: string; email: string; role: 'admin' | 'viewer'; foto: string | null }

const API_BASE: string = (window as unknown as { JC_API?: string }).JC_API || 'http://localhost:3000';

function limparESair(): void {
  localStorage.removeItem('jc_token');
  localStorage.removeItem('jc_user');
  location.replace('login.html');
}

// 1) Sem token → login (antes de qualquer outra coisa)
const TOKEN = localStorage.getItem('jc_token');
if (!TOKEN) {
  location.replace('login.html');
}

// 2) Papel em cache (evita "piscar" ações antes do /auth/me)
try {
  const cache = JSON.parse(localStorage.getItem('jc_user') || 'null') as UsuarioPublico | null;
  if (cache && cache.role) document.body.classList.add('role-' + cache.role);
} catch { /* ignore */ }

// 3) Patch do fetch: adiciona Authorization e trata 401
type FetchFn = typeof window.fetch;
const _fetch: FetchFn = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const ehApi = url.startsWith(API_BASE) || url.includes('/api/') || url.includes('/auth/');
  let cfg = init;
  if (ehApi) {
    const headers = new Headers(init?.headers);
    const tk = localStorage.getItem('jc_token');
    if (tk && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + tk);
    cfg = { ...init, headers };
  }
  return _fetch(input, cfg).then((res) => {
    if (res.status === 401 && ehApi) limparESair();
    return res;
  });
}) as FetchFn;

// 4) Valida a sessão e monta o cartão do usuário
function iniciais(n: string): string {
  const p = (n || '').trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}
function montarUsuario(u: UsuarioPublico): void {
  document.body.classList.remove('role-admin', 'role-viewer');
  document.body.classList.add('role-' + u.role);
  const card = document.querySelector('.user-card');
  if (!card) return;
  const av = card.querySelector<HTMLElement>('.avatar');
  if (av) {
    if (u.foto) { av.innerHTML = `<img src="${API_BASE}${u.foto}" alt="">`; av.classList.add('foto'); }
    else { av.textContent = iniciais(u.nome); av.classList.remove('foto'); }
  }
  const nome = card.querySelector<HTMLElement>('.uinfo b'); if (nome) nome.textContent = u.nome;
  const papel = card.querySelector<HTMLElement>('.uinfo small'); if (papel) papel.textContent = u.role === 'admin' ? 'Administrador' : 'Colaborador';
  const btn = card.querySelector<HTMLElement>('.uicon');
  if (btn && !btn.getAttribute('data-wired')) {
    btn.setAttribute('data-wired', '1');
    btn.setAttribute('title', 'Sair');
    btn.addEventListener('click', limparESair);
  }
}

if (TOKEN) {
  void fetch(API_BASE + '/auth/me')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('401'))))
    .then((d: { user: UsuarioPublico }) => {
      localStorage.setItem('jc_user', JSON.stringify(d.user));
      montarUsuario(d.user);
    })
    .catch(() => { /* 401 já redireciona; erro de rede mantém a UI atual */ });
}

(window as unknown as { JC_LOGOUT?: () => void }).JC_LOGOUT = limparESair;

// Fecha o menu lateral (drawer) ao clicar fora dele — vale em todas as páginas
document.addEventListener('click', (e) => {
  const b = document.body;
  if (!b.classList.contains('drawer-open')) return;
  const alvo = e.target as Element;
  if (alvo.closest('.sidebar') || alvo.closest('.menu-btn')) return;
  b.classList.remove('drawer-open');
});

export {};
