/**
 * Tela "Início" (browser) — dashboard executivo AO VIVO, ligado à API real.
 * Agrega várias fontes (movimentações, projetos, agenda, documentos, fiscal)
 * em KPIs + gráficos que se atualizam sozinhos (~5s). Somente leitura: não
 * altera CRUD/lógica. Sem a API, cai num estado offline gracioso.
 */
const API_BASE: string =
  (typeof window !== 'undefined' && (window as unknown as { JC_API?: string }).JC_API) || 'http://localhost:3000';

const I = {
  wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
  arrowIn: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
  arrowOut: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
  cal: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
  zap: '<iconify-icon icon="ion:flash-outline"></iconify-icon>',
  landmark: '<iconify-icon icon="ion:library-outline"></iconify-icon>',
  alert: '<iconify-icon icon="ion:warning-outline"></iconify-icon>',
  file: '<iconify-icon icon="ion:document-text-outline"></iconify-icon>',
  users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
  pin: '<iconify-icon icon="ion:location-outline"></iconify-icon>',
  clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
  off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
  check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
};

interface Resumo { entradasCentavos: number; saidasCentavos: number; saldoCentavos: number; aReceberCentavos: number; aPagarCentavos: number; totalLancamentos: number; }
interface Mov { id: string; data: string; tipo: 'entrada' | 'saida'; valorCentavos: number; }
interface ProjResumo { contratadoCentavos: number; recebidoCentavos: number; aReceberCentavos: number; }
interface Projeto { id: string; nome: string; status: string; resumo: ProjResumo; }
interface Ag { id: string; data: string; titulo: string; cliente: string; inicio: string; situacao: string; valorCentavos: number; tecnico?: string; duracaoMin?: number; obs?: string; }
interface Doc { id: string; titulo: string; vinculoLabel?: string; vencimento?: string; }
interface Obrig { id: string; descricao: string; vencimento: string; valorCentavos: number; pago: boolean; status?: string; }

let resumo: Resumo | null = null;
let movs: Mov[] = [];
let projetos: Projeto[] = [];
let ags: Ag[] = [];
let docsVenc: Doc[] = [];
let obrig: Obrig[] = [];
let online = false;

// ---- helpers ----
function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }
function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }
function brl(c: number): string {
  const neg = c < 0; const total = Math.abs(Math.trunc(c));
  const r = Math.floor(total / 100); const cent = total % 100; const s = String(r);
  let g = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) g += '.'; g += s[i]; }
  return `${neg ? '-' : ''}R$ ${g},${String(cent).padStart(2, '0')}`;
}
function brlk(c: number): string { const v = c / 100; return Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')} mil` : brl(c); }
function hojeISO(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
function fmtDia(iso: string): string { const p = iso.split('-'); return `${p[2]}/${p[1]}`; }
function reais(c: number): number { return Math.round(c / 100); }
function moneyK(v: number): string { return Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toFixed(0) + 'k' : 'R$ ' + v; }
function moneyFull(v: number): string { return 'R$ ' + Number(v).toLocaleString('pt-BR'); }
const AXIS = { colors: '#6b7385', fontSize: '10px', fontWeight: 600 };

// ---- ApexCharts ----
type ApexInst = { render(): void; updateSeries(s: unknown, animate?: boolean): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
let flowChart: ApexInst | null = null, projChart: ApexInst | null = null, barsChart: ApexInst | null = null;

function serieFluxo(): { x: number; y: number }[] {
  const asc = [...movs].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const byDay = new Map<string, number>(); let s = 0;
  for (const m of asc) { s += m.tipo === 'entrada' ? m.valorCentavos : -m.valorCentavos; byDay.set(m.data, s); }
  return [...byDay.entries()].map(([d, v]) => ({ x: new Date(d + 'T00:00:00').getTime(), y: reais(v) }));
}
function porDia(): { dias: string[]; ent: number[]; sai: number[] } {
  const map = new Map<string, { ent: number; sai: number }>();
  for (const m of movs) { const e = map.get(m.data) ?? { ent: 0, sai: 0 }; if (m.tipo === 'entrada') e.ent += m.valorCentavos; else e.sai += m.valorCentavos; map.set(m.data, e); }
  const ks = [...map.keys()].sort();
  return { dias: ks.map(fmtDia), ent: ks.map((k) => reais(map.get(k)!.ent)), sai: ks.map((k) => reais(map.get(k)!.sai)) };
}

const STATUS_LABEL: Record<string, string> = { orcamento: 'Orçamento', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' };
const STATUS_ORDER = ['orcamento', 'em_andamento', 'concluido', 'cancelado'];
const STATUS_COR: Record<string, string> = { orcamento: '#fbbf24', em_andamento: '#5b8def', concluido: '#34d399', cancelado: '#f87171' };

// ---- render ----
function setStatus(): void {
  const el = qs<HTMLElement>('#api-status'); if (!el) return;
  el.className = 'api-pill ' + (online ? 'on' : 'off');
  el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
}
// ---- Skeletons (shimmer no carregamento) + flash "ao vivo" na mudança ------
const reduzMov = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let prevSaldo: number | null = null;
function flash(el: Element | null): void {
  if (!el || reduzMov) return;
  el.classList.remove('flash-live'); void (el as HTMLElement).offsetWidth; el.classList.add('flash-live');
}
function mostrarSkeletons(): void {
  const v = qs<HTMLElement>('#h-saldo');
  if (v) { v.classList.add('skeleton'); v.textContent = 'R$ 00.000,00'; }
  const k = qs<HTMLElement>('#h-kpis');
  if (k) k.innerHTML = Array.from({ length: 4 }).map(() =>
    `<div class="sumcard card"><span class="si skeleton" style="border:0"></span><div class="sc-info"><small class="skeleton" style="display:block;width:74px;height:10px"></small><b class="skeleton" style="display:inline-block;width:88px;height:20px;margin-top:7px"></b></div></div>`).join('');
  const f = qs<HTMLElement>('#h-feed');
  if (f) f.innerHTML = Array.from({ length: 3 }).map(() =>
    `<div class="feed-row"><span class="feed-ic skeleton"></span><div class="feed-body"><b class="skeleton" style="display:block;width:70%;height:12px"></b><small class="skeleton" style="display:block;width:42%;height:10px;margin-top:6px"></small></div></div>`).join('');
}
function renderHero(): void {
  const v = qs<HTMLElement>('#h-saldo'); const s = qs<HTMLElement>('#h-saldo-sub');
  if (!resumo || !online) { if (v) { v.classList.remove('skeleton'); v.textContent = 'R$ —'; } if (s) s.textContent = 'conecte a API para ver os dados'; return; }
  if (v) {
    v.classList.remove('skeleton');
    if (prevSaldo !== null && prevSaldo !== resumo.saldoCentavos) flash(v); // mudou em tempo real → realça
    prevSaldo = resumo.saldoCentavos;
    v.textContent = brl(resumo.saldoCentavos); v.setAttribute('data-count', String(resumo.saldoCentavos)); v.setAttribute('data-fmt', 'moeda'); v.setAttribute('data-ck', 'home-saldo');
  }
  if (s) s.innerHTML = `entradas <b style="color:var(--pos)">${brl(resumo.entradasCentavos)}</b> · saídas <b style="color:var(--neg)">${brl(resumo.saidasCentavos)}</b>`;
}
function renderKpis(): void {
  const el = qs<HTMLElement>('#h-kpis'); if (!el) return;
  if (!online) { el.innerHTML = ''; return; }
  const ativos = projetos.filter((p) => p.status === 'em_andamento').length;
  const impostos = obrig.filter((o) => !o.pago).reduce((s, o) => s + o.valorCentavos, 0);
  const confirmados = ags.filter((a) => a.situacao === 'confirmado').length;
  const aReceber = resumo ? resumo.aReceberCentavos : 0;
  el.innerHTML =
    `<div class="sumcard card" data-tip="Total a receber de obras e serviços em aberto"><span class="si green">${I.arrowIn}</span><div class="sc-info"><small>A receber</small><b data-count="${aReceber}" data-fmt="moedak" data-ck="home-areceber">${brlk(aReceber)}</b></div></div>` +
    `<div class="sumcard card" data-tip="Obras com status “Em andamento”"><span class="si acc">${I.zap}</span><div class="sc-info"><small>Projetos ativos</small><b data-count="${ativos}" data-fmt="int" data-ck="home-proj-ativos">${ativos}</b></div></div>` +
    `<div class="sumcard card" data-tip="Serviços na agenda"><span class="si blue">${I.cal}</span><div class="sc-info"><small>Serviços agendados</small><b data-count="${ags.length}" data-fmt="int" data-ck="home-ags">${ags.length}</b></div></div>` +
    `<div class="sumcard card" data-tip="Impostos e obrigações fiscais ainda não pagos"><span class="si amber">${I.landmark}</span><div class="sc-info"><small>Impostos a pagar</small><b data-count="${impostos}" data-fmt="moedak" data-ck="home-impostos">${brlk(impostos)}</b></div></div>`;
  const am = qs<HTMLElement>('#h-ag-meta'); if (am) am.textContent = `${ags.length} no total · ${confirmados} confirmados`;
  const pm = qs<HTMLElement>('#h-proj-meta'); if (pm) pm.textContent = `${projetos.length} obras`;
}
function renderProximos(): void {
  const el = qs<HTMLElement>('#h-ag'); if (!el) return;
  if (!online) { el.innerHTML = `<div class="colab-offline">${I.off}<div><b>API local não encontrada</b><p>Inicie a API para ver o painel ao vivo:</p><code>cd logica-ts &amp;&amp; npm run api</code></div></div>`; return; }
  const lista = [...ags].sort((a, b) => (a.data > b.data ? -1 : a.data < b.data ? 1 : a.inicio > b.inicio ? -1 : 1)).slice(0, 5);
  if (lista.length === 0) { el.innerHTML = `<div class="dp-sub">Nenhum serviço agendado.</div>`; return; }
  el.innerHTML = lista.map((a) => {
    const p = a.data.split('-');
    const st = a.situacao === 'confirmado' ? 'ok' : a.situacao === 'pendente' ? 'wait' : a.situacao === 'concluido' ? 'ok' : 'bad';
    return `<div class="row ag-row" data-id="${esc(a.id)}" role="button" tabindex="0"><div class="datechip"><b>${Number(p[2])}</b><small>${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][Number(p[1]) - 1]}</small></div>`
      + `<div class="rmid"><b>${esc(a.titulo)}</b><small>${esc(a.cliente)} · ${esc(a.inicio)}</small></div>`
      + `<span class="pill ${st}">${a.valorCentavos > 0 ? brl(a.valorCentavos) : '—'}</span></div>`;
  }).join('');
}
function renderAlertas(): void {
  const el = qs<HTMLElement>('#h-alertas'); if (!el) return;
  if (!online) { el.innerHTML = ''; return; }
  const linhas: string[] = [];
  for (const d of docsVenc.slice(0, 4)) {
    linhas.push(`<div class="arow"><span class="doc-ic amber">${I.alert}</span><div class="rmid"><b>${esc(d.titulo)}</b><small>${d.vinculoLabel ? esc(d.vinculoLabel) + ' · ' : ''}vence ${d.vencimento ? fmtDia(d.vencimento) : ''}</small></div></div>`);
  }
  const naoPagas = obrig.filter((o) => !o.pago);
  for (const o of naoPagas.slice(0, 3)) {
    const venc = o.status === 'vencido';
    linhas.push(`<div class="arow"><span class="doc-ic ${venc ? 'orange' : 'blue'}">${I.landmark}</span><div class="rmid"><b>${esc(o.descricao)}</b><small>vence ${fmtDia(o.vencimento)}${venc ? ' · vencido' : ''}</small></div><span class="a-val">${brl(o.valorCentavos)}</span></div>`);
  }
  el.innerHTML = linhas.length ? linhas.join('') : `<div class="dp-sub"><span style="color:var(--pos)">${I.check}</span> Nenhum vencimento nos próximos 30 dias.</div>`;
}
function renderCharts(): void {
  const A = apex(); if (!A || !online) return;
  // fluxo (área)
  const fEl = qs<HTMLElement>('#h-flow');
  if (fEl && resumo) {
    const data = serieFluxo();
    if (flowChart) flowChart.updateSeries([{ name: 'Saldo', data }]);
    else {
      flowChart = new A(fEl, {
        chart: { type: 'area', height: 160, toolbar: { show: false }, animations: { enabled: true, easing: 'easeinout', speed: 700 }, parentHeightOffset: 0, fontFamily: 'Inter, sans-serif', dropShadow: { enabled: true, top: 5, left: 0, blur: 6, opacity: 0.22, color: '#ff8a3d' } },
        series: [{ name: 'Saldo', data }],
        xaxis: { type: 'datetime', axisBorder: { show: false }, axisTicks: { show: false }, labels: { datetimeFormatter: { day: 'dd/MM' }, style: AXIS } },
        yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS }, tickAmount: 3 },
        stroke: { curve: 'smooth', width: 3 }, colors: ['#ff8a3d'],
        fill: { type: 'gradient', gradient: { shadeIntensity: .5, opacityFrom: .4, opacityTo: 0, stops: [0, 100] } },
        grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4, padding: { left: 6, right: 10 } },
        dataLabels: { enabled: false }, tooltip: { theme: 'dark', x: { format: 'dd/MM/yyyy' }, y: { formatter: (v: number) => moneyFull(v) } },
      });
      flowChart.render();
    }
  }
  // projetos por status (colunas)
  const pEl = qs<HTMLElement>('#h-proj');
  if (pEl) {
    const counts = STATUS_ORDER.map((st) => projetos.filter((p) => p.status === st).length);
    const cats = STATUS_ORDER.map((st) => STATUS_LABEL[st]);
    const cores = STATUS_ORDER.map((st) => STATUS_COR[st]);
    const opts: Record<string, unknown> = {
      chart: { type: 'bar', height: 200, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
      series: [{ name: 'Obras', data: counts }],
      colors: cores, plotOptions: { bar: { columnWidth: '46%', borderRadius: 8, borderRadiusApplication: 'end', distributed: true } },
      fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
      dataLabels: { enabled: true, style: { colors: ['#fff'], fontWeight: 700 } }, legend: { show: false },
      xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { style: AXIS }, tickAmount: 3 },
      grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 }, tooltip: { theme: 'dark' },
    };
    if (projChart) projChart.updateOptions(opts); else { projChart = new A(pEl, opts); projChart.render(); }
  }
  // entradas x saídas (barras)
  const bEl = qs<HTMLElement>('#h-bars');
  if (bEl) {
    const d = porDia();
    const series = [{ name: 'Entradas', data: d.ent }, { name: 'Saídas', data: d.sai }];
    if (barsChart) barsChart.updateOptions({ series, xaxis: { categories: d.dias } });
    else {
      barsChart = new A(bEl, {
        chart: { type: 'bar', height: 200, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
        series, colors: ['#34d399', '#f87171'], plotOptions: { bar: { columnWidth: '62%', borderRadius: 7, borderRadiusApplication: 'end' } },
        fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
        dataLabels: { enabled: false }, xaxis: { categories: d.dias, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
        yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS } }, grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
        legend: { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#98a1b3' }, markers: { radius: 4 } },
        tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
      });
      barsChart.render();
    }
  }
}
function updateLive(): void { const el = qs<HTMLElement>('#h-updated'); if (el) el.textContent = online ? 'atualizado ' + new Date().toLocaleTimeString('pt-BR') : ''; }

// ---- Feed de atividade (tempo real via SSE) --------------------------------
interface EvtFeed { id: number; ts: string; recurso: string; acao: string; titulo: string; detalhe?: string; ator?: string; }
let eventos: EvtFeed[] = [];
const FEED_IC: Record<string, { ic: string; cls: string }> = {
  movimentacoes: { ic: 'swap-horizontal-outline', cls: 'blue' },
  agendamentos: { ic: 'calendar-number-outline', cls: '' },
  dias: { ic: 'briefcase-outline', cls: 'amber' },
  documentos: { ic: 'document-text-outline', cls: 'viol' },
  projetos: { ic: 'flash-outline', cls: 'pos' },
  fiscal: { ic: 'library-outline', cls: 'amber' },
  colaboradores: { ic: 'people-outline', cls: 'blue' },
  evolucao: { ic: 'trending-up-outline', cls: 'pos' },
};
function feedIcon(recurso: string, acao: string): { ic: string; cls: string } {
  if (acao === 'remover' || acao === 'excluir') return { ic: 'trash-outline', cls: 'neg' };
  return FEED_IC[recurso] || { ic: 'pulse-outline', cls: '' };
}
function tempoRel(ts: string): string {
  const t = new Date(ts).getTime(); if (!isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 10) return 'agora'; if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24); return d === 1 ? 'ontem' : `há ${d} d`;
}
function linhaFeed(e: EvtFeed): string {
  const { ic, cls } = feedIcon(e.recurso, e.acao);
  const ator = e.ator ? `<span class="fe-ator">${esc(e.ator)}</span><span class="fe-dot">·</span>` : '';
  const meta: string[] = []; if (e.detalhe) meta.push(esc(e.detalhe)); meta.push(tempoRel(e.ts));
  return `<div class="feed-row" data-id="${e.id}"><span class="feed-ic ${cls}"><iconify-icon icon="ion:${ic}"></iconify-icon></span>`
    + `<div class="feed-body"><b>${esc(e.titulo)}</b><small>${ator}${meta.join(' · ')}</small></div></div>`;
}
function renderFeed(): void {
  const el = qs<HTMLElement>('#h-feed'); if (!el) return;
  if (!eventos.length) { el.innerHTML = `<div class="dp-sub feed-empty">Sem atividade recente.</div>`; return; }
  el.innerHTML = eventos.slice(0, 30).map(linhaFeed).join('');
}
async function carregarFeed(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/eventos?limite=30`);
    if (!r.ok) throw new Error();
    const j = (await r.json()) as { eventos: EvtFeed[] };
    eventos = Array.isArray(j.eventos) ? j.eventos : [];
    renderFeed();
  } catch { /* offline: feed vazio; re-sincroniza quando a API voltar */ }
}
function adicionarAoFeed(e: EvtFeed | null): void {
  if (!e || typeof e.id !== 'number' || eventos.some((x) => x.id === e.id)) return;
  eventos.unshift(e);
  if (eventos.length > 40) eventos.length = 40;
  renderFeed();
  const novo = qs<HTMLElement>(`#h-feed .feed-row[data-id="${e.id}"]`);
  if (novo) { novo.classList.add('novo'); window.setTimeout(() => novo.classList.remove('novo'), 700); }
}

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try { const r = await fetch(`${API_BASE}${path}`); if (!r.ok) throw new Error(); return (await r.json()) as T; } catch { throw new Error('offline'); }
}
async function carregar(): Promise<void> {
  try {
    const [rz, ml, pj, ag, dv, fs] = await Promise.all([
      getJSON<Resumo>('/api/movimentacoes/resumo', {} as Resumo),
      getJSON<Mov[]>('/api/movimentacoes', []),
      getJSON<Projeto[]>('/api/projetos', []),
      getJSON<Ag[]>('/api/agendamentos', []),
      getJSON<Doc[]>('/api/documentos/a-vencer?dias=30', []),
      getJSON<{ obrigacoes: Obrig[] }>('/api/fiscal', { obrigacoes: [] }),
    ]);
    resumo = rz; movs = ml; projetos = pj; ags = ag; docsVenc = dv; obrig = fs.obrigacoes ?? [];
    online = true;
  } catch { online = false; }
  setStatus(); renderHero(); renderKpis(); renderProximos(); renderAlertas(); renderCharts(); updateLive();
}

function situLabel(s: string): string { return s === 'confirmado' ? 'Confirmado' : s === 'pendente' ? 'Pendente' : s === 'concluido' ? 'Concluído' : s === 'cancelado' ? 'Cancelado' : s; }
function situClasse(s: string): string { return s === 'confirmado' || s === 'concluido' ? 'ok' : s === 'pendente' ? 'wait' : 'bad'; }
function somaHora(hhmm: string, min: number): string {
  const parts = hhmm.split(':'); const h = Number(parts[0] || 0), m = Number(parts[1] || 0);
  const t = h * 60 + m + min; const H = Math.floor(t / 60) % 24, M = t % 60;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}
function ion(name: string): string { return `<iconify-icon icon="ion:${name}"></iconify-icon>`; }
function garantirModalAg(): void {
  if (qs('#m-agdet')) return;
  const w = document.createElement('div');
  w.className = 'modal-wrap'; w.id = 'm-agdet';
  w.innerHTML =
    `<div class="modal"><div class="modal-head"><h3>Detalhes do serviço</h3><button class="mclose" data-close aria-label="Fechar">${ion('close-outline')}</button></div>` +
    `<div class="modal-body"><div class="agd-top"><span class="agd-ic">${ion('calendar-number-outline')}</span><div class="agd-ht"><b id="agd-titulo">—</b><span class="pill" id="agd-sit">—</span></div></div>` +
    `<div class="agd-list">` +
      `<div class="agd-item"><span class="agd-k">${ion('people-outline')} Cliente</span><span class="agd-v" id="agd-cliente">—</span></div>` +
      `<div class="agd-item"><span class="agd-k">${ion('person-outline')} Técnico</span><span class="agd-v" id="agd-tecnico">—</span></div>` +
      `<div class="agd-item"><span class="agd-k">${ion('calendar-outline')} Data</span><span class="agd-v" id="agd-data">—</span></div>` +
      `<div class="agd-item"><span class="agd-k">${ion('time-outline')} Horário</span><span class="agd-v" id="agd-hora">—</span></div>` +
      `<div class="agd-item"><span class="agd-k">${ion('wallet-outline')} Valor</span><span class="agd-v" id="agd-valor">—</span></div>` +
      `<div class="agd-item agd-obs-wrap" id="agd-obs-wrap"><span class="agd-k">${ion('document-text-outline')} Observações</span><span class="agd-v" id="agd-obs">—</span></div>` +
    `</div></div>` +
    `<div class="modal-foot"><button class="btn btn-primary" data-close>Fechar</button></div></div>`;
  document.body.appendChild(w);
}
function abrirDetalheAg(a: Ag): void {
  garantirModalAg();
  const set = (id: string, v: string): void => { const e = qs<HTMLElement>('#' + id); if (e) e.textContent = v; };
  set('agd-titulo', a.titulo || 'Serviço');
  set('agd-cliente', a.cliente || '—');
  set('agd-tecnico', a.tecnico || '—');
  const p = a.data.split('-');
  set('agd-data', `${p[2]}/${p[1]}/${p[0]}`);
  const fim = a.duracaoMin ? somaHora(a.inicio, a.duracaoMin) : '';
  set('agd-hora', a.inicio + (fim ? ` – ${fim}` : '') + (a.duracaoMin ? ` · ${a.duracaoMin} min` : ''));
  set('agd-valor', a.valorCentavos > 0 ? brl(a.valorCentavos) : '—');
  const sit = qs<HTMLElement>('#agd-sit'); if (sit) { sit.textContent = situLabel(a.situacao); sit.className = 'pill ' + situClasse(a.situacao); }
  const ow = qs<HTMLElement>('#agd-obs-wrap'); if (ow) { if (a.obs) { ow.style.display = ''; set('agd-obs', a.obs); } else { ow.style.display = 'none'; } }
  document.body.classList.add('agdet-open');
}

function wire(): void {
  const b = document.body;
  const mb = qs<HTMLElement>('.menu-btn'); if (mb) mb.addEventListener('click', () => b.classList.toggle('drawer-open'));
  const ov = qs<HTMLElement>('.drawer-overlay'); if (ov) ov.addEventListener('click', () => b.classList.remove('drawer-open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') b.classList.remove('drawer-open'); });
  const agl = qs<HTMLElement>('#h-ag');
  if (agl) {
    agl.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.ag-row'); if (!row) return;
      const a = ags.find((x) => x.id === row.getAttribute('data-id')); if (a) abrirDetalheAg(a);
    });
    agl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = (e.target as HTMLElement).closest<HTMLElement>('.ag-row'); if (!row) return;
      e.preventDefault(); const a = ags.find((x) => x.id === row.getAttribute('data-id')); if (a) abrirDetalheAg(a);
    });
  }
}
async function boot(): Promise<void> {
  wire();
  mostrarSkeletons();
  await Promise.all([carregar(), carregarFeed()]);
  window.setInterval(() => { void carregar(); }, 60000); // rede de segurança (SSE já empurra)
  window.addEventListener('jc:mudou', () => { void carregar(); });               // recarrega KPIs/gráficos
  window.addEventListener('jc:evento', (e) => adicionarAoFeed((e as CustomEvent).detail as EvtFeed)); // acrescenta a linha no feed
  window.setInterval(renderFeed, 60000); // reescreve os "há X min"
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void boot(); });
else void boot();

export {};
