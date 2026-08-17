/**
 * Central de notificações (browser) — carregada em toda página do app.
 * Liga o sino do header à API: contador de pendências + painel com serviços,
 * pagamentos e documentos. Suporta **marcar como lida** e **dispensar**, ambos
 * persistentes no banco por usuário (GET/POST /api/notificacoes...). O badge
 * conta apenas as NÃO lidas; dispensadas somem da lista.
 */
import { type Notificacao, type NotifSeveridade, type NotifTipo } from './notificacoes.ts';

const API_BASE = (window as unknown as { JC_API?: string }).JC_API || 'http://localhost:3000';

type NotifUI = Notificacao & { lida: boolean };
interface Payload { hoje: string; notificacoes: NotifUI[]; resumo: { total: number; naoLidas: number; criticos: number; porTipo: Record<NotifTipo, number> }; }

let dados: NotifUI[] = [];
let naoLidas = 0;
let criticos = 0;
let aberto = false;

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }
function brl(c: number): string {
  const neg = c < 0; const t = Math.abs(Math.round(c));
  const r = Math.floor(t / 100); const cent = t % 100; const s = String(r);
  let g = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) g += '.'; g += s[i]; }
  return `${neg ? '-' : ''}R$ ${g},${String(cent).padStart(2, '0')}`;
}
function quando(dias: number): string {
  if (dias < 0) return `atrasado ${-dias} ${-dias === 1 ? 'dia' : 'dias'}`;
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}
const ICONE: Record<NotifTipo, string> = { servico: 'calendar-clock', pagamento: 'circle-dollar-sign', documento: 'file-text' };
function icon(name: string): string { return `<iconify-icon icon="ion:${name}"></iconify-icon>`; }
function recalc(): void {
  naoLidas = dados.filter((n) => !n.lida).length;
  criticos = dados.filter((n) => !n.lida && n.severidade === 'critico').length;
}
async function post(path: string, body: unknown): Promise<void> {
  try { await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch { /* offline: reconciliar no próximo poll */ }
}

// ---------- estrutura (badge no sino + painel) ----------
function bell(): HTMLElement | null { return document.querySelector<HTMLElement>('.bell'); }

function montar(): HTMLElement | null {
  const b = bell();
  if (!b) return null;
  if (!b.querySelector('.notif-badge')) {
    b.insertAdjacentHTML('beforeend', '<span class="notif-badge" hidden></span>');
    b.setAttribute('aria-haspopup', 'true');
    b.setAttribute('aria-expanded', 'false');
  }
  let pop = document.getElementById('notif-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'notif-pop';
    pop.className = 'notif-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Notificações');
    pop.hidden = true;
    pop.innerHTML = '<div class="notif-head"><b>Notificações</b><div class="notif-head-r">'
      + '<span class="notif-count-lbl"></span>'
      + '<button class="notif-read-all" type="button" hidden>Marcar todas lidas</button>'
      + '</div></div><div class="notif-list"></div>';
    document.body.appendChild(pop);
    pop.addEventListener('click', (e) => e.stopPropagation());
    pop.querySelector('.notif-read-all')?.addEventListener('click', () => void marcarTodas());
    // delegação: dispensar (X) e abrir item (marca lida + navega)
    const list = pop.querySelector<HTMLElement>('.notif-list');
    list?.addEventListener('click', (e) => {
      const alvo = e.target as HTMLElement;
      const x = alvo.closest<HTMLElement>('.notif-x');
      if (x) { e.preventDefault(); void dispensar(x.getAttribute('data-x') || ''); return; }
      const item = alvo.closest<HTMLElement>('.notif-item');
      if (item) void abrirItem(item.getAttribute('data-id') || '', item.getAttribute('data-href') || '');
    });
    list?.addEventListener('keydown', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('.notif-item');
      if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void abrirItem(item.getAttribute('data-id') || '', item.getAttribute('data-href') || ''); }
    });
    b.addEventListener('click', (e) => { e.stopPropagation(); alternar(); });
    document.addEventListener('click', () => { if (aberto) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aberto) fechar(); });
  }
  return pop;
}

function renderBadge(): void {
  const b = bell(); if (!b) return;
  const badge = b.querySelector<HTMLElement>('.notif-badge');
  if (!badge) return;
  b.classList.toggle('has-notif', naoLidas > 0);
  if (naoLidas === 0) { badge.hidden = true; return; }
  badge.hidden = false;
  badge.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
  badge.classList.toggle('crit', criticos > 0);
}

function renderPainel(): void {
  const pop = document.getElementById('notif-pop'); if (!pop) return;
  const lbl = pop.querySelector<HTMLElement>('.notif-count-lbl');
  const ra = pop.querySelector<HTMLElement>('.notif-read-all');
  if (lbl) lbl.textContent = naoLidas ? `${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}` : (dados.length ? 'tudo lido' : '');
  if (ra) ra.hidden = naoLidas === 0;
  const list = pop.querySelector<HTMLElement>('.notif-list'); if (!list) return;
  if (dados.length === 0) {
    list.innerHTML = `<div class="notif-empty">${icon('checkmark-done-outline')}<b>Tudo em dia</b><small>Nenhuma pendência no momento.</small></div>`;
    return;
  }
  list.innerHTML = dados.map((n) => {
    const sev = n.severidade as NotifSeveridade;
    const val = typeof n.valorCentavos === 'number' ? `<span class="notif-val">${brl(n.valorCentavos)}</span>` : '';
    return `<div class="notif-item sev-${sev}${n.lida ? ' lida' : ''}" data-id="${esc(n.id)}" data-href="${esc(n.href)}" role="link" tabindex="0" aria-label="${esc(n.titulo)}">`
      + `<span class="notif-ic ${sev}">${icon(ICONE[n.tipo])}</span>`
      + `<div class="notif-main"><b>${esc(n.titulo)}</b><small>${esc(n.descricao)}</small></div>`
      + `<div class="notif-meta"><span class="notif-when ${sev}">${quando(n.dias)}</span>${val}</div>`
      + `<button class="notif-x" type="button" data-x="${esc(n.id)}" aria-label="Dispensar" title="Dispensar">${icon('close-outline')}</button>`
      + `</div>`;
  }).join('');
}

// ---------- ações (lida / dispensar / todas) ----------
async function abrirItem(id: string, href: string): Promise<void> {
  if (!id) return;
  await post(`/api/notificacoes/${encodeURIComponent(id)}/ler`, {}); // marca lida antes de sair
  if (href) location.href = href;
}
async function dispensar(id: string): Promise<void> {
  if (!id) return;
  dados = dados.filter((n) => n.id !== id); // otimista
  recalc(); renderBadge(); renderPainel();
  await post(`/api/notificacoes/${encodeURIComponent(id)}/dispensar`, {});
}
async function marcarTodas(): Promise<void> {
  const chaves = dados.filter((n) => !n.lida).map((n) => n.id);
  if (!chaves.length) return;
  dados = dados.map((n) => ({ ...n, lida: true })); // otimista
  recalc(); renderBadge(); renderPainel();
  await post('/api/notificacoes/ler-todas', { chaves });
}

// ---------- abrir/fechar ----------
function alternar(): void { if (aberto) fechar(); else abrir(); }
function abrir(): void {
  const pop = montar(); if (!pop) return;
  renderPainel();
  pop.hidden = false; aberto = true;
  bell()?.setAttribute('aria-expanded', 'true');
  bell()?.classList.add('on');
}
function fechar(): void {
  const pop = document.getElementById('notif-pop');
  if (pop) pop.hidden = true;
  aberto = false;
  bell()?.setAttribute('aria-expanded', 'false');
  bell()?.classList.remove('on');
}

// ---------- dados ----------
async function carregar(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/notificacoes`);
    if (!r.ok) return;
    const p = (await r.json()) as Payload;
    dados = Array.isArray(p.notificacoes) ? p.notificacoes : [];
    recalc();
  } catch { /* offline: mantém o estado atual */ }
  renderBadge();
  if (aberto) renderPainel();
}

function boot(): void {
  if (!montar()) return; // página sem sino (ex.: login)
  void carregar();
  window.setInterval(() => { void carregar(); }, 60_000); // rede de segurança
  window.addEventListener('jc:mudou', () => { void carregar(); }); // muda o negócio → recalcula o sino na hora
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export {};
