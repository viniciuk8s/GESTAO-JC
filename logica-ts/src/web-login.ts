/**
 * Tela de login (browser). Só "Entrar" — o sistema tem 2 usuários fixos (CEO e TI),
 * não há cadastro nem solicitação de acesso.
 */
const API_BASE: string = (window as unknown as { JC_API?: string }).JC_API || 'http://localhost:3000';

function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }
function erroEm(sel: string, msg?: string): void {
  const e = qs<HTMLElement>(sel); if (!e) return;
  if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
}

async function entrar(): Promise<void> {
  const email = (qs<HTMLInputElement>('#lg-email')?.value ?? '').trim();
  const senha = qs<HTMLInputElement>('#lg-senha')?.value ?? '';
  const btn = qs<HTMLButtonElement>('#lg-entrar');
  erroEm('#lg-erro');
  if (!email || !senha) { erroEm('#lg-erro', 'Informe e-mail e senha.'); return; }
  if (btn) btn.disabled = true;
  try {
    const r = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    const j = (await r.json().catch(() => ({}))) as { token?: string; user?: unknown; erro?: string };
    if (!r.ok || !j.token) { erroEm('#lg-erro', j.erro || 'Não foi possível entrar.'); if (btn) btn.disabled = false; return; }
    localStorage.setItem('jc_token', j.token);
    localStorage.setItem('jc_user', JSON.stringify(j.user));
    location.href = 'home.html';
  } catch {
    erroEm('#lg-erro', 'Servidor indisponível. Inicie a API e tente novamente.');
    if (btn) btn.disabled = false;
  }
}

function boot(): void {
  if (localStorage.getItem('jc_token')) { location.replace('home.html'); return; }
  qs<HTMLElement>('#lg-entrar')?.addEventListener('click', () => { void entrar(); });
  ['#lg-email', '#lg-senha'].forEach((s) => qs<HTMLElement>(s)?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') void entrar(); }));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export {};
