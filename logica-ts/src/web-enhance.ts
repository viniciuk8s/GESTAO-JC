/**
 * Camada de melhorias de UX — carregada em TODAS as páginas do app (como auth.js).
 * Integra bibliotecas JS para dar vida aos dados do banco, sem tocar na lógica:
 *  - CountUp.js  → números de KPI animam e "sobem" quando o dado muda no banco
 *  - Tippy.js    → tooltips ricos em ícones/ações/badges
 *  - IntersectionObserver → reveal suave na entrada + stagger de listas
 *  - JCList      → toolbar reutilizável de busca / ordenação / filtro nas listas
 * Reaplica-se sozinha após os re-renders de ~5s (MutationObserver).
 */
import { CountUp } from 'countup.js';
import tippy from 'tippy.js';

const reduce = typeof window !== 'undefined'
  && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- formatadores (frames intermediários da contagem) ----------------
function sep(n: number): string { return Math.round(n).toLocaleString('pt-BR'); }
function brl(cents: number): string {
  const neg = cents < 0; const t = Math.abs(Math.round(cents));
  const r = Math.floor(t / 100); const c = t % 100;
  return `${neg ? '-' : ''}R$ ${sep(r)},${String(c).padStart(2, '0')}`;
}
function brlk(cents: number): string {
  const v = cents / 100;
  return Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')} mil` : brl(cents);
}
function dur(min: number): string {
  const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); const r = m % 60;
  if (h && r) return `${h}h ${r}min`; if (h) return `${h}h`; return `${r}min`;
}
function fmt(n: number, kind: string): string {
  switch (kind) {
    case 'moeda': return brl(n);
    case 'moedak': return brlk(n);
    case 'pct': return `${Math.round(n)}%`;
    case 'horas': return dur(n);
    default: return sep(n);
  }
}

// ---------- 1) CountUp: KPIs animados com "tick" quando o valor muda ---------
const lastVal = new Map<string, number>();
function contarNumeros(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-count][data-ck]').forEach((el) => {
    const target = parseFloat(el.getAttribute('data-count') || '');
    if (!isFinite(target)) return;
    const key = el.getAttribute('data-ck') as string;
    const kind = el.getAttribute('data-fmt') || 'int';
    const original = el.textContent || '';
    const prev = lastVal.get(key);
    if (prev === target) return; // já está no valor certo — não reescreve (evita loop do observer)
    const start = prev === undefined ? 0 : prev;
    lastVal.set(key, target);
    if (reduce || Math.abs(target - start) < 1) return; // sem animar: o texto do render já está correto
    try {
      const cu = new CountUp(el, target, {
        startVal: start, duration: 1.1, useEasing: true, useGrouping: false,
        formattingFn: (n: number) => fmt(n, kind),
      });
      if (cu.error) { el.textContent = original; return; }
      el.classList.add('counting');
      cu.start(() => { el.textContent = original; el.classList.remove('counting'); });
    } catch { el.textContent = original; }
  });
}

// ---------- 2) reveal on load + stagger de listas ---------------------------
let io: IntersectionObserver | null = null;
function ensureIO(): IntersectionObserver | null {
  if (reduce || !('IntersectionObserver' in window)) return null;
  if (!io) {
    io = new IntersectionObserver((ents) => {
      for (const en of ents) if (en.isIntersecting) { en.target.classList.add('in'); io!.unobserve(en.target); }
    }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
  }
  return io;
}
function revelar(root: ParentNode = document): void {
  const obs = ensureIO();
  const els = root.querySelectorAll<HTMLElement>('.reveal:not(.in)');
  if (!obs) { els.forEach((e) => e.classList.add('in')); return; }
  let i = 0;
  els.forEach((e) => { e.style.transitionDelay = `${Math.min(i++, 8) * 0.05}s`; obs.observe(e); });
}
const STAGGER_ALVOS = ['#dias-list', '#mov-list', '#h-ag', '#h-alertas', '#doc-list', '#proj-list', '#colab-list', '#fisc-list', '#ext-list'];
function escalonar(): void {
  if (reduce) return;
  for (const sel of STAGGER_ALVOS) {
    const c = document.querySelector<HTMLElement>(sel);
    if (c && !c.dataset.staggered && c.children.length) {
      c.classList.add('row-stagger'); c.dataset.staggered = '1';
      window.setTimeout(() => c.classList.remove('row-stagger'), 1000);
    }
  }
}

// ---------- 3) Tooltips (Tippy) ---------------------------------------------
function dicas(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-tip]:not([data-tipped])').forEach((el) => {
    el.setAttribute('data-tipped', '1');
    tippy(el, { content: el.getAttribute('data-tip') || '', allowHTML: true, animation: 'fade', delay: [120, 0] });
  });
  root.querySelectorAll<HTMLElement>('.mini-act[title]:not([data-tipped]), [data-tip-title]:not([data-tipped])').forEach((el) => {
    const t = el.getAttribute('title') || el.getAttribute('data-tip-title') || '';
    if (!t) return;
    el.setAttribute('data-tipped', '1');
    if (el.hasAttribute('title')) el.removeAttribute('title'); // evita tooltip nativo duplicado
    tippy(el, { content: t, animation: 'fade', delay: [150, 0] });
  });
}

// ---------- 4) JCList: toolbar de busca / ordenação / filtro -----------------
interface ListState { q: string; sort: string; sortDir: number; cat: string; sig: string; }
interface ListCfg { search: boolean; ph: string; sorts: [string, string][]; filters: [string, string][]; }
const listState = new Map<string, ListState>();

function parsePares(s: string | null): [string, string][] {
  if (!s) return [];
  return s.split('|').map((p) => { const i = p.indexOf(':'); return i < 0 ? [p, p] as [string, string] : [p.slice(0, i), p.slice(i + 1)] as [string, string]; });
}
function icon(name: string): string { return `<iconify-icon icon="ion:${name}"></iconify-icon>`; }

function montarToolbar(cont: HTMLElement): void {
  const sel = '#' + cont.id;
  if (!cont.id || cont.previousElementSibling?.classList.contains('list-tools')) return; // já montada
  const cfg: ListCfg = {
    search: cont.hasAttribute('data-lt-search'),
    ph: cont.getAttribute('data-lt-ph') || 'Buscar…',
    sorts: parsePares(cont.getAttribute('data-lt-sorts')),
    filters: parsePares(cont.getAttribute('data-lt-filters')),
  };
  if (!cfg.search && !cfg.sorts.length && !cfg.filters.length) return;
  const st: ListState = { q: '', sort: '', sortDir: 1, cat: '', sig: '' }; // sort neutro: preserva a ordem natural até o usuário escolher
  listState.set(sel, st);

  const bar = document.createElement('div');
  bar.className = 'list-tools';
  let html = '';
  if (cfg.search) {
    html += `<label class="lt-field">${icon('search-outline')}<input type="search" placeholder="${cfg.ph}" aria-label="${cfg.ph}"><button class="lt-clear" aria-label="Limpar">${icon('close-outline')}</button></label>`;
  }
  if (cfg.filters.length) {
    html += '<div class="lt-seg lt-filters"><button class="lt-chip on" data-cat="">Todos</button>'
      + cfg.filters.map(([k, l]) => `<button class="lt-chip" data-cat="${k}">${l}</button>`).join('') + '</div>';
  }
  if (cfg.sorts.length) {
    html += '<div class="lt-seg lt-sorts">'
      + cfg.sorts.map(([k, l]) => `<button class="lt-chip" data-sort="${k}">${icon('swap-vertical-outline')}${l}</button>`).join('') + '</div>';
  }
  html += '<span class="lt-count"></span>';
  bar.innerHTML = html;
  cont.parentElement?.insertBefore(bar, cont);

  const input = bar.querySelector<HTMLInputElement>('.lt-field input');
  const field = bar.querySelector<HTMLElement>('.lt-field');
  if (input) {
    input.addEventListener('input', () => {
      st.q = input.value.trim().toLowerCase();
      field?.classList.toggle('has-val', input.value !== '');
      aplicarLista(sel);
    });
    bar.querySelector('.lt-clear')?.addEventListener('click', () => { input.value = ''; st.q = ''; field?.classList.remove('has-val'); aplicarLista(sel); input.focus(); });
  }
  bar.querySelectorAll<HTMLElement>('.lt-filters .lt-chip').forEach((c) => c.addEventListener('click', () => {
    st.cat = c.getAttribute('data-cat') || '';
    bar.querySelectorAll('.lt-filters .lt-chip').forEach((x) => x.classList.toggle('on', x === c));
    aplicarLista(sel);
  }));
  bar.querySelectorAll<HTMLElement>('.lt-sorts .lt-chip').forEach((c) => c.addEventListener('click', () => {
    const k = c.getAttribute('data-sort') || '';
    if (st.sort !== k) { st.sort = k; st.sortDir = 1; }        // 1º clique: crescente
    else if (st.sortDir === 1) { st.sortDir = -1; }            // 2º clique: decrescente
    else { st.sort = ''; }                                     // 3º clique: volta à ordem natural
    bar.querySelectorAll<HTMLElement>('.lt-sorts .lt-chip').forEach((x) => {
      const on = st.sort === x.getAttribute('data-sort');
      x.classList.toggle('on', on);
      x.setAttribute('data-dir', on ? (st.sortDir === 1 ? 'asc' : 'desc') : '');
    });
    aplicarLista(sel, true);
  }));
}

function aplicarLista(sel: string, force = false): void {
  const cont = document.querySelector<HTMLElement>(sel);
  const st = listState.get(sel);
  if (!cont || !st) return;
  // assinatura: evita reordenar/reanexar à toa (senão o MutationObserver entra em loop)
  const rowsAll = Array.from(cont.children).filter((c) => !c.classList.contains('lt-empty'));
  const fp = rowsAll.length ? (rowsAll[0]!.getAttribute('data-search') || rowsAll[0]!.textContent || '').slice(0, 40)
    + '~' + (rowsAll[rowsAll.length - 1]!.getAttribute('data-search') || rowsAll[rowsAll.length - 1]!.textContent || '').slice(0, 40) : '';
  const sig = `${rowsAll.length}|${st.q}|${st.sort}|${st.sortDir}|${st.cat}|${fp}`;
  if (!force && sig === st.sig) return;
  st.sig = sig;
  const rows = rowsAll as HTMLElement[];
  let vis = 0;
  for (const r of rows) {
    if (r.classList.contains('lt-empty')) { r.remove(); continue; }
    const hay = (r.getAttribute('data-search') || r.textContent || '').toLowerCase();
    const okQ = !st.q || hay.includes(st.q);
    const okC = !st.cat || (r.getAttribute('data-cat') || '') === st.cat;
    const show = okQ && okC;
    r.classList.toggle('lt-hidden', !show);
    if (show) vis++;
  }
  // ordenação (sobre os visíveis)
  if (st.sort) {
    const visible = rows.filter((r) => !r.classList.contains('lt-hidden') && !r.classList.contains('lt-empty'));
    visible.sort((a, b) => {
      const av = a.getAttribute('data-sort-' + st.sort) ?? '';
      const bv = b.getAttribute('data-sort-' + st.sort) ?? '';
      const an = parseFloat(av); const bn = parseFloat(bv);
      const cmp = (isFinite(an) && isFinite(bn)) ? an - bn : av.localeCompare(bv, 'pt-BR');
      return cmp * st.sortDir;
    });
    visible.forEach((r) => cont.appendChild(r));
  }
  // contagem + empty state
  const countEl = cont.previousElementSibling?.querySelector<HTMLElement>('.lt-count');
  if (countEl) countEl.textContent = vis === rows.length ? `${vis} ${vis === 1 ? 'item' : 'itens'}` : `${vis} de ${rows.length}`;
  cont.querySelector('.lt-empty')?.remove();
  if (vis === 0 && rows.length) {
    const e = document.createElement('div');
    e.className = 'lt-empty';
    e.innerHTML = `${icon('search-outline')}<b>Nada encontrado</b><small>Ajuste a busca ou os filtros.</small>`;
    cont.appendChild(e);
  }
}

// Ativa caixas de busca JÁ existentes no layout (.filters .search input) — sem duplicar UI.
function montarBuscaNativa(): void {
  document.querySelectorAll<HTMLInputElement>('.search input:not([data-lt-wired])').forEach((input) => {
    const scope: ParentNode = input.closest('.list-tile') || input.closest('.rpane') || input.closest('.content') || document;
    const anyRow = scope.querySelector<HTMLElement>('[data-search]');
    const cont = anyRow?.parentElement || null;
    if (!cont || !cont.id) return; // ainda sem linhas — tenta no próximo ciclo
    const sel = '#' + cont.id;
    input.setAttribute('data-lt-wired', '1');
    if (!listState.has(sel)) listState.set(sel, { q: '', sort: '', sortDir: 1, cat: '', sig: '' });
    const st = listState.get(sel)!;
    input.addEventListener('input', () => { st.q = input.value.trim().toLowerCase(); aplicarLista(sel, true); });
  });
}

function listas(): void {
  document.querySelectorAll<HTMLElement>('[data-lt-search],[data-lt-sorts],[data-lt-filters]').forEach((cont) => montarToolbar(cont));
  montarBuscaNativa();
  listState.forEach((_st, sel) => aplicarLista(sel)); // reaplica estado após re-render (sig-guard evita churn)
}

// ---------- orquestração ----------------------------------------------------
let mo: MutationObserver | null = null;
let alvo: Node | null = null;
function observar(on: boolean): void {
  if (!mo || !alvo) return;
  if (on) mo.observe(alvo, { childList: true, subtree: true }); else mo.disconnect();
}
// ---------- Ícones (Lucide via Iconify) em formulários e títulos de card -----
function iconePorTexto(txt: string, mapa: Array<[RegExp, string]>): string | null {
  const t = txt.toLowerCase();
  for (const [re, nome] of mapa) if (re.test(t)) return nome;
  return null;
}
function ico(nome: string): string { return `<iconify-icon icon="ion:${nome}"></iconify-icon>`; }
const IC_CAMPO: Array<[RegExp, string]> = [
  [/nome|t[íi]tulo/, 'text-outline'], [/descri/, 'create-outline'], [/cliente|obra/, 'business-outline'],
  [/respons[áa]v|t[ée]cnico|colaborad/, 'person-outline'], [/categoria/, 'folder-open-outline'], [/forma.*pagamento|pagamento/, 'card-outline'],
  [/situa|status/, 'ellipse-outline'], [/progresso|%/, 'trending-up-outline'], [/valor|pre[çc]o/, 'cash-outline'],
  [/endere[çc]o|local/, 'location-outline'], [/observa|obs/, 'chatbox-ellipses-outline'], [/validade|vencimento|previs/, 'time-outline'],
  [/emiss|in[íi]cio|data/, 'calendar-outline'], [/hora|dura[çc]/, 'time-outline'], [/servi[çc]o/, 'construct-outline'],
  [/formato/, 'document-outline'], [/per[íi]odo/, 'calendar-outline'], [/incluir|exportar|o que/, 'checkbox-outline'],
  [/vincul/, 'link-outline'], [/quantidade|qtd|n[úu]mero/, 'pricetag-outline'], [/tipo/, 'pricetag-outline'],
];
const IC_HEAD: Array<[RegExp, string]> = [
  [/exportar/, 'download-outline'], [/importar/, 'cloud-upload-outline'], [/lan[çc]amento|movimenta/, 'swap-horizontal-outline'],
  [/projeto|obra/, 'flash-outline'], [/documento|anexar/, 'document-attach-outline'], [/dia|jornada|registrar/, 'calendar-outline'],
  [/agendamento|servi[çc]o/, 'calendar-number-outline'], [/detalhe/, 'document-text-outline'], [/foto|imagem/, 'image-outline'], [/colaborad|funcion/, 'person-add-outline'],
];
const IC_TILE: Array<[RegExp, string]> = [
  [/projeto|obra/, 'flash-outline'], [/entrada|sa[íi]da|fluxo|caixa/, 'swap-horizontal-outline'], [/agendad|servi[çc]o/, 'calendar-number-outline'],
  [/alerta/, 'warning-outline'], [/atividade|recente/, 'radio-outline'], [/despesa|categoria/, 'pie-chart-outline'],
  [/margem|lucro|progresso|evolu/, 'trending-up-outline'], [/receb|pagar|pagamento/, 'wallet-outline'], [/imposto|fiscal|obriga/, 'library-outline'],
  [/documento/, 'folder-outline'], [/hora/, 'time-outline'], [/colaborad|equipe/, 'people-outline'], [/carteira|backlog/, 'briefcase-outline'],
  [/lan[çc]amento|extrato/, 'list-outline'], [/m[êe]s a m[êe]s|compar/, 'bar-chart-outline'], [/status/, 'pulse-outline'], [/prazo/, 'timer-outline'],
];
function iconizar(root: ParentNode = document): void {
  // 1) rótulos de campo dos formulários
  root.querySelectorAll<HTMLElement>('.modal .field label:not(.check):not([data-ic]), .modal label.fl:not([data-ic])').forEach((l) => {
    l.setAttribute('data-ic', '');
    const nome = iconePorTexto(l.textContent || '', IC_CAMPO);
    if (nome) l.insertAdjacentHTML('afterbegin', ico(nome) + ' ');
  });
  // 2) cabeçalho dos modais (ícone antes do título)
  root.querySelectorAll<HTMLElement>('.modal-head:not([data-ic])').forEach((h) => {
    h.setAttribute('data-ic', '');
    const t = h.querySelector('h3'); if (!t) return;
    const nome = iconePorTexto(t.textContent || '', IC_HEAD) || 'create-outline';
    // ícone como IRMÃO do <h3> (não dentro): sobrevive quando a página troca o título por textContent
    h.insertAdjacentHTML('afterbegin', `<span class="mh-ic">${ico(nome)}</span>`);
  });
  // 3) botões do rodapé
  root.querySelectorAll<HTMLElement>('.modal-foot .btn:not([data-ic])').forEach((b) => {
    b.setAttribute('data-ic', '');
    if (b.querySelector('iconify-icon')) return; // já tem ícone
    b.insertAdjacentHTML('afterbegin', ico(b.classList.contains('btn-primary') ? 'checkmark-outline' : 'close-outline') + ' ');
  });
  // 4) títulos de card (tile-h): agrupa ícone+título à esquerda, meta à direita
  root.querySelectorAll<HTMLElement>('.tile-h:not([data-ic])').forEach((h) => {
    h.setAttribute('data-ic', '');
    if (h.querySelector('.th-title')) return;
    const dir = Array.from(h.children).filter((c) => c.matches('.tile-meta, .live-badge, .link, .tile-cta, a, button'));
    const title = document.createElement('span'); title.className = 'th-title';
    Array.from(h.childNodes).forEach((n) => { if (n.nodeType === 1 && dir.includes(n as Element)) return; title.appendChild(n); });
    const nome = iconePorTexto(title.textContent || '', IC_TILE);
    if (nome) title.insertAdjacentHTML('afterbegin', ico(nome));
    h.insertBefore(title, h.firstChild);
  });
}

function run(root: ParentNode = document): void {
  observar(false); // desliga o observer enquanto mutamos o DOM (evita laço)
  try {
    contarNumeros(root);
    revelar(root);
    dicas(root);
    escalonar();
    listas();
    iconizar(root);
  } finally {
    observar(true);
  }
}

let pending = 0;
function agendar(): void {
  if (pending) return;
  pending = window.setTimeout(() => { pending = 0; run(); }, 120);
}

// ---------- 5) Tempo real (SSE): push instantâneo no lugar do polling -------
// Uma única conexão por página. Ao receber um evento do servidor:
//   • dispara `jc:evento` (o Feed de Atividade acrescenta a linha ao vivo);
//   • agenda `jc:mudou` (coalescido) — cada secção aberta se re-sincroniza.
// Sem sessão → não conecta (o intervalo de segurança de ~60s cobre o resto).
const API_BASE: string =
  (typeof window !== 'undefined' && (window as unknown as { JC_API?: string }).JC_API) || 'http://localhost:3000';
let es: EventSource | null = null;
let mudouT = 0;
function dispararMudou(): void {
  if (mudouT) return;
  mudouT = window.setTimeout(() => { mudouT = 0; window.dispatchEvent(new Event('jc:mudou')); }, 250);
}
function conectarTempoReal(): void {
  if (es || typeof EventSource === 'undefined') return;
  let token: string | null = null;
  try { token = localStorage.getItem('jc_token'); } catch { token = null; }
  if (!token) return; // sem login (ex.: tela de login) — nada a fazer
  try {
    es = new EventSource(`${API_BASE}/api/stream?token=${encodeURIComponent(token)}`);
  } catch { es = null; return; }
  es.onopen = () => { document.documentElement.classList.add('jc-live'); dispararMudou(); }; // (re)conectou → recarrega p/ pegar o que perdeu
  es.onerror = () => { document.documentElement.classList.remove('jc-live'); };               // EventSource reconecta sozinho
  es.onmessage = (e: MessageEvent) => {
    let dados: unknown = null;
    try { dados = JSON.parse(String(e.data)); } catch { return; }
    window.dispatchEvent(new CustomEvent('jc:evento', { detail: dados }));
    dispararMudou();
  };
}

// ---------- 6) Navegação com deslize direcional + barra de progresso ---------
function barraProgresso(): HTMLElement {
  let b = document.querySelector<HTMLElement>('.nav-progress');
  if (!b) { b = document.createElement('div'); b.className = 'nav-progress'; document.body.appendChild(b); }
  return b;
}
function progressoIniciar(): void {
  const b = barraProgresso();
  b.classList.add('on');
  b.style.transform = 'scaleX(0.85)';
}
function progressoCompletar(): void {
  const b = barraProgresso();
  b.classList.add('on');
  b.style.transition = 'none'; b.style.transform = 'scaleX(0.85)';
  void b.offsetWidth;                         // reflow p/ animar do 85% ao 100%
  b.style.transition = '';
  b.style.transform = 'scaleX(1)';
  window.setTimeout(() => { b.classList.remove('on'); b.style.transform = 'scaleX(0)'; }, 320);
}

// navega para outra tela do app com o deslize direcional + barra de progresso.
// back=true → entra pela esquerda (sentido "voltar").
function navegar(href: string, back = false): void {
  if (reduce) { location.href = href; return; }
  try {
    sessionStorage.setItem('jc-navving', '1');
    if (back) sessionStorage.setItem('jc-force-dir', 'back');
  } catch { /* privado: segue sem flag */ }
  document.body.classList.add('is-leaving');
  if (back) document.body.classList.add('leaving-back');
  progressoIniciar();
  window.setTimeout(() => { location.href = href; }, 190); // ≈ duração do slide-out
}

// href da tela se o link for navegação interna (senão null)
function linkDeTela(a: HTMLAnchorElement): string | null {
  if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
  const href = a.getAttribute('href') || '';
  if (/^(https?:|mailto:|tel:|#)/i.test(href)) return null;
  if (!/\.html(\?|#|$)/.test(href)) return null;
  const atual = location.pathname.split('/').pop() || 'index.html';
  const destino = ((href.split('#')[0] ?? '').split('?')[0] ?? '').split('/').pop() ?? '';
  return destino === atual ? null : href;
}

function ligarTransicoes(): void {
  // chegou numa tela vinda de navegação → completa a barra de progresso
  try { if (sessionStorage.getItem('jc-navving')) { sessionStorage.removeItem('jc-navving'); progressoCompletar(); } } catch { /* noop */ }
  if (reduce) return;
  document.addEventListener('click', (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = e.target as Element | null;
    const a = el && el.closest ? (el.closest('a[href]') as HTMLAnchorElement | null) : null;
    if (!a) return;
    const href = linkDeTela(a);
    if (!href) return;
    e.preventDefault();
    navegar(href);
  });
  window.addEventListener('pageshow', () => document.body.classList.remove('is-leaving', 'leaving-back'));
}

// ---------- 7) Ripple (Material) — onda a partir do ponto do toque -----------
function ligarRipple(): void {
  if (reduce) return;
  const SEL = '.btn, .icon-btn, .nav-item, .fab, .mini-act, .lt-chip';
  document.addEventListener('pointerdown', (e: PointerEvent) => {
    const alvoEl = e.target as Element | null;
    const host = alvoEl && alvoEl.closest ? (alvoEl.closest(SEL) as HTMLElement | null) : null;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.15;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${e.clientX - r.left - size / 2}px`;
    s.style.top = `${e.clientY - r.top - size / 2}px`;
    host.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
    window.setTimeout(() => s.remove(), 800);
  }, { passive: true });
}

// ---------- 8) Gestos de swipe (mobile) --------------------------------------
function ligarGestos(): void {
  if (reduce) return;
  const EDGE = 26, DIST = 70;
  let x0 = 0, y0 = 0, t0 = 0, tracking = false, fromEdge = false;
  const aberto = (): boolean => document.body.classList.contains('drawer-open');

  function irSecao(dir: number): void {
    const itens = Array.from(document.querySelectorAll<HTMLAnchorElement>('.sb-nav .nav-item[href]'))
      .filter((a) => /\.html(\?|#|$)/.test(a.getAttribute('href') || ''));
    if (!itens.length) return;
    const atual = location.pathname.split('/').pop() || '';
    const i = itens.findIndex((a) => ((a.getAttribute('href') || '').split(/[?#]/)[0] || '').split('/').pop() === atual);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= itens.length) return;
    navegar(itens[j]!.getAttribute('href')!, dir < 0); // seção anterior → entra pela esquerda
  }

  window.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    const alvoEl = e.target as Element | null;
    // ignora início sobre gráfico, formulário, modal ou a própria sidebar
    if (alvoEl && alvoEl.closest && alvoEl.closest('.apexcharts-canvas, .chart-box, input, textarea, select, .modal, .sidebar')) { tracking = false; return; }
    const t = e.touches[0]!;
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); tracking = true; fromEdge = x0 <= EDGE;
  }, { passive: true });

  window.addEventListener('touchend', (e: TouchEvent) => {
    if (!tracking) return; tracking = false;
    const t = e.changedTouches[0]!;
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Date.now() - t0 > 600) return;                                 // lento demais
    if (Math.abs(dx) < DIST || Math.abs(dx) < Math.abs(dy) * 1.6) return; // não é horizontal claro
    if (aberto()) { if (dx < 0) document.body.classList.remove('drawer-open'); return; } // menu aberto: ← fecha
    if (fromEdge && dx > 0) { document.body.classList.add('drawer-open'); return; }        // borda →: abre menu
    irSecao(dx < 0 ? 1 : -1);                                          // conteúdo: troca de seção
  }, { passive: true });
}

// ---------- 9) Bottom-sheet: arrastar p/ baixo fecha (mobile) ----------------
function ligarSheet(): void {
  if (reduce) return;
  let sheet: HTMLElement | null = null, y0 = 0, dy = 0, dragging = false;
  window.addEventListener('touchstart', (e: TouchEvent) => {
    if (window.innerWidth > 640 || e.touches.length !== 1) return;
    const head = (e.target as Element | null)?.closest?.('.modal-head') as HTMLElement | null;
    if (!head) return;
    sheet = head.closest('.modal') as HTMLElement | null;
    if (!sheet) return;
    y0 = e.touches[0]!.clientY; dy = 0; dragging = true;
    sheet.classList.add('sheet-drag'); sheet.classList.remove('sheet-snap');
  }, { passive: true });
  window.addEventListener('touchmove', (e: TouchEvent) => {
    if (!dragging || !sheet) return;
    dy = Math.max(0, e.touches[0]!.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (!dragging || !sheet) return; dragging = false;
    const s = sheet; sheet = null;
    s.classList.remove('sheet-drag');
    if (dy > 110) {                                    // arrastou o bastante → fecha (reusa o .mclose)
      s.style.transform = 'translateY(100%)';
      const fechar = s.querySelector<HTMLElement>('.mclose');
      window.setTimeout(() => { s.style.transform = ''; if (fechar) fechar.click(); }, 180);
    } else {                                           // volta ao lugar
      s.classList.add('sheet-snap'); s.style.transform = '';
      window.setTimeout(() => s.classList.remove('sheet-snap'), 260);
    }
  }, { passive: true });
}

function boot(): void {
  document.documentElement.classList.add('jsx');
  alvo = document.querySelector('.content') || document.body;
  mo = new MutationObserver(() => agendar());
  run();
  conectarTempoReal();
  ligarTransicoes();
  ligarRipple();
  ligarGestos();
  ligarSheet();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export {};
