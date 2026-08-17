/**
 * Tela "Relatórios & Documentos" (browser) — agora ligada à API real.
 * Consome /api/documentos, /api/documentos/a-vencer e /api/fiscal, e o modal
 * "Novo documento" envia o upload (POST multipart). Sem a API, cai num estado
 * offline gracioso. A base pode ser trocada com `window.JC_API`.
 */
const API_BASE: string =
  (typeof window !== 'undefined' && (window as unknown as { JC_API?: string }).JC_API) || 'http://localhost:3000';

/**
 * URL final de um arquivo servido pela API. Para arquivos PROTEGIDOS
 * (`/api/uploads/*`), anexa o token de sessão em `?token=` — porque `<a>`/`<img>`
 * não enviam o header `Authorization`. Estáticos (`/uploads/*`) ficam inalterados.
 */
function urlArquivo(caminho: string): string {
  const url = `${API_BASE}${caminho}`;
  if (!caminho.startsWith('/api/')) return url;
  let tk: string | null = null;
  try { tk = localStorage.getItem('jc_token'); } catch { tk = null; }
  return tk ? `${url}${caminho.includes('?') ? '&' : '?'}token=${encodeURIComponent(tk)}` : url;
}

// ---- ícones (inline; SVG entre aspas simples) ----
const I = {
  sign: '<iconify-icon icon="ion:document-text-outline"></iconify-icon>',
  receipt: '<iconify-icon icon="ion:receipt-outline"></iconify-icon>',
  shield: '<iconify-icon icon="ion:shield-checkmark-outline"></iconify-icon>',
  stamp: '<iconify-icon icon="ion:ribbon-outline"></iconify-icon>',
  landmark: '<iconify-icon icon="ion:library-outline"></iconify-icon>',
  pkg: '<iconify-icon icon="ion:cube-outline"></iconify-icon>',
  briefcase: '<iconify-icon icon="ion:briefcase-outline"></iconify-icon>',
  fileText: '<iconify-icon icon="ion:document-text-outline"></iconify-icon>',
  eye: '<iconify-icon icon="ion:eye-outline"></iconify-icon>',
  download: '<iconify-icon icon="ion:download-outline"></iconify-icon>',
  trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
  alert: '<iconify-icon icon="ion:warning-outline"></iconify-icon>',
  check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
  off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
  plus: '<iconify-icon icon="ion:add-outline"></iconify-icon>',
  users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
  clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
  arrowIn: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
  arrowOut: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
  wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
  chevr: '<iconify-icon icon="ion:chevron-forward-outline"></iconify-icon>',
};

// ---- tipos (espelham a API) ----
interface Doc {
  id: string; tipo: string; titulo: string; arquivo?: string; formato?: string; tamanhoBytes?: number;
  vinculoTipo: string; vinculoId?: string; vinculoLabel?: string; emissao?: string; vencimento?: string;
  valorCentavos?: number; situacao?: string; obs?: string; criadoEm: string;
}
interface Obrig {
  id: string; tipo: string; descricao: string; competencia: string; vencimento: string;
  valorCentavos: number; pago: boolean; status: 'a_pagar' | 'pago' | 'vencido';
}
interface Resumo {
  aPagarCentavos: number; vencidoCentavos: number; pagoCentavos: number; proximoVencimento: Obrig | null;
}
interface MovF {
  id: string; data: string; descricao: string; categoria: string; tipo: 'entrada' | 'saida';
  forma: string; valorCentavos: number; situacao: 'pago' | 'pendente' | 'agendado'; recorrente: boolean;
}
interface ResumoMovF {
  entradasCentavos: number; saidasCentavos: number; saldoCentavos: number;
  aReceberCentavos: number; aPagarCentavos: number; totalLancamentos: number;
  porCategoria: { categoria: string; saidaCentavos: number }[];
}

// ---- estado ----
let docs: Doc[] = [];
let obrigacoes: Obrig[] = [];
let resumo: Resumo | null = null;
let movs: MovF[] = [];
let movResumo: ResumoMovF | null = null;
let filtroTipo = '';
let online = false;
let impFile: File | null = null;

// ================= Gráficos VA (ApexCharts via CDN) + heróis ao vivo =================
// (apenas apresentação — não altera nenhuma função de CRUD já existente)
type ApexInst = { render(): void; updateSeries(s: unknown, animate?: boolean): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
let fisHeroChart: ApexInst | null = null;
let fisBarsChart: ApexInst | null = null;
let fisDonutChart: ApexInst | null = null;
let finFlowChart: ApexInst | null = null;
let finBarsChart: ApexInst | null = null;
let finDonutChart: ApexInst | null = null;
const AXIS = { colors: '#6b7385', fontSize: '10px', fontWeight: 600 };
const ST_CORES: Record<string, string> = { a_pagar: '#fbbf24', vencido: '#f87171', pago: '#34d399' };
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
function vis(el: Element | null): boolean { return !!el && (el as HTMLElement).clientWidth > 4; }
function reaisDe(c: number): number { return Math.round(c / 100); }
function moneyK(v: number): string { return Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toFixed(0) + 'k' : 'R$ ' + v; }
function moneyK1(v: number): string { return Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k' : 'R$ ' + v; }
function moneyFull(v: number): string { return 'R$ ' + Number(v).toLocaleString('pt-BR'); }
function serieFluxo(): { x: number; y: number }[] {
  const asc = [...movs].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : numId(a.id) - numId(b.id)));
  const byDay = new Map<string, number>(); let s = 0;
  for (const m of asc) { s += m.tipo === 'entrada' ? m.valorCentavos : -m.valorCentavos; byDay.set(m.data, s); }
  return [...byDay.entries()].map(([d, v]) => ({ x: new Date(d + 'T00:00:00').getTime(), y: reaisDe(v) }));
}
function porDia(): { dias: string[]; ent: number[]; sai: number[] } {
  const map = new Map<string, { ent: number; sai: number }>();
  for (const m of movs) { const e = map.get(m.data) ?? { ent: 0, sai: 0 }; if (m.tipo === 'entrada') e.ent += m.valorCentavos; else e.sai += m.valorCentavos; map.set(m.data, e); }
  const ks = [...map.keys()].sort();
  return { dias: ks.map(fmtCurto), ent: ks.map((k) => reaisDe(map.get(k)!.ent)), sai: ks.map((k) => reaisDe(map.get(k)!.sai)) };
}
function guiaNome(o: Obrig): string { return o.descricao.split(' — ')[0] ?? o.descricao; }

// ---- FISCAL: herói + gráficos ----
function renderFiscalHero(): void {
  const v = qs<HTMLElement>('#fis-hero-val'); const s = qs<HTMLElement>('#fis-hero-sub');
  if (!online || !resumo) { if (v) v.textContent = 'R$ —'; if (s) s.textContent = 'conecte a API para ver os dados'; return; }
  if (v) v.textContent = brl(resumo.aPagarCentavos);
  const prox = resumo.proximoVencimento;
  const proxTxt = prox ? ` · próximo <b>${esc(guiaNome(prox))}</b> ${fmtCurto(prox.vencimento)}` : '';
  if (s) s.innerHTML = `<b style="color:var(--neg)">${brl(resumo.vencidoCentavos)}</b> vencido${proxTxt}`;
}
function renderFiscalCharts(): void {
  const A = apex(); if (!A || !online || !resumo) return;
  const ordem = [...obrigacoes].sort((a, b) => b.valorCentavos - a.valorCentavos);
  const total = obrigacoes.reduce((a, o) => a + o.valorCentavos, 0) || 1;
  // herói: barra horizontal empilhada — em dia × vencido
  const hEl = qs<HTMLElement>('#fis-hero-chart');
  const emDia = Math.max(0, resumo.aPagarCentavos - resumo.vencidoCentavos);
  const heroSeries = [{ name: 'Em dia', data: [reaisDe(emDia)] }, { name: 'Vencido', data: [reaisDe(resumo.vencidoCentavos)] }];
  if (fisHeroChart) fisHeroChart.updateSeries(heroSeries);
  else if (vis(hEl)) {
    fisHeroChart = new A(hEl!, {
      chart: { type: 'bar', height: 120, stacked: true, sparkline: { enabled: true }, fontFamily: 'Inter, sans-serif' },
      series: heroSeries, colors: ['#fbbf24', '#f87171'],
      plotOptions: { bar: { horizontal: true, barHeight: '40%', borderRadius: 5 } },
      dataLabels: { enabled: false }, stroke: { width: 0 },
      legend: { show: true, position: 'bottom', fontSize: '11px', labels: { colors: '#98a1b3' }, markers: { radius: 3 } },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
    });
    fisHeroChart.render();
  }
  // barras: impostos por guia (distribuídas, cor por status)
  const bEl = qs<HTMLElement>('#fis-bars');
  const bSeries = [{ name: 'Valor', data: ordem.map((o) => reaisDe(o.valorCentavos)) }];
  const bCats = ordem.map(guiaNome);
  const bCores = ordem.map((o) => ST_CORES[o.status] ?? '#94a3b8');
  if (fisBarsChart) fisBarsChart.updateOptions({ series: bSeries, xaxis: { categories: bCats }, colors: bCores });
  else if (vis(bEl)) {
    fisBarsChart = new A(bEl!, {
      chart: { type: 'bar', height: 220, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
      series: bSeries, colors: bCores,
      plotOptions: { bar: { distributed: true, columnWidth: '46%', borderRadius: 8, borderRadiusApplication: 'end', dataLabels: { position: 'top' } } },
      dataLabels: { enabled: true, offsetY: -18, style: { colors: ['#cbd3e1'], fontSize: '11px', fontWeight: 700 }, formatter: (v: number) => moneyK1(v) },
      xaxis: { categories: bCats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS } },
      legend: { show: false }, grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
    });
    fisBarsChart.render();
  }
  // donut: composição das guias + legenda
  const dEl = qs<HTMLElement>('#fis-donut');
  const dOpts = {
    chart: { type: 'donut', height: 218, fontFamily: 'Inter, sans-serif' },
    series: ordem.map((o) => reaisDe(o.valorCentavos)), labels: ordem.map(guiaNome),
    colors: ordem.map((o) => ST_CORES[o.status] ?? '#94a3b8'),
    plotOptions: { pie: { donut: { size: '64%', labels: { show: true, name: { show: true, color: '#98a1b3', fontSize: '11px' }, value: { show: true, color: '#fff', fontSize: '17px', fontFamily: 'Sora, sans-serif', fontWeight: 800, formatter: (v: string) => moneyK1(Number(v)) }, total: { show: true, label: 'A pagar', color: '#98a1b3', fontSize: '11px', formatter: () => moneyK1(reaisDe(resumo!.aPagarCentavos)) } } } } },
    dataLabels: { enabled: false }, stroke: { width: 2, colors: ['#0c0e13'] },
    legend: { show: false }, tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
  };
  if (fisDonutChart) fisDonutChart.updateOptions(dOpts);
  else if (vis(dEl)) { fisDonutChart = new A(dEl!, dOpts); fisDonutChart.render(); }
  const leg = qs<HTMLElement>('#fis-donut-leg');
  if (leg) leg.innerHTML = ordem.map((o) => `<div class="leg-row"><span class="leg-dot" style="background:${ST_CORES[o.status] ?? '#94a3b8'}"></span><span class="leg-name">${esc(guiaNome(o))}</span><span class="leg-val">${brl(o.valorCentavos)}</span><span class="leg-pct">${Math.round((o.valorCentavos / total) * 100)}%</span></div>`).join('');
}

// ---- FINANCEIRO: herói + gráficos ----
function renderFinHero(): void {
  const v = qs<HTMLElement>('#fin-hero-val'); const s = qs<HTMLElement>('#fin-hero-sub');
  if (!online || !movResumo) { if (v) v.textContent = 'R$ —'; if (s) s.textContent = 'conecte a API para ver os dados'; return; }
  if (v) v.textContent = brl(movResumo.saldoCentavos);
  if (s) s.innerHTML = `entradas <b style="color:var(--pos)">${brl(movResumo.entradasCentavos)}</b> · saídas <b style="color:var(--neg)">${brl(movResumo.saidasCentavos)}</b>`;
}
function renderFinCharts(): void {
  const A = apex(); if (!A || !online || !movResumo) return;
  // herói: fluxo de caixa acumulado (área)
  const fEl = qs<HTMLElement>('#fin-flow');
  const flow = serieFluxo();
  if (finFlowChart) finFlowChart.updateSeries([{ name: 'Saldo acumulado', data: flow }]);
  else if (vis(fEl)) {
    finFlowChart = new A(fEl!, {
      chart: { type: 'area', height: 130, toolbar: { show: false }, sparkline: { enabled: true }, fontFamily: 'Inter, sans-serif' },
      series: [{ name: 'Saldo acumulado', data: flow }],
      xaxis: { type: 'datetime' }, stroke: { curve: 'smooth', width: 3 }, colors: ['#ff8a3d'],
      fill: { type: 'gradient', gradient: { shadeIntensity: .5, opacityFrom: .4, opacityTo: 0, stops: [0, 100] } },
      dataLabels: { enabled: false }, tooltip: { theme: 'dark', x: { format: 'dd/MM' }, y: { formatter: (v: number) => moneyFull(v) } },
    });
    finFlowChart.render();
  }
  // barras: entradas × saídas por dia
  const bEl = qs<HTMLElement>('#fin-bars');
  const d = porDia();
  const series = [{ name: 'Entradas', data: d.ent }, { name: 'Saídas', data: d.sai }];
  if (finBarsChart) finBarsChart.updateOptions({ series, xaxis: { categories: d.dias } });
  else if (vis(bEl)) {
    finBarsChart = new A(bEl!, {
      chart: { type: 'bar', height: 220, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
      series, colors: ['#34d399', '#f87171'],
      plotOptions: { bar: { columnWidth: '62%', borderRadius: 7, borderRadiusApplication: 'end' } },
      dataLabels: { enabled: false }, stroke: { show: false },
      xaxis: { categories: d.dias, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS } },
      grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
      legend: { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#98a1b3' }, markers: { radius: 4 } },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
    });
    finBarsChart.render();
  }
  // donut: recebido × a receber + legenda
  const dEl = qs<HTMLElement>('#fin-donut');
  const recebido = Math.max(0, movResumo.entradasCentavos - movResumo.aReceberCentavos);
  const partes = [{ nome: 'Recebido', v: recebido, cor: '#34d399' }, { nome: 'A receber', v: movResumo.aReceberCentavos, cor: '#fbbf24' }];
  const totalR = recebido + movResumo.aReceberCentavos || 1;
  const dOpts = {
    chart: { type: 'donut', height: 218, fontFamily: 'Inter, sans-serif' },
    series: partes.map((p) => reaisDe(p.v)), labels: partes.map((p) => p.nome), colors: partes.map((p) => p.cor),
    plotOptions: { pie: { donut: { size: '64%', labels: { show: true, name: { show: true, color: '#98a1b3', fontSize: '11px' }, value: { show: true, color: '#fff', fontSize: '17px', fontFamily: 'Sora, sans-serif', fontWeight: 800, formatter: (v: string) => moneyK1(Number(v)) }, total: { show: true, label: 'Entradas', color: '#98a1b3', fontSize: '11px', formatter: () => moneyK1(reaisDe(movResumo!.entradasCentavos)) } } } } },
    dataLabels: { enabled: false }, stroke: { width: 2, colors: ['#0c0e13'] },
    legend: { show: false }, tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
  };
  if (finDonutChart) finDonutChart.updateOptions(dOpts);
  else if (vis(dEl)) { finDonutChart = new A(dEl!, dOpts); finDonutChart.render(); }
  const leg = qs<HTMLElement>('#fin-donut-leg');
  if (leg) leg.innerHTML = partes.map((p) => `<div class="leg-row"><span class="leg-dot" style="background:${p.cor}"></span><span class="leg-name">${p.nome}</span><span class="leg-val">${brl(p.v)}</span><span class="leg-pct">${Math.round((p.v / totalR) * 100)}%</span></div>`).join('');
}
function renderVA(): void { renderFiscalHero(); renderFiscalCharts(); renderFinHero(); renderFinCharts(); }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const FORMA_LABEL: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', boleto: 'Boleto', transferencia: 'Transferência' };
function numId(id: string): number { const n = Number.parseInt(id.replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : 0; }
function dayLabel(iso: string): string { const p = iso.split('-'); return (iso === hojeISO() ? 'Hoje · ' : '') + `${Number(p[2])} ${MESES[Number(p[1]) - 1]}`; }

// ---- helpers ----
function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
function brl(centavos: number): string {
  const neg = centavos < 0;
  const total = Math.abs(Math.trunc(centavos));
  const reais = Math.floor(total / 100);
  const cent = total % 100;
  const s = String(reais);
  let g = '';
  for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) g += '.'; g += s[i]; }
  return `${neg ? '-' : ''}R$ ${g},${String(cent).padStart(2, '0')}`;
}
function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function emDias(data: string): number {
  const p = data.split('-');
  return Math.floor(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86_400_000);
}
function diasEntre(de: string, ate: string): number { return emDias(ate) - emDias(de); }
function fmtData(iso: string): string { const p = iso.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
function fmtCurto(iso: string): string { const p = iso.split('-'); return `${p[2]}/${p[1]}`; }
function fmtComp(comp: string): string { const p = comp.split('-'); return `${p[1]}/${p[0]}`; }
function fmtTam(d: Doc): string {
  const f = (d.formato ?? '').toUpperCase() || '—';
  if (typeof d.tamanhoBytes !== 'number') return f;
  const kb = d.tamanhoBytes / 1024;
  const tam = kb >= 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(kb))} KB`;
  return `${f} · ${tam}`;
}

const TIPO_INFO: Record<string, { ic: string; cls: string; label: string }> = {
  contrato: { ic: I.sign, cls: 'orange', label: 'Contrato' },
  nota_fiscal: { ic: I.receipt, cls: 'green', label: 'Nota fiscal' },
  garantia: { ic: I.shield, cls: 'blue', label: 'Garantia' },
  laudo: { ic: I.stamp, cls: 'violet', label: 'Laudo / ART' },
  homologacao: { ic: I.landmark, cls: 'blue', label: 'Homologação' },
  recibo: { ic: I.receipt, cls: 'green', label: 'Recibo' },
  compra: { ic: I.pkg, cls: 'slate', label: 'Nota de compra' },
  rh: { ic: I.briefcase, cls: 'slate', label: 'RH' },
};
function tipoInfo(t: string): { ic: string; cls: string; label: string } {
  return TIPO_INFO[t] ?? { ic: I.fileText, cls: 'slate', label: t };
}
function vincTexto(d: Doc): string {
  const lbl = d.vinculoLabel ?? d.vinculoId ?? '';
  const pre: Record<string, string> = { colaborador: 'Colaborador · ', fornecedor: 'Fornecedor · ', servico: 'Serviço · ' };
  return (pre[d.vinculoTipo] ?? '') + lbl;
}
function badge(d: Doc): { cls: string; ic: string; txt: string } {
  if (d.situacao === 'pago') return { cls: 'ok', ic: I.check, txt: ' Pago' };
  if (d.situacao === 'aprovado') return { cls: 'ok', ic: I.check, txt: ' Aprovado' };
  if (d.situacao === 'emitida') return { cls: 'info', ic: '', txt: 'Emitida' };
  if (d.vencimento) {
    const dd = diasEntre(hojeISO(), d.vencimento);
    if (dd < 0) return { cls: 'bad', ic: I.alert, txt: ' Vencido' };
    if (dd <= 30) return { cls: 'warn', ic: I.alert, txt: ` Vence em ${dd} dia${dd === 1 ? '' : 's'}` };
    return { cls: 'ok', ic: I.check, txt: ` Vigente até ${d.vencimento.slice(5, 7)}/${d.vencimento.slice(0, 4)}` };
  }
  if (typeof d.valorCentavos === 'number') return { cls: 'info', ic: '', txt: brl(d.valorCentavos) };
  return { cls: 'ok', ic: I.check, txt: ' Vigente' };
}

// ---- render: Documentos ----
function docRow(d: Doc): string {
  const t = tipoInfo(d.tipo);
  const bd = badge(d);
  const data = d.emissao ? `<i class="dot"></i><span>emitido ${fmtData(d.emissao)}</span>` : '';
  const ver = d.arquivo ? `<button class="mini-act" data-view="${d.id}" title="Ver">${I.eye}</button>` : '';
  const baixar = d.arquivo ? `<a class="mini-act" href="${urlArquivo(d.arquivo)}" target="_blank" rel="noopener" title="Baixar">${I.download}</a>` : '';
  return `<div class="docrow" data-id="${d.id}" data-search="${esc(`${d.titulo} ${vincTexto(d)}`.toLowerCase())}">
    <span class="doc-ic ${t.cls}">${t.ic}</span>
    <div class="doc-main"><div class="doc-top"><b>${esc(d.titulo)}</b></div>
      <div class="doc-sub"><span>${esc(vincTexto(d))}</span>${data}</div></div>
    <div class="doc-side"><span class="vbadge ${bd.cls}">${bd.ic}${esc(bd.txt)}</span><span class="doc-fmt">${fmtTam(d)}</span></div>
    <div class="doc-acts">${ver}${baixar}<button class="mini-act danger" data-del="${d.id}" title="Excluir">${I.trash}</button></div>
  </div>`;
}
function renderDocs(): void {
  const list = qs<HTMLElement>('#doc-list');
  if (!list) return;
  if (!online) {
    list.innerHTML = `<div class="colab-offline">${I.off}<div><b>API local não encontrada</b><p>Inicie a API para ver e anexar documentos:</p><code>cd logica-ts &amp;&amp; npm install &amp;&amp; npm run api</code><p class="dim">Sem a API, esta seção fica vazia; as demais telas seguem funcionando.</p></div></div>`;
    return;
  }
  const filtrados = filtroTipo ? docs.filter((d) => d.tipo === filtroTipo) : docs;
  if (filtrados.length === 0) {
    list.innerHTML = `<div class="day-empty">${I.fileText}<p>Nenhum documento ${filtroTipo ? 'deste tipo' : 'ainda'}.<br>Use <b>Novo documento</b> para anexar.</p></div>`;
    return;
  }
  list.innerHTML = filtrados.map(docRow).join('');
}

// ---- render: alerta de vencimentos ----
function renderAlerta(aVencer: Doc[]): void {
  const el = qs<HTMLElement>('#doc-alert');
  if (!el) return;
  if (!online || aVencer.length === 0) { el.hidden = true; return; }
  const lista = aVencer.map((d) => `${esc(d.titulo)}${d.vinculoLabel ? ' — ' + esc(d.vinculoLabel) : ''} (${d.vencimento ? fmtCurto(d.vencimento) : ''})`).join('; ');
  const n = aVencer.length;
  el.innerHTML = `${I.alert}<div><b>${n} documento${n === 1 ? '' : 's'} vence${n === 1 ? '' : 'm'} em até 30 dias.</b> ${lista}.</div>`;
  el.hidden = false;
}

// ---- render: Fiscal ----
function statusPill(s: Obrig['status']): { cls: string; txt: string } {
  if (s === 'vencido') return { cls: 'bad', txt: 'Vencido' };
  if (s === 'pago') return { cls: 'ok', txt: 'Pago' };
  return { cls: 'wait', txt: 'A pagar' };
}
function renderFiscal(): void {
  const sum = qs<HTMLElement>('#fiscal-sum');
  const obrig = qs<HTMLElement>('#fiscal-obrig');
  const nf = qs<HTMLElement>('#fiscal-nf');
  if (!sum || !obrig || !nf) return;
  if (!online || !resumo) {
    sum.innerHTML = '';
    obrig.innerHTML = `<div class="colab-offline">${I.off}<div><b>API offline</b><p class="dim">Inicie a API para ver impostos e notas.</p></div></div>`;
    nf.innerHTML = '';
    return;
  }
  const notas = docs.filter((d) => d.tipo === 'nota_fiscal');
  const notasTotal = notas.reduce((a, d) => a + (d.valorCentavos ?? 0), 0);
  const prox = resumo.proximoVencimento;
  sum.innerHTML =
    `<div class="sumcard card" data-tip="Soma das notas fiscais emitidas no mês"><span class="si green">${I.receipt}</span><div class="sc-info"><small>Notas emitidas (mês)</small><b data-count="${notasTotal}" data-fmt="moeda" data-ck="rel-notas">${brl(notasTotal)}</b></div><span class="sc-delta pos">${notas.length} NF-e</span></div>` +
    `<div class="sumcard card" data-tip="Impostos com vencimento no mês"><span class="si acc">${I.landmark}</span><div class="sc-info"><small>Impostos a pagar (mês)</small><b data-count="${resumo.aPagarCentavos}" data-fmt="moeda" data-ck="rel-impostos">${brl(resumo.aPagarCentavos)}</b></div></div>` +
    `<div class="sumcard card"><span class="si red">${I.alert}</span><div class="sc-info"><small>Próximo vencimento</small><b>${prox ? esc(prox.descricao.split(' ')[0] ?? prox.descricao) + ' · ' + fmtCurto(prox.vencimento) : '—'}</b></div></div>`;

  obrig.innerHTML = obrigacoes.length === 0
    ? `<div class="day-empty">${I.landmark}<p>Nenhuma guia no período.</p></div>`
    : obrigacoes.map((o) => {
      const p = statusPill(o.status);
      const folha = o.tipo === 'fgts' || o.tipo === 'inss';
      const icCls = folha ? 'violet' : o.tipo === 'iss' ? 'blue' : 'amber';
      const quando = `${o.status === 'vencido' ? 'venceu' : 'vence'} ${fmtCurto(o.vencimento)}`;
      return `<div class="arow arow-obrig" data-obrig="${o.id}" data-pago="${o.pago ? '1' : '0'}" title="Clique para marcar como ${o.pago ? 'a pagar' : 'paga'}">
        <span class="doc-ic ${icCls}" style="width:38px;height:38px;border-radius:10px">${folha ? I.users : I.landmark}</span>
        <div class="rmid"><b>${esc(o.descricao)}</b><small>comp. ${fmtComp(o.competencia)} · ${quando}</small></div>
        <span class="pill ${p.cls}">${p.txt}</span><span class="a-val">${brl(o.valorCentavos)}</span></div>`;
    }).join('');

  nf.innerHTML = notas.length === 0
    ? `<div class="day-empty">${I.receipt}<p>Nenhuma NF-e emitida.</p></div>`
    : notas.map((d) => `<div class="arow"><span class="doc-ic green" style="width:38px;height:38px;border-radius:10px">${I.receipt}</span>
        <div class="rmid"><b>${esc(d.titulo)}</b><small>${esc(d.vinculoLabel ?? '')}${d.emissao ? ' · ' + fmtCurto(d.emissao) : ''}</small></div>
        <span class="pill ok">Emitida</span><span class="a-val">${brl(d.valorCentavos ?? 0)}</span></div>`).join('');
}

function setStatus(): void {
  const el = qs<HTMLElement>('#api-status');
  if (!el) return;
  el.className = 'api-pill ' + (online ? 'on' : 'off');
  el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
}

// ---- Planilhas: import (prévia + commit), modelo, export ----
interface PreviaImport { total: number; validas: number; invalidas: number; previa: MovF[]; erros: { linha: number; erro: string }[]; }
function baixarUrl(url: string, nome?: string): void {
  const a = document.createElement('a'); a.href = url; if (nome) a.download = nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
function renderPreviaImport(j: PreviaImport): void {
  const prev = qs<HTMLElement>('#imp-preview'); if (!prev) return;
  const linhas = j.previa.map((m) => `<tr><td>${m.data.split('-').reverse().join('/')}</td><td>${esc(m.descricao)}</td><td>${m.tipo === 'entrada' ? 'entrada' : 'saída'}</td><td style="text-align:right">${brl(m.valorCentavos)}</td></tr>`).join('');
  const errs = (j.erros ?? []).map((e) => `linha ${e.linha}: ${esc(e.erro)}`).join(' · ');
  prev.innerHTML =
    `<div class="exp-sum">${I.check} ${j.validas} lançamento(s) prontos${j.invalidas ? ` · ${j.invalidas} ignorado(s)` : ''} de ${j.total} linha(s)</div>` +
    (linhas ? `<table class="map-tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>` : '') +
    (errs ? `<div class="dp-sub" style="padding:6px 2px;color:#e6c07a">${errs}</div>` : '');
}
async function previewImport(file: File): Promise<void> {
  const erro = qs<HTMLElement>('#imp-erro'); const prev = qs<HTMLElement>('#imp-preview'); const go = qs<HTMLButtonElement>('#imp-go');
  const fd = new FormData(); fd.append('arquivo', file);
  try {
    const r = await fetch(`${API_BASE}/api/importar?dry=1`, { method: 'POST', body: fd });
    const j = (await r.json()) as PreviaImport & { erro?: string };
    if (!r.ok) { if (erro) { erro.textContent = j.erro ?? 'Falha ao ler o arquivo.'; erro.hidden = false; } if (prev) prev.innerHTML = ''; if (go) go.disabled = true; return; }
    if (erro) erro.hidden = true;
    renderPreviaImport(j);
    if (go) { go.disabled = j.validas === 0; go.innerHTML = `${I.check} Importar ${j.validas} lanç.`; }
  } catch { if (erro) { erro.textContent = 'API offline — inicie a API para importar.'; erro.hidden = false; } }
}
async function commitImport(): Promise<void> {
  if (!impFile) return;
  const fd = new FormData(); fd.append('arquivo', impFile);
  let criadas = 0;
  try { const r = await fetch(`${API_BASE}/api/importar`, { method: 'POST', body: fd }); const j = (await r.json()) as { criadas?: number }; if (!r.ok) throw new Error('x'); criadas = j.criadas ?? 0; }
  catch { toast('Não foi possível importar'); return; }
  closeAll(); impFile = null;
  const fn = qs<HTMLElement>('#imp-file-nome'); if (fn) fn.textContent = 'Selecionar CSV ou XLSX';
  const prev = qs<HTMLElement>('#imp-preview'); if (prev) prev.innerHTML = '';
  await carregar();
  toast(`${criadas} lançamento(s) importado(s)`);
}
function baixarModelo(): void {
  const csv = 'data;descrição;categoria;tipo;forma;valor;situação\n2026-07-22;Instalação solar — Cliente X;Instalação solar;entrada;pix;12.500,00;pago\n2026-07-22;Compra de materiais;Fornecedores;saida;boleto;3.200,00;pago\n';
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  baixarUrl(url, 'modelo-movimentacoes.csv');
  URL.revokeObjectURL(url);
}
function exportarDe(container: Element): void {
  const fmt = container.querySelector('.opt.on')?.getAttribute('data-fmt') ?? 'xlsx';
  const tipo = container.querySelector('.chipf.on[data-tipo]')?.getAttribute('data-tipo') ?? 'movimentacoes';
  baixarUrl(`${API_BASE}/api/exportar?tipo=${tipo}&formato=${fmt}`);
  if (container.closest('.modal-wrap')) closeAll();
  toast('Exportação iniciada');
}

// ---- dados ----
async function carregar(): Promise<void> {
  try {
    const [rd, ra, rf, rm, rmr] = await Promise.all([
      fetch(`${API_BASE}/api/documentos`),
      fetch(`${API_BASE}/api/documentos/a-vencer?dias=30`),
      fetch(`${API_BASE}/api/fiscal`),
      fetch(`${API_BASE}/api/movimentacoes`),
      fetch(`${API_BASE}/api/movimentacoes/resumo`),
    ]);
    if (!rd.ok || !rf.ok) throw new Error('api');
    docs = (await rd.json()) as Doc[];
    const aVencer = ra.ok ? ((await ra.json()) as Doc[]) : [];
    const fiscal = (await rf.json()) as { obrigacoes: Obrig[]; resumo: Resumo };
    obrigacoes = fiscal.obrigacoes;
    resumo = fiscal.resumo;
    movs = rm.ok ? ((await rm.json()) as MovF[]) : [];
    movResumo = rmr.ok ? ((await rmr.json()) as ResumoMovF) : null;
    online = true;
    setStatus(); renderDocs(); renderAlerta(aVencer); renderFiscal(); renderFinanceiro(); renderVA();
  } catch {
    online = false;
    setStatus(); renderDocs(); renderAlerta([]); renderFiscal(); renderFinanceiro(); renderVA();
  }
}

// ---- render: Financeiro (extrato + contas a receber, a partir das movimentações) ----
function extratoRow(m: MovF): string {
  const inOut = m.tipo === 'entrada' ? 'in' : 'out';
  const sign = m.tipo === 'entrada' ? '+ ' : '− ';
  const rot = m.tipo === 'entrada' ? 'Recebido' : 'Pago';
  const st = m.situacao === 'pago' ? 'Pago' : m.situacao === 'pendente' ? 'Pendente' : 'Agendado';
  return `<div class="exrow"><span class="excat ${inOut} st-${m.situacao}">${m.tipo === 'entrada' ? I.arrowIn : I.arrowOut}</span>
    <div class="exmain"><div class="ex-top"><div class="ex-desc">${rot} — ${esc(m.descricao)}</div><div class="ex-amt ${m.tipo === 'entrada' ? 'pos' : 'neg'}">${sign}${brl(m.valorCentavos)}</div></div>
    <div class="ex-bot"><div class="ex-meta">${esc(m.categoria)} · ${FORMA_LABEL[m.forma] ?? m.forma}</div><div class="ex-saldo">${st}</div></div></div>
    <span class="exchev">${I.chevr}</span></div>`;
}
function renderFinanceiro(): void {
  const sum = qs<HTMLElement>('#fin-sum');
  const rec = qs<HTMLElement>('#fin-receber');
  const recMeta = qs<HTMLElement>('#fin-receber-meta');
  const ext = qs<HTMLElement>('#fin-extrato');
  if (!online || !movResumo) {
    if (sum) sum.innerHTML = '';
    if (recMeta) recMeta.textContent = '';
    if (rec) rec.innerHTML = `<div class="colab-offline">${I.off}<div><b>API offline</b><p class="dim">Inicie a API para ver o financeiro.</p></div></div>`;
    if (ext) ext.innerHTML = '';
    return;
  }
  const r = movResumo;
  const recebido = r.entradasCentavos - r.aReceberCentavos;
  const pago = r.saidasCentavos - r.aPagarCentavos;
  if (sum) sum.innerHTML =
    `<div class="sumcard card" data-tip="Total recebido de clientes no mês"><span class="si green">${I.arrowIn}</span><div class="sc-info"><small>Recebido no mês</small><b data-count="${recebido}" data-fmt="moeda" data-ck="rel-recebido">${brl(recebido)}</b></div></div>` +
    `<div class="sumcard card" data-tip="Saldo a receber de clientes"><span class="si acc">${I.clock}</span><div class="sc-info"><small>A receber</small><b data-count="${r.aReceberCentavos}" data-fmt="moeda" data-ck="rel-areceber">${brl(r.aReceberCentavos)}</b></div></div>` +
    `<div class="sumcard card" data-tip="Total pago a equipe e fornecedores"><span class="si red">${I.arrowOut}</span><div class="sc-info"><small>Pago (equipe + fornecedores)</small><b data-count="${pago}" data-fmt="moeda" data-ck="rel-pago">${brl(pago)}</b></div></div>`;

  const aReceber = movs.filter((m) => m.tipo === 'entrada' && m.situacao !== 'pago').sort((a, b) => (a.data < b.data ? -1 : 1));
  if (recMeta) recMeta.textContent = `${aReceber.length} ${aReceber.length === 1 ? 'título' : 'títulos'} · ${brl(r.aReceberCentavos)}`;
  if (rec) rec.innerHTML = aReceber.length
    ? aReceber.map((m) => `<div class="arow"><div class="rmid"><b>${esc(m.descricao)}</b><small>${esc(m.categoria)} · ${m.situacao === 'agendado' ? 'agendado' : 'a receber'} ${fmtCurto(m.data)}</small></div><span class="pill wait">${m.situacao === 'agendado' ? 'Agendado' : 'A receber'}</span><span class="a-val">${brl(m.valorCentavos)}</span></div>`).join('')
    : `<div class="dp-sub" style="padding:6px 2px">Nada a receber em aberto.</div>`;

  if (ext) {
    const desc = [...movs].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : numId(b.id) - numId(a.id)));
    let html = ''; let dia = '';
    for (const m of desc) { if (m.data !== dia) { html += `<div class="exday">${dayLabel(m.data)}</div>`; dia = m.data; } html += extratoRow(m); }
    ext.innerHTML = html || `<div class="dp-sub" style="padding:6px 2px">Nenhum lançamento no período.</div>`;
  }
}

// ---- modal "Ver documento" ----
function abrirView(id: string): void {
  const d = docs.find((x) => x.id === id);
  if (!d) return;
  const t = tipoInfo(d.tipo);
  const setHtml = (sel: string, html: string): void => { const e = qs<HTMLElement>(sel); if (e) e.innerHTML = html; };
  setHtml('#dv-title', esc(d.titulo));
  const arqNome = d.arquivo ? (d.arquivo.split('/').pop() ?? '').split('?')[0] : 'Sem arquivo';
  setHtml('#dv-prev', `<span class="pd-ic">${t.ic}</span><b>${esc(arqNome ?? '')}</b><small>${fmtTam(d)}</small>`);
  const bd = badge(d);
  const rows: string[] = [
    ['Tipo', t.label],
    ['Vinculado a', vincTexto(d) || '—'],
    ['Emissão', d.emissao ? fmtData(d.emissao) : '—'],
    ['Validade', d.vencimento ? `${fmtData(d.vencimento)} · ${bd.txt.trim()}` : '—'],
  ].map(([k, v]) => `<div class="mrow"><span>${k}</span><b>${esc(v ?? '')}</b></div>`);
  if (typeof d.valorCentavos === 'number') rows.push(`<div class="mrow"><span>Valor</span><b>${brl(d.valorCentavos)}</b></div>`);
  rows.push(`<div class="mrow"><span>Registrado em</span><b>${d.criadoEm ? fmtData(d.criadoEm) : '—'}</b></div>`);
  setHtml('#dv-rows', rows.join(''));
  const dl = qs<HTMLAnchorElement>('#dv-download');
  if (dl) { if (d.arquivo) { dl.href = urlArquivo(d.arquivo); dl.style.display = ''; } else { dl.style.display = 'none'; } }
  const del = qs<HTMLElement>('#dv-del');
  if (del) del.setAttribute('data-del', d.id);
  openModal('docview');
}

// ---- salvar (upload) ----
function valorParaCentavos(v: string): number | null {
  const t = v.trim(); if (t === '') return null;
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
async function salvarDoc(): Promise<void> {
  const val = (sel: string): string => (qs<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(sel)?.value ?? '');
  const fileInput = qs<HTMLInputElement>('#doc-file');
  const fd = new FormData();
  fd.append('tipo', val('#doc-tipo'));
  fd.append('titulo', val('#doc-titulo'));
  fd.append('vinculoTipo', val('#doc-vinculo'));
  const reg = val('#doc-registro'); if (reg) fd.append('vinculoLabel', reg);
  const emi = val('#doc-emissao'); if (emi) fd.append('emissao', emi);
  const ven = val('#doc-vencimento'); if (ven) fd.append('vencimento', ven);
  const cent = valorParaCentavos(val('#doc-valor')); if (cent !== null) fd.append('valorCentavos', String(cent));
  const obs = val('#doc-obs'); if (obs) fd.append('obs', obs);
  const f = fileInput?.files?.[0]; if (f) fd.append('arquivo', f);

  const erro = qs<HTMLElement>('#doc-erro');
  try {
    const r = await fetch(`${API_BASE}/api/documentos`, { method: 'POST', body: fd });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { erros?: string[] };
      if (erro) { erro.textContent = (j.erros && j.erros.join(' ')) || 'Não foi possível salvar o documento.'; erro.hidden = false; }
      return;
    }
  } catch {
    if (erro) { erro.textContent = 'API offline — inicie a API para anexar documentos.'; erro.hidden = false; }
    return;
  }
  if (erro) erro.hidden = true;
  closeAll();
  resetForm();
  await carregar();
  toast('Documento anexado com sucesso');
}
function resetForm(): void {
  ['#doc-titulo', '#doc-valor', '#doc-obs'].forEach((s) => { const e = qs<HTMLInputElement | HTMLTextAreaElement>(s); if (e) e.value = ''; });
  const f = qs<HTMLInputElement>('#doc-file'); if (f) f.value = '';
  const fn = qs<HTMLElement>('#doc-file-nome'); if (fn) fn.textContent = 'Selecionar arquivo';
  const erro = qs<HTMLElement>('#doc-erro'); if (erro) erro.hidden = true;
}
async function removerDoc(id: string): Promise<void> {
  try { await fetch(`${API_BASE}/api/documentos/${id}`, { method: 'DELETE' }); } catch { /* noop */ }
  closeAll();
  await carregar();
  toast('Documento removido');
}
async function alternarObrig(id: string, pago: boolean): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/fiscal/obrigacoes/${id}/pagar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pago }),
    });
  } catch { /* noop */ }
  await carregar();
  toast(pago ? 'Guia marcada como paga' : 'Guia marcada como a pagar');
}

// ---- interatividade estática (abas, modais, drawer, toast, chips) ----
const MODS = ['doc', 'docview', 'import', 'export'];
function closeAll(): void { MODS.forEach((k) => document.body.classList.remove(k + '-open')); }
function openModal(id: string): void { closeAll(); document.body.classList.add(id + '-open'); }
function showTab(tab: string): void {
  document.querySelectorAll<HTMLElement>('.rtab').forEach((x) => x.classList.toggle('on', x.getAttribute('data-tab') === tab));
  document.querySelectorAll<HTMLElement>('.rpane').forEach((p) => { (p as HTMLElement).hidden = p.getAttribute('data-pane') !== tab; });
  window.scrollTo({ top: 0 });
  renderVA(); // cria/atualiza os gráficos da aba que acabou de ficar visível
}
let tt = 0;
function toast(msg: string): void {
  const s = qs<HTMLElement>('.toast .tmsg'); if (s && msg) s.textContent = msg;
  document.body.classList.add('toast-open');
  window.clearTimeout(tt);
  tt = window.setTimeout(() => document.body.classList.remove('toast-open'), 2600);
}

function wire(): void {
  const b = document.body;
  const mb = qs<HTMLElement>('.menu-btn'); if (mb) mb.addEventListener('click', () => b.classList.toggle('drawer-open'));
  const ov = qs<HTMLElement>('.drawer-overlay'); if (ov) ov.addEventListener('click', () => b.classList.remove('drawer-open'));

  document.querySelectorAll<HTMLElement>('.rtab').forEach((t) => t.addEventListener('click', () => showTab(t.getAttribute('data-tab') ?? 'docs')));
  document.querySelectorAll<HTMLElement>('[data-gotab]').forEach((el) => el.addEventListener('click', () => showTab(el.getAttribute('data-gotab') ?? 'docs')));

  // chips: seleção visual; no grupo de Documentos, também filtra
  document.querySelectorAll<HTMLElement>('.chips').forEach((g) => g.addEventListener('click', (e) => {
    const c = (e.target as Element).closest('.chipf'); if (!c) return;
    g.querySelectorAll('.chipf').forEach((x) => x.classList.remove('on'));
    c.classList.add('on');
    // só as chips de filtro da aba Documentos mexem no filtro (as de export têm data-tipo próprio)
    if (c.hasAttribute('data-tipo') && c.closest('[data-pane="docs"]')) { filtroTipo = c.getAttribute('data-tipo') ?? ''; renderDocs(); }
  }));
  document.querySelectorAll<HTMLElement>('.opt-grid').forEach((g) => g.addEventListener('click', (e) => {
    const o = (e.target as Element).closest('.opt'); if (!o) return;
    g.querySelectorAll('.opt').forEach((x) => x.classList.remove('on')); o.classList.add('on');
  }));

  document.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => el.addEventListener('click', (ev) => { ev.stopPropagation(); openModal(el.getAttribute('data-open') ?? ''); }));
  document.querySelectorAll<HTMLElement>('.mclose,[data-close]').forEach((el) => el.addEventListener('click', closeAll));
  document.querySelectorAll<HTMLElement>('.modal-wrap').forEach((w) => w.addEventListener('click', (e) => { if (e.target === w) closeAll(); }));
  document.querySelectorAll<HTMLElement>('[data-toast]').forEach((el) => el.addEventListener('click', () => { if (el.closest('.modal')) closeAll(); toast(el.getAttribute('data-toast') ?? ''); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); b.classList.remove('drawer-open'); } });

  // salvar documento (upload)
  const save = qs<HTMLElement>('#doc-save'); if (save) save.addEventListener('click', () => { void salvarDoc(); });
  const file = qs<HTMLInputElement>('#doc-file');
  if (file) file.addEventListener('change', () => { const fn = qs<HTMLElement>('#doc-file-nome'); if (fn) fn.textContent = file.files?.[0]?.name ?? 'Selecionar arquivo'; });

  // delegação: lista de documentos (ver / baixar / excluir / abrir)
  const list = qs<HTMLElement>('#doc-list');
  if (list) list.addEventListener('click', (e) => {
    const t = e.target as Element;
    const del = t.closest('[data-del]'); if (del) { void removerDoc(del.getAttribute('data-del') ?? ''); return; }
    if (t.closest('a[href]')) return; // baixar: deixa o link agir
    const view = t.closest('[data-view]'); if (view) { abrirView(view.getAttribute('data-view') ?? ''); return; }
    const row = t.closest('.docrow'); if (row) abrirView(row.getAttribute('data-id') ?? '');
  });

  // ver-documento: excluir
  const dvDel = qs<HTMLElement>('#dv-del');
  if (dvDel) dvDel.addEventListener('click', () => { void removerDoc(dvDel.getAttribute('data-del') ?? ''); });

  // fiscal: clicar numa guia alterna paga/a pagar
  const obrig = qs<HTMLElement>('#fiscal-obrig');
  if (obrig) obrig.addEventListener('click', (e) => {
    const row = (e.target as Element).closest('.arow-obrig'); if (!row) return;
    void alternarObrig(row.getAttribute('data-obrig') ?? '', row.getAttribute('data-pago') !== '1');
  });

  // Planilhas: import (prévia ao escolher o arquivo, commit no botão), modelo e export
  const impFileInput = qs<HTMLInputElement>('#imp-file');
  if (impFileInput) impFileInput.addEventListener('change', () => {
    const f = impFileInput.files?.[0]; if (!f) return;
    impFile = f; const fn = qs<HTMLElement>('#imp-file-nome'); if (fn) fn.textContent = f.name;
    void previewImport(f);
  });
  const impGo = qs<HTMLElement>('#imp-go'); if (impGo) impGo.addEventListener('click', () => { void commitImport(); });
  const modelo = qs<HTMLElement>('#baixar-modelo'); if (modelo) modelo.addEventListener('click', baixarModelo);
  const expP = qs<HTMLElement>('#exportar-planilhas'); if (expP) expP.addEventListener('click', () => { const card = expP.closest('.card'); if (card) exportarDe(card); });
  const expM = qs<HTMLElement>('#exportar-modal'); if (expM) expM.addEventListener('click', () => { const m = qs<HTMLElement>('#m-export'); if (m) exportarDe(m); });
}

async function boot(): Promise<void> { wire(); await carregar();
  window.setInterval(() => { void carregar(); }, 60000);
  window.addEventListener('jc:mudou', () => { void carregar(); }); } // push em tempo real (SSE)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void boot(); });
else void boot();

export {}; // isola o escopo (arquivo é módulo, não script global)
