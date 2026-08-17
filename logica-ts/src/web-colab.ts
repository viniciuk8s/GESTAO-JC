/**
 * Tela "Colaboradores" (browser) — cadastro/gerenciamento da foto de cada
 * colaborador via API local. A foto passa a valer em todas as seções.
 */
import { API_BASE, carregarFuncionarios, listaFuncionarios, iniciais, urlArquivo } from './avatar.ts';

const I = {
  cam: '<iconify-icon icon="ion:camera-outline"></iconify-icon>',
  trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
  off: '<iconify-icon icon="ion:cloud-offline-outline"></iconify-icon>',
  check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
  users: '<iconify-icon icon="ion:people-outline"></iconify-icon>',
  layers: '<iconify-icon icon="ion:layers-outline"></iconify-icon>',
  image: '<iconify-icon icon="ion:image-outline"></iconify-icon>',
};

function h<K extends keyof HTMLElementTagNameMap>(t: K, c?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(t); if (c) e.className = c; if (html !== undefined) e.innerHTML = html; return e;
}
function qs<T extends Element>(s: string): T | null { return document.querySelector<T>(s); }

let online = false;

function setStatus(): void {
  const el = qs<HTMLElement>('#api-status');
  if (!el) return;
  el.className = 'api-pill ' + (online ? 'on' : 'off');
  el.innerHTML = online ? `<i></i> API conectada` : `${I.off} API offline`;
}

// ================= Painel VA (ApexCharts via CDN) + herói ao vivo =================
type ApexInst = { render(): void; updateSeries(s: unknown, animate?: boolean): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
let heroChart: ApexInst | null = null;
let gaugeChart: ApexInst | null = null;
let donutChart: ApexInst | null = null;
// ordem categórica validada (dataviz): separação CVD entre adjacentes
const AREA_CORES = ['#ef6300', '#34d399', '#5b8def', '#fbbf24', '#a78bfa', '#fb7185'];
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
function vis(el: Element | null): boolean { return !!el && (el as HTMLElement).clientWidth > 4; }
function area(setor: string): string {
  const s = setor.toLowerCase();
  if (s.includes('engenh')) return 'Engenharia';
  if (s.includes('comerc')) return 'Comercial';
  if (s.includes('eletricist')) return 'Elétrica';
  if (s.includes('técnic') || s.includes('tecnic') || s.includes('solar') || s.includes('auxiliar')) return 'Técnico';
  return 'Outros';
}

function renderPanel(): void {
  const funcs = listaFuncionarios();
  const total = funcs.length;
  const comFoto = funcs.filter((f) => !!f.foto).length;
  const setores = new Set(funcs.map((f) => f.setor)).size;
  // herói
  const v = qs<HTMLElement>('#col-hero-val'); const s = qs<HTMLElement>('#col-hero-sub');
  if (v) v.textContent = online ? String(total) : '—';
  if (s) s.innerHTML = online
    ? `<b style="color:var(--pos)">${comFoto}</b> com foto · <b style="color:#fbbf24">${total - comFoto}</b> pendente${total - comFoto === 1 ? '' : 's'}`
    : 'conecte a API para ver os dados';
  // KPIs
  const k = qs<HTMLElement>('#col-kpis');
  if (k) k.innerHTML = online ? (
    `<div class="sumcard card" data-tip="Total de colaboradores na equipe"><span class="si acc">${I.users}</span><div class="sc-info"><small>Colaboradores</small><b data-count="${total}" data-fmt="int" data-ck="colab-total">${total}</b></div></div>` +
    `<div class="sumcard card" data-tip="Colaboradores com foto cadastrada"><span class="si green">${I.cam}</span><div class="sc-info"><small>Com foto</small><b data-count="${comFoto}" data-fmt="int" data-ck="colab-foto">${comFoto}</b></div></div>` +
    `<div class="sumcard card" data-tip="Número de setores distintos"><span class="si blue">${I.layers}</span><div class="sc-info"><small>Setores</small><b data-count="${setores}" data-fmt="int" data-ck="colab-setores">${setores}</b></div></div>`
  ) : '';
  const A = apex(); if (!A || !online) return;
  // herói: barra horizontal empilhada — com foto × pendente
  const hEl = qs<HTMLElement>('#col-hero-chart');
  const heroSeries = [{ name: 'Com foto', data: [comFoto] }, { name: 'Pendente', data: [total - comFoto] }];
  if (heroChart) heroChart.updateSeries(heroSeries);
  else if (vis(hEl)) {
    heroChart = new A(hEl!, {
      chart: { type: 'bar', height: 120, stacked: true, sparkline: { enabled: true }, fontFamily: 'Inter, sans-serif' },
      series: heroSeries, colors: ['#34d399', '#fbbf24'],
      plotOptions: { bar: { horizontal: true, barHeight: '40%', borderRadius: 5 } },
      dataLabels: { enabled: false }, stroke: { width: 0 },
      legend: { show: true, position: 'bottom', fontSize: '11px', labels: { colors: '#98a1b3' }, markers: { radius: 3 } },
      tooltip: { theme: 'dark', y: { formatter: (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}` } },
    });
    heroChart.render();
  }
  // donut: equipe por área + legenda
  const grupos = new Map<string, number>();
  for (const f of funcs) grupos.set(area(f.setor), (grupos.get(area(f.setor)) ?? 0) + 1);
  const areas = [...grupos.entries()].sort((a, b) => b[1] - a[1]);
  const dEl = qs<HTMLElement>('#col-donut');
  const dOpts = {
    chart: { type: 'donut', height: 218, fontFamily: 'Inter, sans-serif' },
    series: areas.map((a) => a[1]), labels: areas.map((a) => a[0]), colors: AREA_CORES,
    plotOptions: { pie: { donut: { size: '64%', labels: { show: true, name: { show: true, color: '#98a1b3', fontSize: '11px' }, value: { show: true, color: '#fff', fontSize: '20px', fontFamily: 'Sora, sans-serif', fontWeight: 800 }, total: { show: true, label: 'Equipe', color: '#98a1b3', fontSize: '11px', formatter: () => String(total) } } } } },
    dataLabels: { enabled: false }, stroke: { width: 2, colors: ['#0c0e13'] },
    legend: { show: false }, tooltip: { theme: 'dark', y: { formatter: (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}` } },
  };
  if (donutChart) donutChart.updateOptions(dOpts);
  else if (vis(dEl)) { donutChart = new A(dEl!, dOpts); donutChart.render(); }
  const leg = qs<HTMLElement>('#col-donut-leg');
  if (leg) leg.innerHTML = areas.map((a, i) => `<div class="leg-row"><span class="leg-dot" style="background:${AREA_CORES[i % AREA_CORES.length]}"></span><span class="leg-name">${a[0]}</span><span class="leg-val">${a[1]}</span><span class="leg-pct">${Math.round((a[1] / (total || 1)) * 100)}%</span></div>`).join('');
  // gauge: % com foto de perfil
  const gEl = qs<HTMLElement>('#col-gauge');
  const pct = total > 0 ? Math.round((comFoto / total) * 100) : 0;
  if (gaugeChart) gaugeChart.updateSeries([pct]);
  else if (vis(gEl)) {
    gaugeChart = new A(gEl!, {
      chart: { type: 'radialBar', height: 210, fontFamily: 'Inter, sans-serif' },
      series: [pct], labels: ['com foto'], colors: ['#34d399'],
      plotOptions: { radialBar: { hollow: { size: '56%' }, track: { background: 'rgba(255,255,255,.06)' },
        dataLabels: { name: { show: true, color: '#98a1b3', fontSize: '11px', offsetY: 24 },
          value: { show: true, color: '#fff', fontSize: '30px', fontFamily: 'Sora, sans-serif', fontWeight: 800, offsetY: -8, formatter: (n: number) => n + '%' } } } },
      stroke: { lineCap: 'round' },
    });
    gaugeChart.render();
  }
  const gSub = qs<HTMLElement>('#col-gauge-sub');
  if (gSub) gSub.innerHTML = `<div><small>Com foto</small><b style="color:var(--pos)">${comFoto}</b></div><div><small>Pendente</small><b style="color:#fbbf24">${total - comFoto}</b></div>`;
}

function render(): void {
  setStatus();
  const grid = qs<HTMLElement>('#colab-grid');
  if (!grid) return;
  const funcs = listaFuncionarios();
  grid.innerHTML = '';
  if (!online) {
    grid.appendChild(h('div', 'colab-offline card', `${I.off}<div><b>API local não encontrada</b><p>Inicie a API para gerenciar as fotos:</p><code>cd api &amp;&amp; npm install &amp;&amp; npm run api</code><p class="dim">Sem a API, as demais telas mostram o avatar de iniciais normalmente.</p></div>`));
    return;
  }
  for (const f of funcs) {
    const card = h('div', 'colab card');
    card.setAttribute('data-search', `${f.nome} ${f.setor}`.toLowerCase());
    card.setAttribute('data-sort-nome', f.nome.toLowerCase());
    card.setAttribute('data-sort-foto', f.foto ? '1' : '0');
    const av = f.foto
      ? `<span class="colab-av foto"><img src="${urlArquivo(f.foto)}" alt="${f.nome}"></span>`
      : `<span class="colab-av ${f.cor}">${iniciais(f.nome)}</span>`;
    card.innerHTML =
      `${av}<div class="colab-id"><b>${f.nome}</b><small>${f.setor}</small></div>` +
      `<div class="colab-acts">` +
      `<label class="btn btn-ghost sm"><input type="file" accept="image/*" data-id="${f.id}" hidden>${I.cam} ${f.foto ? 'Trocar' : 'Enviar foto'}</label>` +
      (f.foto ? `<button class="btn btn-ghost sm danger" data-del="${f.id}" title="Remover foto">${I.trash}</button>` : '') +
      `</div>`;
    grid.appendChild(card);
  }
  grid.querySelectorAll<HTMLInputElement>('input[type=file]').forEach((inp) => {
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('foto', file);
      try { await fetch(`${API_BASE}/api/funcionarios/${inp.dataset.id}/foto`, { method: 'POST', body: fd }); } catch { /* noop */ }
      await reload();
      toast('Foto atualizada — já vale em todas as seções');
    });
  });
  grid.querySelectorAll<HTMLElement>('[data-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      try { await fetch(`${API_BASE}/api/funcionarios/${b.getAttribute('data-del')}/foto`, { method: 'DELETE' }); } catch { /* noop */ }
      await reload();
      toast('Foto removida');
    });
  });
}

async function reload(): Promise<void> {
  await carregarFuncionarios();
  online = listaFuncionarios().length > 0;
  render();
  renderPanel();
}

function toast(msg: string): void {
  let t = qs<HTMLElement>('#colab-toast');
  if (!t) { t = h('div', 'toast', `${I.check}<span></span>`); t.id = 'colab-toast'; document.body.appendChild(t); }
  t.querySelector('span')!.textContent = msg;
  document.body.classList.add('toast-open');
  window.setTimeout(() => document.body.classList.remove('toast-open'), 2600);
}

async function boot(): Promise<void> {
  await reload();
  // auto-refresh ao vivo (~5s): reflete fotos enviadas/removidas (aqui ou em outra sessão)
  window.setInterval(() => { void reload(); }, 60000); // rede de segurança
  window.addEventListener('jc:mudou', () => { void reload(); }); // push em tempo real (SSE)
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else void boot();
