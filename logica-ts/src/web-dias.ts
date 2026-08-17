/**
 * Tela "Dias trabalhados" (browser). Usa a lógica tipada de ./jornadas.ts.
 * - lista jornadas por colaborador (com status de pagamento)
 * - clique no dia → detalhe (o que foi feito) + marcar pago / excluir
 * - "Registrar dia" → lançamento manual
 * - dados 100% no banco (API /api/jornadas): serviços concluídos na Agenda
 *   entram automaticamente; refresh ao vivo reflete alterações de outras secções.
 */
import { DiasTrabalhadosStore, type Jornada, type NovaJornada } from './jornadas.ts';
import { formatarDuracao } from './agendamentos.ts';
import { avatarHtml, carregarFuncionarios } from './avatar.ts';

const HOJE = '2026-07-22';
const MESES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)} ${MESES_ABBR[Number(iso.slice(5, 7)) - 1] ?? ''}`;
}
function dataLonga(iso: string): string {
  const ano = Number(iso.slice(0, 4));
  const mes0 = Number(iso.slice(5, 7)) - 1;
  const dia = Number(iso.slice(8, 10));
  const wd = new Date(ano, mes0, dia).getDay();
  return `${WD[wd]}, ${dia} de ${MESES[mes0]}`;
}

const TECNICOS = ['Carlos Lima', 'Rafael Gomes', 'João Pedro', 'Maria Souza', 'Ana Beatriz'];
const DURACOES = [60, 120, 180, 240, 300, 480];
interface Info { setor: string; cor: string; }
const FUNC_INFO: Record<string, Info> = {
  'Carlos Lima': { setor: 'Técnico — Energia solar', cor: 'b' },
  'Rafael Gomes': { setor: 'Auxiliar técnico', cor: 'c' },
  'João Pedro': { setor: 'Eletricista', cor: 'd' },
  'Maria Souza': { setor: 'Engenheira eletricista', cor: 'a' },
  'Ana Beatriz': { setor: 'Comercial', cor: 'a' },
};
function info(nome: string): Info { return FUNC_INFO[nome] ?? { setor: 'Colaborador', cor: 'a' }; }
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

const I = {
  cal: '<iconify-icon icon="ion:calendar-number-outline"></iconify-icon>',
  clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
  users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
  coin: '<iconify-icon icon="ion:cash-outline"></iconify-icon>',
  check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
  x: '<iconify-icon icon="ion:close-outline"></iconify-icon>',
  trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
  plus: '<iconify-icon icon="ion:add-outline"></iconify-icon>',
  chev: '<iconify-icon icon="ion:chevron-down-outline"></iconify-icon>',
};

// ---------- dados (API / banco) — nada é salvo localmente ----------
const API_BASE = (window as unknown as { JC_API?: string }).JC_API || 'http://localhost:3000';
// o store é apenas agregação em memória: recriado a cada leitura do banco.
let store = new DiasTrabalhadosStore([]);

// escrita na API (o fetch global injeta o Authorization). Retorna se deu certo.
async function apiJornada(path: string, method: string, body?: unknown): Promise<boolean> {
  try {
    const opt: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const r = await fetch(API_BASE + path, opt);
    return r.ok;
  } catch { return false; }
}

// leitura: reconstrói o store a partir do banco (fonte única da verdade)
async function carregar(): Promise<void> {
  try {
    const r = await fetch(API_BASE + '/api/jornadas');
    if (!r.ok) return;
    const arr = (await r.json()) as Jornada[];
    store = new DiasTrabalhadosStore(arr.map((j) => ({ ...j, pago: !!j.pago })));
  } catch { /* offline: mantém o store atual */ }
}

// ---------- render ----------
function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }
function h<K extends keyof HTMLElementTagNameMap>(t: K, c?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(t); if (c) e.className = c; if (html !== undefined) e.innerHTML = html; return e;
}
function payBadge(pago: boolean): string {
  return pago ? `<span class="apt-b ok">${I.check} Pago</span>` : `<span class="apt-b wait">A pagar</span>`;
}

// ---------- gráficos VA (ApexCharts via CDN) + herói ao vivo ----------
// (apenas apresentação — reflete o mesmo `store` já usado pela lista/CRUD)
type ApexInst = { render(): void; updateSeries(s: unknown, animate?: boolean): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
let horasChart: ApexInst | null = null;
let heroChart: ApexInst | null = null;
let gaugeChart: ApexInst | null = null;
const AXIS = { colors: '#6b7385', fontSize: '10px', fontWeight: 600 };
// ordem categórica validada (dataviz): separação CVD entre adjacentes; slate por último (8ª série rara)
const FUNC_CORES = ['#ef6300', '#34d399', '#5b8def', '#fbbf24', '#a78bfa', '#fb7185', '#38bdf8', '#94a3b8'];
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
function vis(el: Element | null): boolean { return !!el && (el as HTMLElement).clientWidth > 4; }

function renderHero(): void {
  const dias = store.totalDias();
  const aPagar = store.totalApagar();
  const v = qs<HTMLElement>('#dias-hero-val');
  const s = qs<HTMLElement>('#dias-hero-sub');
  if (v) v.textContent = formatarDuracao(store.totalMinutos());
  if (s) s.innerHTML = `<b>${dias}</b> ${dias === 1 ? 'dia' : 'dias'} trabalhados · <b style="color:#fbbf24">${aPagar}</b> a pagar`;
  const A = apex(); if (!A) return;
  const hEl = qs<HTMLElement>('#dias-hero-chart');
  const pagos = Math.max(0, dias - aPagar);
  const series = [{ name: 'Pagos', data: [pagos] }, { name: 'A pagar', data: [aPagar] }];
  if (heroChart) heroChart.updateSeries(series);
  else if (vis(hEl)) {
    heroChart = new A(hEl!, {
      chart: { type: 'bar', height: 120, stacked: true, sparkline: { enabled: true }, fontFamily: 'Inter, sans-serif' },
      series, colors: ['#34d399', '#fbbf24'],
      plotOptions: { bar: { horizontal: true, barHeight: '40%', borderRadius: 5 } },
      dataLabels: { enabled: false }, stroke: { width: 0 },
      legend: { show: true, position: 'bottom', fontSize: '11px', labels: { colors: '#98a1b3' }, markers: { radius: 3 } },
      tooltip: { theme: 'dark', y: { formatter: (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}` } },
    });
    heroChart.render();
  }
}

function renderCharts(): void {
  const A = apex(); if (!A) return;
  const rows = store.porFuncionario();
  // horas por colaborador (barras distribuídas)
  const bEl = qs<HTMLElement>('#dias-horas');
  const nomes = rows.map((r) => r.funcionario.split(' ')[0]);
  const mins = rows.map((r) => r.minutos);
  const bSeries = [{ name: 'Horas', data: mins }];
  if (horasChart) horasChart.updateOptions({ series: bSeries, xaxis: { categories: nomes }, colors: FUNC_CORES });
  else if (vis(bEl)) {
    horasChart = new A(bEl!, {
      chart: { type: 'bar', height: 230, toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
      series: bSeries, colors: FUNC_CORES,
      plotOptions: { bar: { distributed: true, columnWidth: '46%', borderRadius: 8, borderRadiusApplication: 'end', dataLabels: { position: 'top' } } },
      fill: { type: 'gradient', gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.18, opacityFrom: 1, opacityTo: 0.82, stops: [0, 100] } },
      dataLabels: { enabled: true, offsetY: -18, style: { colors: ['#cbd3e1'], fontSize: '11px', fontWeight: 700 }, formatter: (v: number) => formatarDuracao(v) },
      xaxis: { categories: nomes, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { labels: { formatter: (v: number) => Math.round(v / 60) + 'h', style: AXIS } },
      legend: { show: false }, grid: { borderColor: 'rgba(255,255,255,.05)', strokeDashArray: 4 },
      tooltip: { theme: 'dark', y: { formatter: (v: number) => formatarDuracao(v) } },
    });
    horasChart.render();
  }
  // gauge: % de dias pagos
  const gEl = qs<HTMLElement>('#dias-gauge');
  const dias = store.totalDias();
  const pagosDias = Math.max(0, dias - store.totalApagar());
  const pct = dias > 0 ? Math.round((pagosDias / dias) * 100) : 0;
  if (gaugeChart) gaugeChart.updateSeries([pct]);
  else if (vis(gEl)) {
    gaugeChart = new A(gEl!, {
      chart: { type: 'radialBar', height: 210, fontFamily: 'Inter, sans-serif' },
      series: [pct], labels: ['dias pagos'], colors: ['#34d399'],
      plotOptions: { radialBar: { hollow: { size: '56%' }, track: { background: 'rgba(255,255,255,.06)' },
        dataLabels: { name: { show: true, color: '#98a1b3', fontSize: '11px', offsetY: 24 },
          value: { show: true, color: '#fff', fontSize: '30px', fontFamily: 'Sora, sans-serif', fontWeight: 800, offsetY: -8, formatter: (v: number) => v + '%' } } } },
      stroke: { lineCap: 'round' },
    });
    gaugeChart.render();
  }
  const gSub = qs<HTMLElement>('#dias-gauge-sub');
  if (gSub) gSub.innerHTML = `<div><small>Pagos</small><b style="color:var(--pos)">${pagosDias}</b></div><div><small>A pagar</small><b style="color:#fbbf24">${store.totalApagar()}</b></div>`;
}

// auto-refresh ao vivo: recarrega do banco e reflete o que outras secções fizeram
async function refresh(): Promise<void> { await carregar(); render(); renderHero(); renderCharts(); }

function render(): void {
  const sum = qs<HTMLElement>('#dias-sum');
  if (sum) {
    sum.innerHTML =
      `<div class="sumcard card" data-tip="Total de dias com jornada registrada no mês"><span class="si acc">${I.cal}</span><div class="sc-info"><small>Dias trabalhados</small><b data-count="${store.totalDias()}" data-fmt="int" data-ck="dias-total">${store.totalDias()}</b></div></div>` +
      `<div class="sumcard card" data-tip="Soma das horas de todas as jornadas"><span class="si green">${I.clock}</span><div class="sc-info"><small>Horas registradas</small><b data-count="${store.totalMinutos()}" data-fmt="horas" data-ck="dias-horas">${formatarDuracao(store.totalMinutos())}</b></div></div>` +
      `<div class="sumcard card" data-tip="Dias trabalhados ainda não pagos"><span class="si red">${I.coin}</span><div class="sc-info"><small>Dias a pagar</small><b data-count="${store.totalApagar()}" data-fmt="int" data-ck="dias-apagar">${store.totalApagar()}</b></div></div>`;
  }
  const list = qs<HTMLElement>('#dias-list');
  if (!list) return;
  list.innerHTML = '';
  for (const r of store.porFuncionario()) {
    const inf = info(r.funcionario);
    const card = h('section', 'emp card');
    card.setAttribute('data-search', `${r.funcionario} ${inf.setor} ${r.jornadas.map((j) => j.servico + ' ' + j.cliente).join(' ')}`.toLowerCase());
    const linhas = r.jornadas
      .map((j) => {
        const novo = '';
        return (
          `<div class="empday" data-id="${j.id}">` +
          `<span class="ed-date">${dataCurta(j.data)}</span>` +
          `<div class="ed-main"><b>${j.servico}${novo}</b><small>${j.cliente}</small></div>` +
          `${payBadge(j.pago)}<span class="ed-dur">${formatarDuracao(j.duracaoMin)}</span></div>`
        );
      })
      .join('');
    card.innerHTML =
      `<div class="emp-head">${avatarHtml(r.funcionario, 'emp-av', inf.cor)}` +
      `<div class="emp-id"><b>${r.funcionario}</b><small>${inf.setor}</small></div>` +
      `<div class="emp-stats"><div><b>${r.dias}</b><small>${r.dias === 1 ? 'dia' : 'dias'}</small></div>` +
      `<div><b>${formatarDuracao(r.minutos)}</b><small>horas</small></div>` +
      `<div><b>${r.aPagar}</b><small>a pagar</small></div></div></div>` +
      `<div class="emp-days">${linhas}</div>`;
    list.appendChild(card);
  }
  // clique nos dias → detalhe
  list.querySelectorAll<HTMLElement>('.empday').forEach((row) => {
    row.addEventListener('click', () => abrirDetalhe(row.getAttribute('data-id')!));
  });
}

// ---------- detalhe do dia ----------
function abrirDetalhe(id: string): void {
  const j = store.buscar(id);
  if (!j) return;
  const body = qs<HTMLElement>('#jor-body');
  const foot = qs<HTMLElement>('#jor-foot');
  if (!body || !foot) return;
  body.innerHTML =
    `<div class="mrow"><span>Colaborador</span><b>${j.funcionario}</b></div>` +
    `<div class="mrow"><span>Data</span><b>${dataLonga(j.data)}</b></div>` +
    `<div class="mrow"><span>Serviço</span><b>${j.servico}</b></div>` +
    `<div class="mrow"><span>Cliente</span><b>${j.cliente}</b></div>` +
    `<div class="mrow"><span>Duração</span><b>${formatarDuracao(j.duracaoMin)}</b></div>` +
    `<div class="mrow"><span>Pagamento</span><b>${payBadge(j.pago)}</b></div>`;
  foot.innerHTML = '';
  const del = h('button', 'btn btn-ghost danger', `${I.trash} Excluir`);
  del.addEventListener('click', () => { void (async () => {
    const ok = await apiJornada('/api/jornadas/' + id, 'DELETE');
    if (!ok) { toast('Não foi possível excluir'); return; }
    await carregar(); fechar(); render(); renderHero(); renderCharts(); toast('Dia trabalhado excluído');
  })(); });
  const pay = h('button', 'btn btn-primary', j.pago ? `${I.coin} Marcar como a pagar` : `${I.check} Marcar como pago`);
  pay.addEventListener('click', () => { void (async () => {
    const ok = await apiJornada('/api/jornadas/' + id + '/pagar', 'POST', { pago: !j.pago });
    if (!ok) { toast('Não foi possível atualizar'); return; }
    await carregar(); render(); renderHero(); renderCharts(); abrirDetalhe(id); toast(j.pago ? 'Marcado como a pagar' : 'Pagamento registrado');
  })(); });
  foot.appendChild(del);
  foot.appendChild(pay);
  document.body.classList.remove('reg-open');
  document.body.classList.add('jornada-open');
}

// ---------- registrar dia (manual) ----------
function abrirRegistro(): void {
  document.body.classList.remove('jornada-open');
  document.body.classList.add('reg-open');
  setPagoReg(false);
}
function setPagoReg(pago: boolean): void {
  qs<HTMLElement>('#reg-pago')!.classList.toggle('on', pago);
  qs<HTMLElement>('#reg-apagar')!.classList.toggle('on', !pago);
  qs<HTMLElement>('#m-reg')!.setAttribute('data-pago', pago ? '1' : '0');
}
async function salvarRegistro(): Promise<void> {
  const funcionario = qs<HTMLSelectElement>('#reg-func')!.value;
  const data = qs<HTMLInputElement>('#reg-data')!.value;
  const servico = qs<HTMLInputElement>('#reg-serv')!.value.trim();
  const cliente = qs<HTMLInputElement>('#reg-cli')!.value.trim();
  const duracaoMin = Number(qs<HTMLSelectElement>('#reg-dur')!.value);
  const pago = qs<HTMLElement>('#m-reg')!.getAttribute('data-pago') === '1';
  const erro = qs<HTMLElement>('#reg-erro')!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || servico === '') {
    erro.style.display = 'block';
    erro.textContent = 'Informe a data e a atividade.';
    return;
  }
  erro.style.display = 'none';
  const nova: NovaJornada = { funcionario, data, servico, cliente: cliente || '—', duracaoMin, pago };
  const ok = await apiJornada('/api/jornadas', 'POST', nova);
  if (!ok) {
    erro.style.display = 'block';
    erro.textContent = 'Não foi possível registrar. Verifique os dados e tente novamente.';
    return;
  }
  await carregar();
  fechar();
  render();
  renderHero();
  renderCharts();
  toast(`Dia registrado para ${funcionario}`);
}

function fechar(): void { document.body.classList.remove('jornada-open', 'reg-open'); }
function toast(msg: string): void {
  const t = qs<HTMLElement>('#dias-toast');
  if (!t) return;
  t.querySelector('span')!.textContent = msg;
  document.body.classList.add('toast-open');
  window.setTimeout(() => document.body.classList.remove('toast-open'), 2600);
}

// ---------- montagem dos modais ----------
function montar(): void {
  const funcOpts = TECNICOS.map((t) => `<option value="${t}">${t}</option>`).join('');
  const durOpts = DURACOES.map((d) => `<option value="${d}">${formatarDuracao(d)}</option>`).join('');
  const wrap = h('div', '');
  wrap.innerHTML = `
  <div class="modal-wrap" id="m-jornada"><div class="modal">
    <div class="modal-head"><h3>Dia trabalhado</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body" id="jor-body"></div>
    <div class="modal-foot" id="jor-foot"></div>
  </div></div>

  <div class="modal-wrap" id="m-reg"><div class="modal modal-lg" data-pago="0">
    <div class="modal-head"><h3>Registrar dia trabalhado</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div id="reg-erro" class="f-erros" style="display:none"></div>
      <div class="form-grid">
        <div class="field"><label>Colaborador</label><div class="selwrap">${I.chev}<select class="sel selnat" id="reg-func">${funcOpts}</select></div></div>
        <div class="field"><label>Data</label><input class="inp" id="reg-data" type="date" value="${HOJE}"></div>
      </div>
      <div class="field span2"><label>Atividade / serviço</label><input class="inp" id="reg-serv" placeholder="Ex.: Instalação de painéis solares"></div>
      <div class="form-grid">
        <div class="field"><label>Cliente / local</label><input class="inp" id="reg-cli" placeholder="Opcional"></div>
        <div class="field"><label>Duração</label><div class="selwrap">${I.chev}<select class="sel selnat" id="reg-dur">${durOpts}</select></div></div>
      </div>
      <label class="fl">Pagamento</label>
      <div class="seg"><button class="seg-btn waitc on" id="reg-apagar">${I.coin} A pagar</button><button class="seg-btn okc" id="reg-pago">${I.check} Pago</button></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="reg-salvar">${I.check} Registrar</button></div>
  </div></div>

  <div class="toast" id="dias-toast">${I.check}<span>Salvo</span></div>`;
  document.body.appendChild(wrap);

  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', fechar));
  qs<HTMLElement>('#m-jornada')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) fechar(); });
  qs<HTMLElement>('#m-reg')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) fechar(); });
  qs<HTMLElement>('#reg-pago')!.addEventListener('click', () => setPagoReg(true));
  qs<HTMLElement>('#reg-apagar')!.addEventListener('click', () => setPagoReg(false));
  qs<HTMLButtonElement>('#reg-salvar')!.addEventListener('click', () => void salvarRegistro());
  const btn = qs<HTMLElement>('.ph-actions .btn-primary');
  if (btn) btn.addEventListener('click', abrirRegistro);
  const fab = qs<HTMLElement>('#dias-fab');
  if (fab) fab.addEventListener('click', abrirRegistro);
}

async function boot(): Promise<void> {
  montar();
  await carregarFuncionarios();
  await carregar();
  render();
  renderHero();
  renderCharts();
  // auto-refresh ao vivo (~5s): mantém painel e gráficos em sincronia com o banco
  window.setInterval(() => { void refresh(); }, 60000); // rede de segurança
  window.addEventListener('jc:mudou', () => { void refresh(); }); // push em tempo real (SSE)
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else void boot();
