/**
 * Tela "Comparativo" (browser) — evolução financeira mês a mês, ao vivo.
 * Consome GET /api/analytics/mensal e mostra: KPIs com variação vs. mês anterior,
 * gráficos de Entradas×Saídas e de Lucro por mês, e a tabela mês a mês.
 * Somente leitura. Reaproveita ApexCharts + CountUp (via enhance.js).
 */
const API_BASE = (window as unknown as { JC_API?: string }).JC_API || 'http://localhost:3000';

type Direcao = 'sobe' | 'desce' | 'igual';
interface Delta { atual: number; anterior: number; abs: number; pct: number | null; direcao: Direcao; }
interface MesFin {
  mes: string; entradasCentavos: number; saidasCentavos: number; saldoCentavos: number;
  recebidoCentavos: number; aReceberCentavos: number; nEntradas: number; nSaidas: number;
  nLancamentos: number; margemPct: number; ticketMedioCentavos: number;
}
interface Comparativo { mes: string; mesAnterior: string | null; entradas: Delta; saidas: Delta; saldo: Delta; margem: Delta; recebido: Delta; }
interface Payload { serie: MesFin[]; atual: MesFin | null; comparativo: Comparativo | null; }

let serie: MesFin[] = [];
let atual: MesFin | null = null;
let comp: Comparativo | null = null;
let online = false;
let rangeN = 0; // 0 = tudo

// ---- helpers ----
function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }
function brl(c: number): string {
  const neg = c < 0; const t = Math.abs(Math.round(c));
  const r = Math.floor(t / 100); const cent = t % 100; const s = String(r);
  let g = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) g += '.'; g += s[i]; }
  return `${neg ? '-' : ''}R$ ${g},${String(cent).padStart(2, '0')}`;
}
function moneyK(v: number): string { return Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toFixed(0) + 'k' : 'R$ ' + v; }
function reais(c: number): number { return Math.round(c / 100); }
function pct1(n: number): string { return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function mesCurto(m: string): string { return `${MES_ABBR[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`; }
function mesLongo(m: string): string { return `${MES_LONGO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`; }
const I = {
  fat: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
  desp: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
  lucro: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
  margem: '<iconify-icon icon="ion:pie-chart-outline"></iconify-icon>',
  off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
};

// chip de variação; bomSubir = subir é bom (verde). modo 'pct' (padrão) ou 'pp' (pontos %).
function chip(d: Delta | undefined, bomSubir: boolean, modo: 'pct' | 'pp' = 'pct'): string {
  if (!d) return '';
  if (d.direcao === 'igual') return `<span class="delta-chip flat">sem variação</span>`;
  const bom = (d.direcao === 'sobe') === bomSubir;
  const seta = d.direcao === 'sobe' ? '▲' : '▼';
  let txt: string;
  if (modo === 'pp') txt = `${seta} ${Math.abs(d.abs).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
  else if (d.pct === null) txt = 'novo';
  else txt = `${seta} ${Math.abs(d.pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return `<span class="delta-chip ${bom ? 'up' : 'down'}">${txt}</span>`;
}

// ---- ApexCharts ----
type ApexInst = { render(): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
function vis(el: Element | null): boolean { return !!el && (el as HTMLElement).clientWidth > 4; }
let fluxoChart: ApexInst | null = null, lucroChart: ApexInst | null = null, heroChart: ApexInst | null = null;
const AXIS = { colors: '#6b7385', fontSize: '10px', fontWeight: 600 };

function janela(): MesFin[] { return rangeN > 0 ? serie.slice(-rangeN) : serie; }

// ---- render ----
function renderHero(): void {
  const mesEl = qs<HTMLElement>('#cmp-hero-mes'), val = qs<HTMLElement>('#cmp-hero-val'), sub = qs<HTMLElement>('#cmp-hero-sub');
  if (!online || !atual) { if (mesEl) mesEl.textContent = '—'; if (val) val.textContent = 'R$ —'; if (sub) sub.textContent = 'conecte a API para ver os dados'; return; }
  if (mesEl) mesEl.textContent = `Lucro · ${mesLongo(atual.mes)}`;
  if (val) { val.textContent = brl(atual.saldoCentavos); val.setAttribute('data-count', String(atual.saldoCentavos)); val.setAttribute('data-fmt', 'moeda'); val.setAttribute('data-ck', 'cmp-hero'); }
  if (sub) sub.innerHTML = `faturamento <b style="color:var(--pos)">${brl(atual.entradasCentavos)}</b> · despesas <b style="color:var(--neg)">${brl(atual.saidasCentavos)}</b> · margem <b>${pct1(atual.margemPct)}</b>`
    + (comp && comp.mesAnterior ? ` &nbsp; ${chip(comp.saldo, true)} <small class="cmp-vs">vs. ${mesLongo(comp.mesAnterior)}</small>` : '');
}

function renderKpis(): void {
  const el = qs<HTMLElement>('#cmp-kpis'); if (!el) return;
  if (!online || !atual) { el.innerHTML = ''; return; }
  const c = comp;
  const card = (cor: string, ic: string, label: string, valorCentavos: number, ck: string, d: Delta | undefined, bomSubir: boolean): string =>
    `<div class="sumcard card"><span class="si ${cor}">${ic}</span><div class="sc-info"><small>${label}</small>`
    + `<b data-count="${valorCentavos}" data-fmt="moeda" data-ck="${ck}">${brl(valorCentavos)}</b></div>${chip(d, bomSubir)}</div>`;
  el.innerHTML =
    card('green', I.fat, 'Faturamento', atual.entradasCentavos, 'cmp-fat', c?.entradas, true) +
    card('red', I.desp, 'Despesas', atual.saidasCentavos, 'cmp-desp', c?.saidas, false) +
    card('acc', I.lucro, 'Lucro', atual.saldoCentavos, 'cmp-lucro', c?.saldo, true) +
    `<div class="sumcard card"><span class="si blue">${I.margem}</span><div class="sc-info"><small>Margem líquida</small><b>${pct1(atual.margemPct)}</b></div>${chip(c?.margem, true, 'pp')}</div>`;
}

function renderCharts(): void {
  const A = apex(); if (!A || !online) return;
  const dados = janela();
  const cats = dados.map((m) => mesCurto(m.mes));
  // Entradas × Saídas
  const fEl = qs<HTMLElement>('#cmp-chart-fluxo');
  const fSeries = [{ name: 'Faturamento', data: dados.map((m) => reais(m.entradasCentavos)) }, { name: 'Despesas', data: dados.map((m) => reais(m.saidasCentavos)) }];
  if (fluxoChart) fluxoChart.updateOptions({ series: fSeries, xaxis: { categories: cats } });
  else if (vis(fEl)) {
    fluxoChart = new A(fEl!, {
      chart: { type: 'bar', height: 240, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
      series: fSeries, colors: ['#34d399', '#f87171'],
      plotOptions: { bar: { columnWidth: '62%', borderRadius: 7, borderRadiusApplication: 'end' } },
      fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
      dataLabels: { enabled: false }, xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS } }, grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
      legend: { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#98a1b3' }, markers: { radius: 4 } },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR') } },
    });
    fluxoChart.render();
  }
  // Lucro por mês (área)
  const lEl = qs<HTMLElement>('#cmp-chart-lucro');
  const lSeries = [{ name: 'Lucro', data: dados.map((m) => reais(m.saldoCentavos)) }];
  if (lucroChart) lucroChart.updateOptions({ series: lSeries, xaxis: { categories: cats } });
  else if (vis(lEl)) {
    lucroChart = new A(lEl!, {
      chart: { type: 'area', height: 240, toolbar: { show: false }, fontFamily: 'Inter, sans-serif', dropShadow: { enabled: true, top: 5, blur: 6, opacity: 0.22, color: '#ff8a3d' } },
      series: lSeries, colors: ['#ff8a3d'], stroke: { curve: 'smooth', width: 3 },
      fill: { type: 'gradient', gradient: { shadeIntensity: .5, opacityFrom: .4, opacityTo: 0, stops: [0, 100] } },
      dataLabels: { enabled: false }, xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS }, tickAmount: 3 }, grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR') } },
    });
    lucroChart.render();
  }
  // sparkline no herói (lucro)
  const hEl = qs<HTMLElement>('#cmp-hero-chart');
  const hSeries = [{ name: 'Lucro', data: serie.map((m) => reais(m.saldoCentavos)) }];
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
  const t = qs<HTMLElement>('#cmp-tabela'); if (!t) return;
  const meta = qs<HTMLElement>('#cmp-tab-meta');
  if (!online) { t.innerHTML = `<tbody><tr><td class="cmp-empty">${I.off} Conecte a API para ver o comparativo.</td></tr></tbody>`; if (meta) meta.textContent = ''; return; }
  // delta de lucro de cada mês vs. o mês anterior (na série completa)
  const deltaSaldo = new Map<string, number | null>();
  for (let i = 0; i < serie.length; i++) {
    if (i === 0) { deltaSaldo.set(serie[i]!.mes, null); continue; }
    const ant = serie[i - 1]!.saldoCentavos;
    deltaSaldo.set(serie[i]!.mes, ant === 0 ? null : ((serie[i]!.saldoCentavos - ant) / Math.abs(ant)) * 100);
  }
  const dados = [...janela()].reverse(); // mais recente no topo
  if (meta) meta.textContent = `${dados.length} ${dados.length === 1 ? 'mês' : 'meses'}`;
  const linhas = dados.map((m) => {
    const dp = deltaSaldo.get(m.mes);
    const dChip = dp === undefined ? '' : dp === null ? '<span class="delta-chip flat">—</span>'
      : `<span class="delta-chip ${dp >= 0 ? 'up' : 'down'}">${dp >= 0 ? '▲' : '▼'} ${Math.abs(dp).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>`;
    return `<tr>`
      + `<td class="cmp-mes">${mesLongo(m.mes)}</td>`
      + `<td class="pos">${brl(m.entradasCentavos)}</td>`
      + `<td class="neg">${brl(m.saidasCentavos)}</td>`
      + `<td><b>${brl(m.saldoCentavos)}</b></td>`
      + `<td>${pct1(m.margemPct)}</td>`
      + `<td>${dChip}</td></tr>`;
  }).join('');
  t.innerHTML = `<thead><tr><th>Mês</th><th>Faturamento</th><th>Despesas</th><th>Lucro</th><th>Margem</th><th>Δ Lucro</th></tr></thead><tbody>${linhas}</tbody>`;
}

function renderRange(): void {
  document.querySelectorAll<HTMLElement>('#cmp-range .chipf').forEach((c) => c.classList.toggle('on', Number(c.getAttribute('data-range')) === rangeN));
}
function renderTudo(): void { renderHero(); renderKpis(); renderCharts(); renderTabela(); renderRange(); }

async function carregar(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/analytics/mensal`);
    if (!r.ok) throw new Error();
    const p = (await r.json()) as Payload;
    serie = Array.isArray(p.serie) ? p.serie : [];
    atual = p.atual; comp = p.comparativo; online = true;
  } catch { online = false; }
  renderTudo();
}

function wire(): void {
  const b = document.body;
  const mb = qs<HTMLElement>('.menu-btn'); if (mb) mb.addEventListener('click', () => b.classList.toggle('drawer-open'));
  const ov = qs<HTMLElement>('.drawer-overlay'); if (ov) ov.addEventListener('click', () => b.classList.remove('drawer-open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') b.classList.remove('drawer-open'); });
  qs<HTMLElement>('#cmp-range')?.addEventListener('click', (e) => {
    const chipEl = (e.target as HTMLElement).closest<HTMLElement>('.chipf'); if (!chipEl) return;
    rangeN = Number(chipEl.getAttribute('data-range')) || 0;
    renderTudo();
  });
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
