/**
 * Tela "Evolução" (browser) — evolução das obras ao longo do tempo:
 * carteira/backlog, progresso médio e progresso por obra. Consome
 * GET /api/analytics/evolucao (snapshots mensais). Botão "Capturar mês"
 * grava o retrato atual como snapshot (POST /api/analytics/snapshot).
 */
const API_BASE = (window as unknown as { JC_API?: string }).JC_API || 'http://localhost:3000';

type Direcao = 'sobe' | 'desce' | 'igual';
interface Delta { atual: number; anterior: number; abs: number; pct: number | null; direcao: Direcao; }
interface MesCarteira { mes: string; contratadoCentavos: number; recebidoCentavos: number; backlogCentavos: number; nObras: number; nAtivas: number; nConcluidas: number; progressoMedio: number; }
interface Comp { mes: string; mesAnterior: string | null; contratado: Delta; recebido: Delta; backlog: Delta; progressoMedio: Delta; nAtivas: Delta; }
interface ObraEv { projetoId: string; nome: string; cliente: string; status: string; progressoAtual: number; contratadoCentavos: number; aReceberCentavos: number; pontos: { mes: string; progresso: number; status: string }[]; }
interface Prazo { emAndamento: number; noPrazo: number; atrasadas: number; concluidas: number; orcamento: number; }
interface Payload { serie: MesCarteira[]; atual: MesCarteira | null; comparativo: Comp | null; porObra: ObraEv[]; prazo: Prazo; }

let serie: MesCarteira[] = [];
let atual: MesCarteira | null = null;
let comp: Comp | null = null;
let porObra: ObraEv[] = [];
let prazo: Prazo = { emAndamento: 0, noPrazo: 0, atrasadas: 0, concluidas: 0, orcamento: 0 };
let online = false;

function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }
function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }
function brl(c: number): string {
  const neg = c < 0; const t = Math.abs(Math.round(c));
  const r = Math.floor(t / 100); const cent = t % 100; const s = String(r);
  let g = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) g += '.'; g += s[i]; }
  return `${neg ? '-' : ''}R$ ${g},${String(cent).padStart(2, '0')}`;
}
function moneyK(v: number): string { return Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toFixed(0) + 'k' : 'R$ ' + v; }
function reais(c: number): number { return Math.round(c / 100); }
const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function mesCurto(m: string): string { return `${MES_ABBR[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`; }
function mesLongo(m: string): string { return `${MES_LONGO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`; }
const ST_LABEL: Record<string, string> = { orcamento: 'Orçamento', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' };
const ST_CLS: Record<string, string> = { orcamento: 'amber', em_andamento: 'blue', concluido: 'green', cancelado: 'red' };
const I = {
  carteira: '<iconify-icon icon="ion:briefcase-outline"></iconify-icon>',
  contrato: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
  receb: '<iconify-icon icon="ion:cash-outline"></iconify-icon>',
  prog: '<iconify-icon icon="ion:speedometer-outline"></iconify-icon>',
  cam: '<iconify-icon icon="ion:camera-outline"></iconify-icon>',
  off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
};

// chip; bomSubir=true → subir é bom; false → subir é ruim; null → neutro (cinza, só direção)
function chip(d: Delta | undefined, bomSubir: boolean | null, modo: 'pct' | 'pp' = 'pct'): string {
  if (!d) return '';
  if (d.direcao === 'igual') return `<span class="delta-chip flat">sem variação</span>`;
  const seta = d.direcao === 'sobe' ? '▲' : '▼';
  const txt = modo === 'pp'
    ? `${seta} ${Math.abs(d.abs).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
    : (d.pct === null ? 'novo' : `${seta} ${Math.abs(d.pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
  const cls = bomSubir === null ? 'flat' : ((d.direcao === 'sobe') === bomSubir ? 'up' : 'down');
  return `<span class="delta-chip ${cls}">${txt}</span>`;
}

// ---- ApexCharts ----
type ApexInst = { render(): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
function vis(el: Element | null): boolean { return !!el && (el as HTMLElement).clientWidth > 4; }
let backlogChart: ApexInst | null = null, progChart: ApexInst | null = null, heroChart: ApexInst | null = null;
const AXIS = { colors: '#6b7385', fontSize: '10px', fontWeight: 600 };
const CORES = ['#ef6300', '#34d399', '#5b8def', '#fbbf24', '#a78bfa', '#fb7185', '#38bdf8', '#94a3b8'];

function renderHero(): void {
  const mesEl = qs<HTMLElement>('#ev-hero-mes'), val = qs<HTMLElement>('#ev-hero-val'), sub = qs<HTMLElement>('#ev-hero-sub');
  if (!online || !atual) { if (mesEl) mesEl.textContent = '—'; if (val) val.textContent = 'R$ —'; if (sub) sub.textContent = 'conecte a API para ver os dados'; return; }
  if (mesEl) mesEl.textContent = `Carteira a faturar · ${mesLongo(atual.mes)}`;
  if (val) { val.textContent = brl(atual.backlogCentavos); val.setAttribute('data-count', String(atual.backlogCentavos)); val.setAttribute('data-fmt', 'moeda'); val.setAttribute('data-ck', 'ev-hero'); }
  if (sub) sub.innerHTML = `contratado <b>${brl(atual.contratadoCentavos)}</b> · <b>${atual.nAtivas}</b> em andamento · progresso médio <b>${atual.progressoMedio}%</b>`
    + (comp && comp.mesAnterior ? ` &nbsp; ${chip(comp.backlog, null)} <small class="cmp-vs">vs. ${mesLongo(comp.mesAnterior)}</small>` : '');
}

function renderKpis(): void {
  const el = qs<HTMLElement>('#ev-kpis'); if (!el) return;
  if (!online || !atual) { el.innerHTML = ''; return; }
  const c = comp;
  const card = (cor: string, ic: string, label: string, valor: string, d: Delta | undefined, bom: boolean | null, modo: 'pct' | 'pp', ck?: string, count?: number): string =>
    `<div class="sumcard card"><span class="si ${cor}">${ic}</span><div class="sc-info"><small>${label}</small>`
    + `<b${count !== undefined ? ` data-count="${count}" data-fmt="moeda" data-ck="${ck}"` : ''}>${valor}</b></div>${chip(d, bom, modo)}</div>`;
  el.innerHTML =
    card('acc', I.carteira, 'Carteira a faturar', brl(atual.backlogCentavos), c?.backlog, null, 'pct', 'ev-backlog', atual.backlogCentavos) +
    card('green', I.contrato, 'Contratado (ativo)', brl(atual.contratadoCentavos), c?.contratado, true, 'pct', 'ev-contr', atual.contratadoCentavos) +
    card('blue', I.receb, 'Recebido', brl(atual.recebidoCentavos), c?.recebido, true, 'pct', 'ev-receb', atual.recebidoCentavos) +
    `<div class="sumcard card"><span class="si amber">${I.prog}</span><div class="sc-info"><small>Progresso médio</small><b>${atual.progressoMedio}%</b></div>${chip(c?.progressoMedio, true, 'pp')}</div>`;
}

function renderPrazo(): void {
  const el = qs<HTMLElement>('#ev-prazo'); if (!el) return;
  if (!online) { el.innerHTML = ''; return; }
  const item = (cls: string, n: number, label: string): string => `<div class="ev-praz ${cls}"><b>${n}</b><small>${label}</small></div>`;
  el.innerHTML = item('blue', prazo.noPrazo, 'no prazo') + item('red', prazo.atrasadas, prazo.atrasadas === 1 ? 'atrasada' : 'atrasadas')
    + item('green', prazo.concluidas, prazo.concluidas === 1 ? 'concluída' : 'concluídas') + item('amber', prazo.orcamento, 'em orçamento');
}

function renderCharts(): void {
  const A = apex(); if (!A || !online) return;
  const cats = serie.map((m) => mesCurto(m.mes));
  // carteira a faturar por mês (área)
  const bEl = qs<HTMLElement>('#ev-chart-backlog');
  const bSeries = [{ name: 'Carteira a faturar', data: serie.map((m) => reais(m.backlogCentavos)) }];
  if (backlogChart) backlogChart.updateOptions({ series: bSeries, xaxis: { categories: cats } });
  else if (vis(bEl)) {
    backlogChart = new A(bEl!, {
      chart: { type: 'area', height: 240, toolbar: { show: false }, fontFamily: 'Inter, sans-serif', dropShadow: { enabled: true, top: 5, blur: 6, opacity: 0.22, color: '#ff8a3d' } },
      series: bSeries, colors: ['#ff8a3d'], stroke: { curve: 'smooth', width: 3 },
      fill: { type: 'gradient', gradient: { shadeIntensity: .5, opacityFrom: .4, opacityTo: 0, stops: [0, 100] } },
      dataLabels: { enabled: false }, xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS }, tickAmount: 3 }, grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR') } },
    });
    backlogChart.render();
  }
  // progresso por obra (multilinha, %)
  const pEl = qs<HTMLElement>('#ev-chart-prog');
  const meses = serie.map((m) => m.mes);
  const pSeries = porObra.map((o) => {
    const mapa = new Map(o.pontos.map((p) => [p.mes, p.progresso]));
    return { name: o.nome.replace(/\s+—.*/, ''), data: meses.map((m) => (mapa.has(m) ? mapa.get(m)! : null)) };
  });
  if (progChart) progChart.updateOptions({ series: pSeries, xaxis: { categories: cats }, colors: CORES });
  else if (vis(pEl)) {
    progChart = new A(pEl!, {
      chart: { type: 'line', height: 240, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
      series: pSeries, colors: CORES, stroke: { curve: 'smooth', width: 3 }, markers: { size: 4, hover: { size: 6 } },
      dataLabels: { enabled: false }, xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { min: 0, max: 100, tickAmount: 4, labels: { formatter: (v: number) => Math.round(v) + '%', style: AXIS } },
      grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
      legend: { show: true, position: 'top', horizontalAlign: 'left', fontSize: '12px', labels: { colors: '#98a1b3' }, markers: { radius: 4 } },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => (v == null ? '—' : v + '%') } },
    });
    progChart.render();
  }
  // sparkline do herói (backlog)
  const hEl = qs<HTMLElement>('#ev-hero-chart');
  const hSeries = [{ name: 'Carteira', data: serie.map((m) => reais(m.backlogCentavos)) }];
  if (heroChart) heroChart.updateOptions({ series: hSeries });
  else if (vis(hEl)) {
    heroChart = new A(hEl!, {
      chart: { type: 'area', height: 120, sparkline: { enabled: true }, fontFamily: 'Inter, sans-serif' },
      series: hSeries, colors: ['#ff8a3d'], stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: .5, opacityFrom: .4, opacityTo: 0 } },
      tooltip: { theme: 'dark', x: { show: false }, y: { formatter: (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR') } },
    });
    heroChart.render();
  }
}

function renderTabela(): void {
  const t = qs<HTMLElement>('#ev-tabela'); if (!t) return;
  if (!online) { t.innerHTML = `<tbody><tr><td class="cmp-empty">${I.off} Conecte a API para ver a evolução das obras.</td></tr></tbody>`; return; }
  if (porObra.length === 0) { t.innerHTML = `<tbody><tr><td class="cmp-empty">Sem histórico de obras ainda. Use “Capturar mês”.</td></tr></tbody>`; return; }
  const linhas = porObra.map((o) => {
    const p0 = o.pontos[0]?.progresso ?? o.progressoAtual;
    const ganho = o.progressoAtual - p0;
    return `<tr>`
      + `<td class="cmp-mes"><b>${esc(o.nome)}</b><small class="ev-cli">${esc(o.cliente)}</small></td>`
      + `<td><span class="ev-badge ${ST_CLS[o.status] || 'slate'}">${ST_LABEL[o.status] || o.status}</span></td>`
      + `<td class="ev-progcell"><div class="ev-bar"><span class="ev-fill ${ST_CLS[o.status] || 'slate'}" style="width:${o.progressoAtual}%"></span></div><b>${o.progressoAtual}%</b></td>`
      + `<td>${ganho > 0 ? `<span class="delta-chip up">▲ ${ganho} p.p.</span>` : '<span class="delta-chip flat">—</span>'}</td>`
      + `<td>${brl(o.contratadoCentavos)}</td>`
      + `<td>${brl(o.aReceberCentavos)}</td></tr>`;
  }).join('');
  t.innerHTML = `<thead><tr><th>Obra</th><th>Status</th><th>Progresso</th><th>Ganho</th><th>Contratado</th><th>A faturar</th></tr></thead><tbody>${linhas}</tbody>`;
}

function renderTudo(): void { renderHero(); renderKpis(); renderPrazo(); renderCharts(); renderTabela(); }

async function carregar(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/analytics/evolucao`);
    if (!r.ok) throw new Error();
    const p = (await r.json()) as Payload;
    serie = Array.isArray(p.serie) ? p.serie : [];
    atual = p.atual; comp = p.comparativo; porObra = Array.isArray(p.porObra) ? p.porObra : [];
    prazo = p.prazo || prazo; online = true;
  } catch { online = false; }
  renderTudo();
}

async function capturar(): Promise<void> {
  const btn = qs<HTMLButtonElement>('#ev-capturar'); if (btn) btn.disabled = true;
  try { await fetch(`${API_BASE}/api/analytics/snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* noop */ }
  await carregar();
  if (btn) btn.disabled = false;
  const toast = qs<HTMLElement>('#ev-toast');
  if (toast) { document.body.classList.add('toast-open'); window.setTimeout(() => document.body.classList.remove('toast-open'), 2400); }
}

function wire(): void {
  const b = document.body;
  const mb = qs<HTMLElement>('.menu-btn'); if (mb) mb.addEventListener('click', () => b.classList.toggle('drawer-open'));
  const ov = qs<HTMLElement>('.drawer-overlay'); if (ov) ov.addEventListener('click', () => b.classList.remove('drawer-open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') b.classList.remove('drawer-open'); });
  qs<HTMLElement>('#ev-capturar')?.addEventListener('click', () => void capturar());
}

async function boot(): Promise<void> {
  wire();
  await carregar();
  window.setInterval(() => { void carregar(); }, 60000); // rede de segurança
  window.addEventListener('jc:mudou', () => { void carregar(); }); // push em tempo real (SSE)
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void boot(); });
else void boot();

export {};
