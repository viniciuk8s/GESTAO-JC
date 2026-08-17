/**
 * Tela "Projetos" (obras) — ligada à API real.
 * Cada projeto é a obra de um cliente; a tela lista os projetos com status,
 * progresso e mini-resumo financeiro, e abre um detalhe 360° com os
 * agendamentos, documentos e movimentações vinculados. CRUD via API.
 * Sem a API, cai num estado offline gracioso. Base: `window.JC_API`.
 */
const API_BASE: string =
  (typeof window !== 'undefined' && (window as unknown as { JC_API?: string }).JC_API) || 'http://localhost:3000';

const I = {
  solar: '<iconify-icon icon="ion:sunny-outline"></iconify-icon>',
  fotov: '<iconify-icon icon="ion:flash-outline"></iconify-icon>',
  manut: '<iconify-icon icon="ion:construct-outline"></iconify-icon>',
  eletr: '<iconify-icon icon="ion:flash-outline"></iconify-icon>',
  vistoria: '<iconify-icon icon="ion:search-outline"></iconify-icon>',
  outro: '<iconify-icon icon="ion:folder-outline"></iconify-icon>',
  wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
  building: '<iconify-icon icon="ion:business-outline"></iconify-icon>',
  briefcase: '<iconify-icon icon="ion:briefcase-outline"></iconify-icon>',
  check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
  clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
  user: '<iconify-icon icon="ion:person-outline"></iconify-icon>',
  pin: '<iconify-icon icon="ion:location-outline"></iconify-icon>',
  cal: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
  file: '<iconify-icon icon="ion:document-text-outline"></iconify-icon>',
  arrowIn: '<iconify-icon icon="ion:trending-down-outline"></iconify-icon>',
  arrowOut: '<iconify-icon icon="ion:trending-up-outline"></iconify-icon>',
  chevr: '<iconify-icon icon="ion:chevron-forward-outline"></iconify-icon>',
  off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
  edit: '<iconify-icon icon="ion:create-outline"></iconify-icon>',
  trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
  plus: '<iconify-icon icon="ion:add-outline"></iconify-icon>',
};

type StatusP = 'orcamento' | 'em_andamento' | 'concluido' | 'cancelado';
type TipoP = 'instalacao_solar' | 'projeto_fotovoltaico' | 'manutencao' | 'eletrica_predial' | 'vistoria' | 'outro';
interface ResumoP {
  contratadoCentavos: number; recebidoCentavos: number; aReceberCentavos: number;
  custoCentavos: number; saldoCentavos: number; nAgendamentos: number; nConcluidos: number; nDocumentos: number;
}
interface Projeto {
  id: string; nome: string; cliente: string; tipo: TipoP; status: StatusP; responsavel: string;
  endereco?: string; valorContratadoCentavos: number; inicio?: string; previsao?: string;
  progresso: number; obs?: string; criadoEm: string;
}
interface ProjetoComResumo extends Projeto { resumo: ResumoP; }
interface Ag { id: string; data: string; titulo: string; cliente: string; inicio: string; tecnico: string; valorCentavos: number; situacao: string; }
interface Doc { id: string; tipo: string; titulo: string; vinculoLabel?: string; emissao?: string; valorCentavos?: number; }
interface Mov { id: string; data: string; descricao: string; categoria: string; tipo: 'entrada' | 'saida'; valorCentavos: number; situacao: string; }
interface Detalhe { projeto: Projeto; resumo: ResumoP; agendamentos: Ag[]; documentos: Doc[]; movimentacoes: Mov[]; }

let projetos: ProjetoComResumo[] = [];
let filtro: '' | StatusP = '';
let online = false;
let editId: string | null = null;

// ---- gráficos ao vivo (ApexCharts via CDN) ----
type ApexInst = { render(): void; updateSeries(s: unknown, animate?: boolean): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
function reais(c: number): number { return Math.round(c / 100); }
function moneyK(v: number): string { return Math.abs(v) >= 1000 ? 'R$ ' + (v / 1000).toFixed(0) + 'k' : 'R$ ' + v; }
function moneyFull(v: number): string { return 'R$ ' + Number(v).toLocaleString('pt-BR'); }
const AXIS = { colors: '#6b7385', fontSize: '10px', fontWeight: 600 };
const ST_ORDER: StatusP[] = ['orcamento', 'em_andamento', 'concluido', 'cancelado'];
const ST_COR: Record<StatusP, string> = { orcamento: '#fbbf24', em_andamento: '#5b8def', concluido: '#34d399', cancelado: '#f87171' };
let heroChart: ApexInst | null = null, stChart: ApexInst | null = null, finChart: ApexInst | null = null;

// ---- helpers ----
function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }
function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }
function brl(c: number): string {
  const neg = c < 0; const total = Math.abs(Math.trunc(c));
  const reais = Math.floor(total / 100); const cent = total % 100; const s = String(reais);
  let g = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) g += '.'; g += s[i]; }
  return `${neg ? '-' : ''}R$ ${g},${String(cent).padStart(2, '0')}`;
}
function brlk(c: number): string { return c >= 100000 ? `R$ ${(c / 100000).toFixed(1).replace('.', ',')} mil` : brl(c); }
function hojeISO(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
function fmtData(iso?: string): string { if (!iso) return '—'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }

const STATUS_LABEL: Record<StatusP, string> = { orcamento: 'Orçamento', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado' };
const STATUS_CLS: Record<StatusP, string> = { orcamento: 'amber', em_andamento: 'blue', concluido: 'green', cancelado: 'red' };
const TIPO_LABEL: Record<TipoP, string> = { instalacao_solar: 'Instalação solar', projeto_fotovoltaico: 'Projeto fotovoltaico', manutencao: 'Manutenção', eletrica_predial: 'Elétrica predial', vistoria: 'Vistoria', outro: 'Outro' };
const TIPO_ICON: Record<TipoP, string> = { instalacao_solar: I.solar, projeto_fotovoltaico: I.fotov, manutencao: I.manut, eletrica_predial: I.eletr, vistoria: I.vistoria, outro: I.outro };
const TIPO_ICLS: Record<TipoP, string> = { instalacao_solar: 'orange', projeto_fotovoltaico: 'amber', manutencao: 'blue', eletrica_predial: 'violet', vistoria: 'green', outro: 'slate' };

// ---- render ----
function card(p: ProjetoComResumo): string {
  const r = p.resumo;
  return `<div class="proj-card card" data-id="${p.id}" data-search="${esc(`${p.nome} ${p.cliente} ${p.responsavel}`.toLowerCase())}" data-sort-nome="${esc(p.nome.toLowerCase())}" data-sort-valor="${r.contratadoCentavos}" data-sort-prog="${p.progresso}">
    <div class="proj-top">
      <span class="proj-ic ${TIPO_ICLS[p.tipo]}">${TIPO_ICON[p.tipo]}</span>
      <div class="proj-id"><b>${esc(p.nome)}</b><small>${esc(p.cliente)} · ${esc(p.responsavel)}</small></div>
      <span class="pstatus ${STATUS_CLS[p.status]}">${STATUS_LABEL[p.status]}</span>
    </div>
    <div class="proj-prog">
      <div class="pp-track"><div class="pp-fill ${STATUS_CLS[p.status]}" style="width:${p.progresso}%"></div></div>
      <span class="pp-pct">${p.progresso}%</span>
    </div>
    <div class="proj-fin">
      <div><small>Contratado</small><b>${brl(r.contratadoCentavos)}</b></div>
      <div><small>Recebido</small><b class="pos">${brl(r.recebidoCentavos)}</b></div>
      <div><small>A receber</small><b>${brl(r.aReceberCentavos)}</b></div>
    </div>
    <div class="proj-foot"><span>${I.cal}${r.nAgendamentos} serviço(s)</span><span>${I.file}${r.nDocumentos} documento(s)</span></div>
  </div>`;
}
function renderList(): void {
  const el = qs<HTMLElement>('#proj-list'); if (!el) return;
  if (!online) {
    el.innerHTML = `<div class="colab-offline">${I.off}<div><b>API local não encontrada</b><p>Inicie a API para ver e gerir os projetos:</p><code>cd logica-ts &amp;&amp; npm install &amp;&amp; npm run api</code><p class="dim">Sem a API, esta seção fica vazia; as demais telas seguem funcionando.</p></div></div>`;
    return;
  }
  const lista = filtro ? projetos.filter((p) => p.status === filtro) : projetos;
  if (lista.length === 0) { el.innerHTML = `<div class="day-empty">${I.briefcase}<p>Nenhum projeto ${filtro ? 'neste status' : 'ainda'}.<br>Use <b>Novo projeto</b> para começar.</p></div>`; return; }
  el.innerHTML = lista.map(card).join('');
}
function renderResumo(): void {
  const el = qs<HTMLElement>('#proj-sum'); if (!el) return;
  if (!online) { el.innerHTML = ''; return; }
  const emand = projetos.filter((p) => p.status === 'em_andamento').length;
  const contratado = projetos.reduce((s, p) => s + p.resumo.contratadoCentavos, 0);
  const aReceber = projetos.reduce((s, p) => s + p.resumo.aReceberCentavos, 0);
  el.innerHTML =
    `<div class="sumcard card" data-tip="Total de obras cadastradas"><span class="si acc">${I.briefcase}</span><div class="sc-info"><small>Projetos</small><b data-count="${projetos.length}" data-fmt="int" data-ck="proj-total">${projetos.length}</b></div></div>` +
    `<div class="sumcard card" data-tip="Obras em execução"><span class="si blue">${I.clock}</span><div class="sc-info"><small>Em andamento</small><b data-count="${emand}" data-fmt="int" data-ck="proj-emand">${emand}</b></div></div>` +
    `<div class="sumcard card" data-tip="Valor total contratado das obras"><span class="si green">${I.wallet}</span><div class="sc-info"><small>Contratado</small><b data-count="${contratado}" data-fmt="moedak" data-ck="proj-contratado">${brlk(contratado)}</b></div></div>` +
    `<div class="sumcard card" data-tip="Saldo a receber das obras"><span class="si amber">${I.arrowIn}</span><div class="sc-info"><small>A receber</small><b data-count="${aReceber}" data-fmt="moedak" data-ck="proj-areceber">${brlk(aReceber)}</b></div></div>`;
  const counts = qs<HTMLElement>('#proj-count'); if (counts) counts.textContent = String(projetos.length);
}
function setStatus(): void {
  const el = qs<HTMLElement>('#api-status'); if (!el) return;
  el.className = 'api-pill ' + (online ? 'on' : 'off');
  el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
}

function renderHero(): void {
  const v = qs<HTMLElement>('#proj-hero-val'); const s = qs<HTMLElement>('#proj-hero-sub');
  const C = projetos.reduce((a, p) => a + p.resumo.contratadoCentavos, 0);
  const R = projetos.reduce((a, p) => a + p.resumo.recebidoCentavos, 0);
  const AR = projetos.reduce((a, p) => a + p.resumo.aReceberCentavos, 0);
  if (!online) { if (v) v.textContent = 'R$ —'; if (s) s.textContent = 'conecte a API para ver os dados'; return; }
  if (v) v.textContent = brl(C);
  if (s) s.innerHTML = `recebido <b style="color:var(--pos)">${brl(R)}</b> · a receber <b style="color:var(--accent-2)">${brl(AR)}</b>`;
}
function renderCharts(): void {
  const A = apex(); if (!A || !online) return;
  // hero: barra horizontal empilhada recebido/a-receber (cobrança da carteira)
  const hEl = qs<HTMLElement>('#proj-hero-chart');
  if (hEl) {
    const R = reais(projetos.reduce((a, p) => a + p.resumo.recebidoCentavos, 0));
    const AR = reais(projetos.reduce((a, p) => a + p.resumo.aReceberCentavos, 0));
    const series = [{ name: 'Recebido', data: [R] }, { name: 'A receber', data: [AR] }];
    if (heroChart) heroChart.updateSeries(series);
    else {
      heroChart = new A(hEl, {
        chart: { type: 'bar', height: 96, stacked: true, toolbar: { show: false }, sparkline: { enabled: true }, fontFamily: 'Inter, sans-serif' },
        series, colors: ['#34d399', '#ff8a3d'], plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: '44%' } },
        dataLabels: { enabled: false }, legend: { show: false }, tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
      });
      heroChart.render();
    }
  }
  // obras por status (colunas)
  const sEl = qs<HTMLElement>('#proj-status');
  if (sEl) {
    const counts = ST_ORDER.map((st) => projetos.filter((p) => p.status === st).length);
    const cats = ST_ORDER.map((st) => STATUS_LABEL[st]);
    const opts: Record<string, unknown> = {
      chart: { type: 'bar', height: 200, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
      series: [{ name: 'Obras', data: counts }], colors: ST_ORDER.map((st) => ST_COR[st]),
      plotOptions: { bar: { columnWidth: '46%', borderRadius: 8, borderRadiusApplication: 'end', distributed: true } },
      fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
      dataLabels: { enabled: true, style: { colors: ['#fff'], fontWeight: 700 } }, legend: { show: false },
      xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { style: AXIS }, tickAmount: 3 }, grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 }, tooltip: { theme: 'dark' },
    };
    if (stChart) stChart.updateOptions(opts); else { stChart = new A(sEl, opts); stChart.render(); }
    const m = qs<HTMLElement>('#proj-st-meta'); if (m) m.textContent = `${projetos.length} no total`;
  }
  // recebido × a receber por obra (colunas empilhadas)
  const fEl = qs<HTMLElement>('#proj-fin-chart');
  if (fEl) {
    const cats = projetos.map((p) => p.cliente);
    const series = [
      { name: 'Recebido', data: projetos.map((p) => reais(p.resumo.recebidoCentavos)) },
      { name: 'A receber', data: projetos.map((p) => reais(p.resumo.aReceberCentavos)) },
    ];
    if (finChart) finChart.updateOptions({ series, xaxis: { categories: cats } });
    else {
      finChart = new A(fEl, {
        chart: { type: 'bar', height: 200, stacked: true, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
        series, colors: ['#34d399', '#ff8a3d'], plotOptions: { bar: { columnWidth: '50%', borderRadius: 6, borderRadiusApplication: 'end' } },
        dataLabels: { enabled: false },
        xaxis: { categories: cats, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS, trim: true, hideOverlappingLabels: true } },
        yaxis: { labels: { formatter: (v: number) => moneyK(v), style: AXIS } },
        grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
        legend: { show: true, position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#98a1b3' }, markers: { radius: 4 } },
        tooltip: { theme: 'dark', y: { formatter: (v: number) => moneyFull(v) } },
      });
      finChart.render();
    }
  }
}

async function carregar(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/projetos`);
    if (!r.ok) throw new Error('api');
    projetos = (await r.json()) as ProjetoComResumo[];
    online = true;
  } catch { online = false; }
  setStatus(); renderResumo(); renderList(); renderHero(); renderCharts();
}

// ---- modal detalhe 360° ----
function linhaAg(a: Ag): string {
  return `<div class="arow"><span class="doc-ic blue">${I.cal}</span><div class="rmid"><b>${esc(a.titulo)}</b><small>${fmtData(a.data)} · ${esc(a.inicio)} · ${esc(a.tecnico)}</small></div><span class="a-val">${brl(a.valorCentavos)}</span></div>`;
}
function linhaDoc(d: Doc): string {
  return `<div class="arow"><span class="doc-ic violet">${I.file}</span><div class="rmid"><b>${esc(d.titulo)}</b><small>${esc(d.tipo)}${d.emissao ? ' · ' + fmtData(d.emissao) : ''}</small></div>${d.valorCentavos != null ? `<span class="a-val">${brl(d.valorCentavos)}</span>` : ''}</div>`;
}
function linhaMov(m: Mov): string {
  const inn = m.tipo === 'entrada';
  return `<div class="arow"><span class="doc-ic ${inn ? 'green' : 'orange'}">${inn ? I.arrowIn : I.arrowOut}</span><div class="rmid"><b>${esc(m.descricao)}</b><small>${esc(m.categoria)} · ${fmtData(m.data)}</small></div><span class="a-val ${inn ? 'pos' : 'neg'}">${inn ? '+ ' : '− '}${brl(m.valorCentavos)}</span></div>`;
}
async function abrirDetalhe(id: string): Promise<void> {
  let d: Detalhe;
  try { const r = await fetch(`${API_BASE}/api/projetos/${id}`); if (!r.ok) throw new Error(); d = (await r.json()) as Detalhe; }
  catch { toast('Não foi possível abrir o projeto'); return; }
  const p = d.projeto; const r = d.resumo;
  const set = (sel: string, html: string): void => { const e = qs<HTMLElement>(sel); if (e) e.innerHTML = html; };
  const t = qs<HTMLElement>('#projd-title'); if (t) t.textContent = p.nome;
  set('#projd-head',
    `<span class="pstatus ${STATUS_CLS[p.status]}">${STATUS_LABEL[p.status]}</span>` +
    `<span class="projd-tag">${TIPO_LABEL[p.tipo]}</span>` +
    `<span class="projd-tag">${I.user}${esc(p.responsavel)}</span>` +
    (p.endereco ? `<span class="projd-tag">${I.pin}${esc(p.endereco)}</span>` : '') +
    `<span class="projd-tag">${I.cal}${fmtData(p.inicio)} → ${fmtData(p.previsao)}</span>`);
  set('#projd-prog', `<div class="pp-track"><div class="pp-fill ${STATUS_CLS[p.status]}" style="width:${p.progresso}%"></div></div><span class="pp-pct">${p.progresso}% concluído</span>`);
  set('#projd-fin',
    `<div class="pf"><small>Contratado</small><b>${brl(r.contratadoCentavos)}</b></div>` +
    `<div class="pf"><small>Recebido</small><b class="pos">${brl(r.recebidoCentavos)}</b></div>` +
    `<div class="pf"><small>A receber</small><b>${brl(r.aReceberCentavos)}</b></div>` +
    `<div class="pf"><small>Custo</small><b class="neg">${brl(r.custoCentavos)}</b></div>` +
    `<div class="pf"><small>Saldo da obra</small><b>${brl(r.saldoCentavos)}</b></div>`);
  set('#projd-ags', d.agendamentos.length ? d.agendamentos.map(linhaAg).join('') : `<div class="dp-sub">Nenhum serviço vinculado.</div>`);
  set('#projd-docs', d.documentos.length ? d.documentos.map(linhaDoc).join('') : `<div class="dp-sub">Nenhum documento vinculado.</div>`);
  set('#projd-movs', d.movimentacoes.length ? d.movimentacoes.map(linhaMov).join('') : `<div class="dp-sub">Nenhuma movimentação vinculada.</div>`);
  const del = qs<HTMLElement>('#projd-del'); if (del) del.setAttribute('data-id', p.id);
  const ed = qs<HTMLElement>('#projd-edit'); if (ed) ed.setAttribute('data-id', p.id);
  openModal('projdet');
}

// ---- modal novo / editar ----
function setV(sel: string, val: string): void { const e = qs<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(sel); if (e) e.value = val; }
function abrirNovo(p?: Projeto): void {
  editId = p ? p.id : null;
  const title = qs<HTMLElement>('#pnovo-title'); if (title) title.textContent = p ? 'Editar projeto' : 'Novo projeto';
  setV('#proj-nome', p ? p.nome : '');
  setV('#proj-cliente', p ? p.cliente : '');
  setV('#proj-tipo', p ? p.tipo : 'instalacao_solar');
  setV('#proj-status', p ? p.status : 'orcamento');
  setV('#proj-resp', p ? p.responsavel : '');
  setV('#proj-endereco', p && p.endereco ? p.endereco : '');
  setV('#proj-valor', p ? brl(p.valorContratadoCentavos).replace('R$ ', '') : '');
  setV('#proj-inicio', p && p.inicio ? p.inicio : hojeISO());
  setV('#proj-previsao', p && p.previsao ? p.previsao : '');
  setV('#proj-progresso', p ? String(p.progresso) : '0');
  setV('#proj-obs', p && p.obs ? p.obs : '');
  const erro = qs<HTMLElement>('#proj-erro'); if (erro) erro.hidden = true;
  openModal('projnovo');
}
function valorCentavos(v: string): number { const n = parseFloat(v.trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : 0; }
async function salvar(): Promise<void> {
  const val = (sel: string): string => qs<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(sel)?.value ?? '';
  const corpo: Record<string, unknown> = {
    nome: val('#proj-nome'),
    cliente: val('#proj-cliente'),
    tipo: val('#proj-tipo'),
    status: val('#proj-status'),
    responsavel: val('#proj-resp'),
    endereco: val('#proj-endereco') || undefined,
    valorContratadoCentavos: valorCentavos(val('#proj-valor')),
    inicio: val('#proj-inicio') || undefined,
    previsao: val('#proj-previsao') || undefined,
    progresso: Math.max(0, Math.min(100, Math.round(Number(val('#proj-progresso')) || 0))),
    obs: val('#proj-obs') || undefined,
  };
  const erro = qs<HTMLElement>('#proj-erro');
  try {
    const url = editId ? `${API_BASE}/api/projetos/${editId}` : `${API_BASE}/api/projetos`;
    const r = await fetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { erros?: string[] };
      if (erro) { erro.textContent = (j.erros && j.erros.join(' ')) || 'Não foi possível salvar.'; erro.hidden = false; }
      return;
    }
  } catch {
    if (erro) { erro.textContent = 'API offline — inicie a API para gerir projetos.'; erro.hidden = false; }
    return;
  }
  closeAll(); await carregar(); toast(editId ? 'Projeto atualizado' : 'Projeto criado com sucesso');
}
async function remover(id: string): Promise<void> {
  try { await fetch(`${API_BASE}/api/projetos/${id}`, { method: 'DELETE' }); } catch { /* noop */ }
  closeAll(); await carregar(); toast('Projeto removido');
}

// ---- interatividade / modais ----
const MODS = ['projdet', 'projnovo'];
function closeAll(): void { MODS.forEach((k) => document.body.classList.remove(k + '-open')); }
function openModal(id: string): void { closeAll(); document.body.classList.add(id + '-open'); }
let tt = 0;
function toast(msg: string): void {
  const s = qs<HTMLElement>('.toast .tmsg') ?? qs<HTMLElement>('.toast span'); if (s && msg) s.textContent = msg;
  document.body.classList.add('toast-open'); window.clearTimeout(tt);
  tt = window.setTimeout(() => document.body.classList.remove('toast-open'), 2600);
}

function wire(): void {
  const b = document.body;
  const mb = qs<HTMLElement>('.menu-btn'); if (mb) mb.addEventListener('click', () => b.classList.toggle('drawer-open'));
  const ov = qs<HTMLElement>('.drawer-overlay'); if (ov) ov.addEventListener('click', () => b.classList.remove('drawer-open'));

  document.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => el.addEventListener('click', (ev) => { ev.stopPropagation(); if (el.getAttribute('data-open') === 'projnovo') abrirNovo(); else openModal(el.getAttribute('data-open') ?? ''); }));
  document.querySelectorAll<HTMLElement>('.mclose,[data-close]').forEach((el) => el.addEventListener('click', closeAll));
  document.querySelectorAll<HTMLElement>('.modal-wrap').forEach((w) => w.addEventListener('click', (e) => { if (e.target === w) closeAll(); }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAll(); b.classList.remove('drawer-open'); } });

  // filtro por status (chips)
  document.querySelectorAll<HTMLElement>('.chips').forEach((g) => g.addEventListener('click', (e) => {
    const c = (e.target as Element).closest('.chipf'); if (!c) return;
    g.querySelectorAll('.chipf').forEach((x) => x.classList.remove('on')); c.classList.add('on');
    filtro = (c.getAttribute('data-status') ?? '') as '' | StatusP; renderList();
  }));

  const save = qs<HTMLElement>('#proj-save'); if (save) save.addEventListener('click', () => { void salvar(); });

  const list = qs<HTMLElement>('#proj-list');
  if (list) list.addEventListener('click', (e) => { const c = (e.target as Element).closest('.proj-card'); if (c) void abrirDetalhe(c.getAttribute('data-id') ?? ''); });

  const del = qs<HTMLElement>('#projd-del'); if (del) del.addEventListener('click', () => { void remover(del.getAttribute('data-id') ?? ''); });
  const ed = qs<HTMLElement>('#projd-edit'); if (ed) ed.addEventListener('click', () => { const p = projetos.find((x) => x.id === ed.getAttribute('data-id')); if (p) abrirNovo(p); });
}

async function boot(): Promise<void> { wire(); await carregar();
  window.setInterval(() => { void carregar(); }, 60000);
  window.addEventListener('jc:mudou', () => { void carregar(); }); } // push em tempo real (SSE)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void boot(); });
else void boot();

export {}; // isola o escopo (arquivo é módulo, não script global)
