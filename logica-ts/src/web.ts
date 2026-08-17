/**
 * Integração de Agendamentos com o protótipo (browser).
 * Usa exclusivamente a lógica tipada de ./agendamentos.ts.
 * Compilado com esbuild (IIFE) e injetado no HTML gerado.
 */
import {
  estadoDaData,
  acoesPara,
  conflitosNoDia,
  conflitosDoCandidato,
  validarServico,
  formatarBRL,
  formatarDuracao,
  minutosDoDia,
  horaDeMinutos,
  type Servico,
  type NovoServico,
  type Situacao,
} from './agendamentos.ts';
import { avatarHtml, carregarFuncionarios } from './avatar.ts';

// Tudo vem da API (nada em localStorage). Base configurável por window.JC_API.
const API_BASE: string = (window as unknown as { JC_API?: string }).JC_API || 'http://localhost:3000';

const HOJE = '2026-07-22';

const WD_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WD_CURTO = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Estado de navegação do calendário
let anoAtual = 2026;
let mesAtual = 6; // 0 = janeiro; 6 = julho
let semanaRef = new Date(2026, 6, 22); // dia de referência da visão "Semana"

const pad2 = (n: number): string => String(n).padStart(2, '0');
function iso(ano: number, mes0: number, dia: number): string {
  return `${ano}-${pad2(mes0 + 1)}-${pad2(dia)}`;
}
function partesDoIso(s: string): { ano: number; mes0: number; dia: number } {
  return { ano: Number(s.slice(0, 4)), mes0: Number(s.slice(5, 7)) - 1, dia: Number(s.slice(8, 10)) };
}
function diaDaSemanaIso(s: string): number {
  const p = partesDoIso(s);
  return new Date(p.ano, p.mes0, p.dia).getDay();
}
function rotuloData(s: string): string {
  const p = partesDoIso(s);
  return `${WD_LONGO[diaDaSemanaIso(s)]}, ${p.dia} de ${MESES[p.mes0]}`;
}
function cap(txt: string): string {
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// ------------------------------------------------------------------
// Ícones (lucide, sem width/height — dimensionados por CSS)
// ------------------------------------------------------------------
const I = {
  pin: '<iconify-icon icon="ion:location-outline"></iconify-icon>',
  clock: '<iconify-icon icon="ion:time-outline"></iconify-icon>',
  pencil: '<iconify-icon icon="ion:create-outline"></iconify-icon>',
  trash: '<iconify-icon icon="ion:trash-outline"></iconify-icon>',
  plus: '<iconify-icon icon="ion:add-outline"></iconify-icon>',
  x: '<iconify-icon icon="ion:close-outline"></iconify-icon>',
  check: '<iconify-icon icon="ion:checkmark-outline"></iconify-icon>',
  alert: '<iconify-icon icon="ion:warning-outline"></iconify-icon>',
  chev: '<iconify-icon icon="ion:chevron-down-outline"></iconify-icon>',
  cal: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
  calday: '<iconify-icon icon="ion:calendar-outline"></iconify-icon>',
  wallet: '<iconify-icon icon="ion:wallet-outline"></iconify-icon>',
};

// ------------------------------------------------------------------
// Dados: vêm da API. Cache local só para renderizar (sem localStorage).
// ------------------------------------------------------------------
let servicos: Servico[] = [];
let online = false;
function todos(): Servico[] { return servicos; }
function doDia(isoD: string): Servico[] {
  return servicos.filter((s) => s.data === isoD).sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio));
}
function buscar(id: string): Servico | undefined { return servicos.find((s) => s.id === id); }
async function carregarServicos(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/agendamentos`);
    if (!r.ok) throw new Error('api');
    servicos = (await r.json()) as Servico[];
    online = true;
  } catch { online = false; }
}
/** POST (criar) ou PUT (editar) um serviço. 409 = conflito de horário. */
async function apiSalvarServico(dados: NovoServico, forcar: boolean, id?: string): Promise<{ ok: boolean; status: number; erros?: string[] }> {
  const url = id ? `${API_BASE}/api/agendamentos/${id}` : `${API_BASE}/api/agendamentos`;
  try {
    const r = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dados, forcar }) });
    if (r.ok) return { ok: true, status: r.status };
    const j = (await r.json().catch(() => ({}))) as { erros?: string[] };
    const out: { ok: boolean; status: number; erros?: string[] } = { ok: false, status: r.status };
    if (j.erros) out.erros = j.erros;
    return out;
  } catch { return { ok: false, status: 0, erros: ['API offline — inicie a API e tente novamente.'] }; }
}
async function apiRemoverServico(id: string): Promise<void> {
  try { await fetch(`${API_BASE}/api/agendamentos/${id}`, { method: 'DELETE' }); } catch { /* noop */ }
}
async function apiConcluirServico(id: string): Promise<{ ok: boolean; temJornada: boolean; tecnico: string }> {
  try {
    const r = await fetch(`${API_BASE}/api/agendamentos/${id}/concluir`, { method: 'POST' });
    if (!r.ok) return { ok: false, temJornada: false, tecnico: '' };
    const j = (await r.json()) as { servico: Servico; jornada: unknown };
    return { ok: true, temJornada: !!j.jornada, tecnico: j.servico?.tecnico ?? '' };
  } catch { return { ok: false, temJornada: false, tecnico: '' }; }
}

const TECNICOS = ['Carlos Lima', 'Rafael Gomes', 'João Pedro', 'Maria Souza', 'Ana Beatriz'];
const DURACOES = [30, 60, 90, 120, 180, 240];

// ------------------------------------------------------------------
// Helpers DOM
// ------------------------------------------------------------------
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
}
function qs<T extends Element>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}

function parseCentavosBR(v: string): number {
  const limpo = v.replace(/[^\d,]/g, '');
  if (limpo === '') return 0;
  const [reais, cent = ''] = limpo.split(',');
  const c = (cent + '00').slice(0, 2);
  return Number((reais || '0').replace(/\D/g, '')) * 100 + Number(c);
}

let diaSelecionado = HOJE;

// ------------------------------------------------------------------
// Calendário: renderização dinâmica (mês + semana) a partir do store
// ------------------------------------------------------------------
function statusDoDia(isoD: string): 'ok' | 'wait' | null {
  const ativos = doDia(isoD).filter((s) => s.situacao !== 'cancelado');
  if (ativos.length === 0) return null;
  return ativos.some((s) => s.situacao === 'pendente') ? 'wait' : 'ok';
}

function pontoHtml(isoD: string, semana: boolean): string {
  const st = statusDoDia(isoD);
  if (!st) return '';
  return `<span class="${semana ? 'wdot' : 'cdot'} ${st}"></span>`;
}

/** Desenha o grid do mês e a faixa da semana com base no estado atual. */
function renderCalendario(): void {
  const card = qs<HTMLElement>('.cal-card');
  if (!card) return;

  const hb = qs<HTMLElement>('.cal-head b');
  if (hb) hb.textContent = `${cap(MESES[mesAtual]!)} ${anoAtual}`;

  // --- Grid do mês ---
  const cal = qs<HTMLElement>('.cal');
  if (cal) {
    let html = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((c) => `<span class="cah">${c}</span>`).join('');
    const primeiro = new Date(anoAtual, mesAtual, 1).getDay();
    const dias = new Date(anoAtual, mesAtual + 1, 0).getDate();
    for (let i = 0; i < primeiro; i++) html += '<span class="cd mut"></span>';
    for (let d = 1; d <= dias; d++) {
      const isoD = iso(anoAtual, mesAtual, d);
      const sel = isoD === diaSelecionado;
      const st = statusDoDia(isoD);
      const cls = 'cd' + (sel ? ' sel' : st ? ' has' : '');
      html += `<span class="${cls}" data-iso="${isoD}">${d}${pontoHtml(isoD, false)}</span>`;
    }
    const resto = (7 - ((primeiro + dias) % 7)) % 7;
    for (let i = 0; i < resto; i++) html += '<span class="cd mut"></span>';
    cal.innerHTML = html;
  }

  // --- Faixa da semana (domingo a sábado que contém semanaRef) ---
  const ws = qs<HTMLElement>('.weekstrip');
  if (ws) {
    const inicio = new Date(semanaRef);
    inicio.setDate(inicio.getDate() - inicio.getDay());
    let html = '';
    for (let i = 0; i < 7; i++) {
      const dt = new Date(inicio);
      dt.setDate(inicio.getDate() + i);
      const isoD = iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const sel = isoD === diaSelecionado;
      html += `<button class="wday${sel ? ' sel' : ''}" data-iso="${isoD}"><small>${WD_CURTO[i]}</small><b>${dt.getDate()}</b>${pontoHtml(isoD, true)}</button>`;
    }
    ws.innerHTML = html;
  }

  // Handlers de clique nos dias
  card.querySelectorAll<HTMLElement>('.cal .cd[data-iso], .weekstrip .wday[data-iso]').forEach((el) => {
    el.addEventListener('click', () => abrirDia(el.getAttribute('data-iso')!));
  });
}

/** Navega mês (visão Mês) ou semana (visão Semana). */
function navegar(delta: number): void {
  const card = qs<HTMLElement>('.cal-card');
  const view = card?.getAttribute('data-view') ?? 'month';
  if (view === 'week') {
    semanaRef.setDate(semanaRef.getDate() + delta * 7);
    anoAtual = semanaRef.getFullYear();
    mesAtual = semanaRef.getMonth();
  } else {
    mesAtual += delta;
    if (mesAtual < 0) { mesAtual = 11; anoAtual -= 1; }
    if (mesAtual > 11) { mesAtual = 0; anoAtual += 1; }
  }
  renderCalendario();
}

// ------------------------------------------------------------------
// Painel do dia (lista de serviços + ações)
// ------------------------------------------------------------------
function statusLabel(s: Situacao): string {
  return s === 'confirmado' ? 'Confirmado' : s === 'pendente' ? 'Pendente' : s === 'concluido' ? 'Concluído' : 'Cancelado';
}
function statusCls(s: Situacao): string {
  return s === 'confirmado' ? 'ok' : s === 'pendente' ? 'wait' : s === 'concluido' ? 'done' : 'cancel';
}

function renderAgendaLateral(iso: string): void {
  const card = qs<HTMLElement>('.agenda-card');
  if (!card) return;
  const servicos = doDia(iso);
  const total = servicos.filter((s) => s.situacao !== 'cancelado').reduce((a, s) => a + s.valorCentavos, 0);
  const head = qs<HTMLElement>('.ag-dayhead', card);
  if (head) {
    head.innerHTML =
      `<div><b>${rotuloData(iso).replace(',', ',')}</b><small>${servicos.length} ${servicos.length === 1 ? 'serviço agendado' : 'serviços agendados'}</small></div>` +
      `<span class="ag-total">${formatarBRL(total)}</span>`;
  }
  const lista = qs<HTMLElement>('.agenda-list', card);
  if (!lista) return;
  lista.innerHTML = '';
  if (servicos.length === 0) {
    lista.appendChild(h('div', 'day-empty', `${I.cal}<p>Nenhum serviço neste dia.</p>`));
    return;
  }
  const emConflito = new Set<string>();
  for (const c of conflitosNoDia(servicos)) {
    emConflito.add(c.a.id);
    emConflito.add(c.b.id);
  }
  for (const s of servicos) {
    const cls = statusCls(s.situacao);
    const conflitoTag = emConflito.has(s.id) ? `<span class="apt-b cancel">${I.alert} Conflito</span>` : '';
    const row = h('div', 'appt');
    row.innerHTML =
      `<div class="appt-time"><b>${s.inicio}</b><small>${formatarDuracao(s.duracaoMin)}</small></div>` +
      `<span class="appt-dot ${cls}"></span>` +
      `<div class="appt-card"><div class="appt-top"><b>${s.titulo}</b><div class="appt-badges"><span class="apt-b ${cls}">${statusLabel(s.situacao)}</span>${conflitoTag}</div></div>` +
      `<div class="appt-sub">${I.pin}<span>${s.cliente}</span></div>` +
      `<div class="appt-foot"><span class="appt-team">${avatarHtml(s.tecnico, 'av', avCor(s.tecnico))}${s.tecnico}</span><span class="appt-val">${formatarBRL(s.valorCentavos)}</span></div></div>`;
    lista.appendChild(row);
  }
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase();
}
function avCor(nome: string): string {
  const cores = ['a', 'b', 'c', 'd'];
  let soma = 0;
  for (let i = 0; i < nome.length; i++) soma += nome.charCodeAt(i);
  return cores[soma % cores.length]!;
}

function abrirDia(isoD: string): void {
  diaSelecionado = isoD;
  const p = partesDoIso(isoD);
  anoAtual = p.ano;
  mesAtual = p.mes0;
  semanaRef = new Date(p.ano, p.mes0, p.dia);
  renderCalendario();
  renderAgendaLateral(isoD);

  const servicos = doDia(isoD);
  const estado = estadoDaData(isoD, HOJE, servicos);
  const acoes = acoesPara(estado);
  const passado = estado.tipo === 'vazio-passado' || estado.tipo === 'preenchido-passado';

  const body = qs<HTMLElement>('#day-body');
  const foot = qs<HTMLElement>('#day-foot');
  const title = qs<HTMLElement>('#day-title');
  if (!body || !foot || !title) return;

  title.textContent = rotuloData(isoD);
  body.innerHTML = '';

  if (passado) {
    body.appendChild(h('div', 'past-note', `${I.clock}<div>Data no passado — os serviços podem ser <b>atualizados</b> ou <b>removidos</b>, mas não é possível criar novos.</div>`));
  }

  if (servicos.length === 0) {
    body.appendChild(
      h('div', 'day-empty', `${I.cal}<p>${passado ? 'Nenhum serviço registrado neste dia.' : 'Nenhum serviço agendado.<br>Adicione o primeiro serviço deste dia.'}</p>`),
    );
  } else {
    const emConflito = new Set<string>();
    for (const c of conflitosNoDia(servicos)) {
      emConflito.add(c.a.id);
      emConflito.add(c.b.id);
    }
    const lista = h('div', 'daylist');
    for (const s of servicos) {
      const cls = statusCls(s.situacao);
      const row = h('div', 'daysvc' + (emConflito.has(s.id) ? ' conflita' : ''));
      row.setAttribute('data-id', s.id);
      const conflitoTag = emConflito.has(s.id) ? `<span class="apt-b cancel">${I.alert} Conflito</span>` : '';
      const podeFinalizar = acoes.podeEditar && s.situacao !== 'concluido' && s.situacao !== 'cancelado';
      row.innerHTML =
        `<div class="dsvc-time"><b>${s.inicio}</b><small>${formatarDuracao(s.duracaoMin)}</small></div>` +
        `<div class="dsvc-main"><div class="dsvc-top"><b>${s.titulo}</b><span class="apt-b ${cls}">${statusLabel(s.situacao)}</span>${conflitoTag}</div>` +
        `<div class="dsvc-sub">${I.pin} ${s.cliente} · ${s.tecnico}</div>` +
        `<div class="dsvc-val">${formatarBRL(s.valorCentavos)}</div></div>` +
        `<div class="dsvc-acts">${podeFinalizar ? `<button class="mini-act done" data-act="fin" title="Finalizar serviço">${I.check}</button>` : ''}${acoes.podeEditar ? `<button class="mini-act" data-act="edit" title="Editar">${I.pencil}</button>` : ''}${acoes.podeRemover ? `<button class="mini-act danger" data-act="del" title="Remover">${I.trash}</button>` : ''}</div>`;
      lista.appendChild(row);
    }
    body.appendChild(lista);
  }

  foot.innerHTML = '';
  if (acoes.podeCriar) {
    const btn = h('button', 'btn btn-primary', `${I.plus} Novo serviço`);
    btn.addEventListener('click', () => abrirForm('criar', isoD));
    foot.appendChild(btn);
  } else {
    const btn = h('button', 'btn btn-ghost', 'Fechar');
    btn.addEventListener('click', fecharTudo);
    foot.appendChild(btn);
  }

  // Ações por linha
  body.querySelectorAll<HTMLElement>('.daysvc').forEach((row) => {
    const id = row.getAttribute('data-id')!;
    row.querySelectorAll<HTMLElement>('.mini-act').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const act = b.getAttribute('data-act');
        if (act === 'edit') abrirForm('editar', isoD, buscar(id));
        else if (act === 'del') void removerServico(id, isoD);
        else if (act === 'fin') void finalizarServico(id, isoD);
      });
    });
  });

  document.body.classList.remove('form-open');
  document.body.classList.add('day-open');
}

/** Finaliza um serviço (API): marca concluído; o servidor gera o dia trabalhado. */
async function finalizarServico(id: string, isoD: string): Promise<void> {
  const r = await apiConcluirServico(id);
  if (!r.ok) { toast('Não foi possível concluir o serviço'); return; }
  await carregarServicos();
  renderCalendario();
  abrirDia(isoD);
  toast(r.temJornada ? `Dia de trabalho de ${r.tecnico} registrado` : 'Serviço concluído');
}

/** Remove um serviço (API): o servidor apaga também a jornada gerada por ele. */
async function removerServico(id: string, isoD: string): Promise<void> {
  await apiRemoverServico(id);
  await carregarServicos();
  renderCalendario();
  abrirDia(isoD);
}

// ------------------------------------------------------------------
// Formulário (criar / editar) com conflito ao vivo
// ------------------------------------------------------------------
let formCtx: { modo: 'criar' | 'editar'; iso: string; id?: string; forcar: boolean } = { modo: 'criar', iso: HOJE, forcar: false };

function sugestaoInicio(iso: string): string {
  const lista = doDia(iso);
  if (lista.length === 0) return '09:00';
  const ultimoFim = Math.max(...lista.map((s) => minutosDoDia(s.inicio) + s.duracaoMin));
  return horaDeMinutos(Math.min(ultimoFim, 23 * 60));
}

function abrirForm(modo: 'criar' | 'editar', iso: string, servico?: Servico): void {
  formCtx = { modo, iso, forcar: false };
  if (servico) formCtx.id = servico.id;

  const titulo = qs<HTMLElement>('#form-title');
  if (titulo) titulo.textContent = modo === 'criar' ? 'Novo agendamento' : 'Editar agendamento';

  const val = (sel: string) => qs<HTMLInputElement>(sel)!;
  qs<HTMLElement>('#f-data')!.firstChild!.nodeValue = rotuloData(iso) + ' ';
  qs<HTMLElement>('#f-data')!.setAttribute('data-iso', iso);

  val('#f-titulo').value = servico?.titulo ?? '';
  val('#f-cliente').value = servico?.cliente ?? '';
  val('#f-inicio').value = servico?.inicio ?? sugestaoInicio(iso);
  qs<HTMLSelectElement>('#f-duracao')!.value = String(servico?.duracaoMin ?? 120);
  qs<HTMLSelectElement>('#f-tecnico')!.value = servico?.tecnico ?? TECNICOS[0]!;
  val('#f-valor').value = servico ? formatarBRL(servico.valorCentavos).replace('R$ ', '') : '';
  setSituacao(servico?.situacao === 'pendente' ? 'pendente' : 'confirmado');

  // Botão remover apenas na edição
  const del = qs<HTMLButtonElement>('#f-del')!;
  del.style.display = modo === 'editar' ? '' : 'none';

  atualizarConflito();
  document.body.classList.remove('day-open');
  document.body.classList.add('form-open');
}

function setSituacao(s: 'confirmado' | 'pendente'): void {
  qs<HTMLElement>('#f-sit-ok')!.classList.toggle('on', s === 'confirmado');
  qs<HTMLElement>('#f-sit-wait')!.classList.toggle('on', s === 'pendente');
  qs<HTMLElement>('#m-form')!.setAttribute('data-sit', s);
}
function getSituacao(): Situacao {
  return (qs<HTMLElement>('#m-form')!.getAttribute('data-sit') as Situacao) ?? 'confirmado';
}

function lerForm(): NovoServico {
  return {
    data: qs<HTMLElement>('#f-data')!.getAttribute('data-iso')!,
    titulo: qs<HTMLInputElement>('#f-titulo')!.value,
    cliente: qs<HTMLInputElement>('#f-cliente')!.value,
    inicio: qs<HTMLInputElement>('#f-inicio')!.value,
    duracaoMin: Number(qs<HTMLSelectElement>('#f-duracao')!.value),
    tecnico: qs<HTMLSelectElement>('#f-tecnico')!.value,
    valorCentavos: parseCentavosBR(qs<HTMLInputElement>('#f-valor')!.value),
    situacao: getSituacao(),
  };
}

function atualizarConflito(): void {
  const banner = qs<HTMLElement>('#f-conflito')!;
  const inicio = qs<HTMLInputElement>('#f-inicio')!.value;
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(inicio)) {
    banner.style.display = 'none';
    return;
  }
  const iso = qs<HTMLElement>('#f-data')!.getAttribute('data-iso')!;
  const candidato = { data: iso, inicio, duracaoMin: Number(qs<HTMLSelectElement>('#f-duracao')!.value), situacao: getSituacao() };
  const conflitos = conflitosDoCandidato(
    formCtx.id ? { ...candidato, id: formCtx.id } : candidato,
    doDia(iso),
  );
  if (conflitos.length === 0) {
    banner.style.display = 'none';
    formCtx.forcar = false;
    return;
  }
  const lista = conflitos.map((c) => `${c.inicio}–${horaDeMinutos(minutosDoDia(c.inicio) + c.duracaoMin)} · ${c.titulo}`).join('<br>');
  banner.style.display = 'flex';
  banner.innerHTML =
    `<span class="cf-ic">${I.alert}</span><div class="cf-txt"><b>Conflito de horário</b><small>Sobrepõe: ${lista}</small></div>` +
    `<button class="cf-force" id="f-force">Agendar mesmo assim</button>`;
  qs<HTMLElement>('#f-force')!.addEventListener('click', () => {
    formCtx.forcar = true;
    void salvar();
  });
}

async function salvar(): Promise<void> {
  const dados = lerForm();
  const v = validarServico(dados);
  const erroBox = qs<HTMLElement>('#f-erros')!;
  if (!v.ok) {
    erroBox.style.display = 'block';
    erroBox.textContent = v.erros.join(' ');
    return;
  }
  erroBox.style.display = 'none';

  const r = await apiSalvarServico(dados, formCtx.forcar, formCtx.modo === 'editar' ? formCtx.id : undefined);
  if (!r.ok) {
    if (r.status === 409) { atualizarConflito(); return; } // conflito não forçado — banner ao vivo avisa
    erroBox.style.display = 'block';
    erroBox.textContent = (r.erros && r.erros.join(' ')) || 'Não foi possível salvar.';
    return;
  }
  await carregarServicos();
  renderCalendario();
  abrirDia(formCtx.iso); // volta ao painel do dia atualizado
  toast(formCtx.modo === 'criar' ? 'Serviço agendado com sucesso' : 'Agendamento atualizado');
}

function toast(msg: string): void {
  const t = qs<HTMLElement>('#ag-toast');
  if (!t) return;
  t.querySelector('span')!.textContent = msg;
  document.body.classList.add('toast-open');
  window.setTimeout(() => document.body.classList.remove('toast-open'), 2600);
}

function fecharTudo(): void {
  document.body.classList.remove('day-open', 'form-open');
}

// ------------------------------------------------------------------
// Montagem dos modais (uma vez)
// ------------------------------------------------------------------
function montarModais(): void {
  const dur = DURACOES.map((d) => `<option value="${d}">${formatarDuracao(d)}</option>`).join('');
  const tec = TECNICOS.map((t) => `<option value="${t}">${t}</option>`).join('');

  const wrap = h('div', '');
  wrap.innerHTML = `
  <div class="modal-wrap" id="m-day"><div class="modal">
    <div class="modal-head"><h3 id="day-title">Dia</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body" id="day-body"></div>
    <div class="modal-foot" id="day-foot"></div>
  </div></div>

  <div class="modal-wrap" id="m-form"><div class="modal modal-lg" data-sit="confirmado">
    <div class="modal-head"><h3 id="form-title">Novo agendamento</h3><button class="mclose" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div id="f-conflito" class="cf-banner" style="display:none"></div>
      <div id="f-erros" class="f-erros" style="display:none"></div>
      <label class="fl">Data e horário</label>
      <div class="form-grid">
        <div class="field"><label>Data</label><div class="sel" id="f-data" data-iso="">Data ${I.cal}</div></div>
        <div class="field"><label>Início</label><input class="inp" id="f-inicio" placeholder="09:00" maxlength="5"></div>
      </div>
      <div class="field span2"><label>Serviço</label><input class="inp" id="f-titulo" placeholder="Ex.: Instalação de painéis solares"></div>
      <div class="form-grid">
        <div class="field"><label>Cliente</label><input class="inp" id="f-cliente" placeholder="Nome do cliente"></div>
        <div class="field"><label>Duração</label><div class="selwrap">${I.chev}<select class="sel selnat" id="f-duracao">${dur}</select></div></div>
        <div class="field"><label>Técnico responsável</label><div class="selwrap">${I.chev}<select class="sel selnat" id="f-tecnico">${tec}</select></div></div>
        <div class="field"><label>Valor estimado</label><div class="money-input sm"><span>R$</span><input id="f-valor" placeholder="0,00"></div></div>
      </div>
      <label class="fl">Situação</label>
      <div class="seg"><button class="seg-btn okc on" id="f-sit-ok">${I.check} Confirmado</button><button class="seg-btn waitc" id="f-sit-wait">${I.clock} Pendente</button></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost danger" id="f-del">${I.trash} Remover</button>
      <button class="btn btn-ghost" data-close>Cancelar</button>
      <button class="btn btn-primary" id="f-salvar">${I.check} Salvar</button>
    </div>
  </div></div>

  <div class="toast" id="ag-toast">${I.check}<span>Salvo</span></div>`;
  document.body.appendChild(wrap);

  // fechar
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', fecharTudo));
  qs<HTMLElement>('#m-day')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) fecharTudo(); });
  qs<HTMLElement>('#m-form')!.addEventListener('click', (e) => { if (e.target === e.currentTarget) fecharTudo(); });

  // form handlers
  qs<HTMLInputElement>('#f-inicio')!.addEventListener('input', atualizarConflito);
  qs<HTMLSelectElement>('#f-duracao')!.addEventListener('change', atualizarConflito);
  qs<HTMLElement>('#f-sit-ok')!.addEventListener('click', () => { setSituacao('confirmado'); atualizarConflito(); });
  qs<HTMLElement>('#f-sit-wait')!.addEventListener('click', () => { setSituacao('pendente'); atualizarConflito(); });
  qs<HTMLButtonElement>('#f-salvar')!.addEventListener('click', () => { void salvar(); });
  qs<HTMLButtonElement>('#f-del')!.addEventListener('click', () => {
    if (formCtx.id) void removerServico(formCtx.id, formCtx.iso);
  });
}

// ------------------------------------------------------------------
// Toggle de visualização (Semana / Mês) + default responsivo
// ------------------------------------------------------------------
function montarToggle(): void {
  const card = qs<HTMLElement>('.cal-card');
  if (!card) return;
  let escolheu = false;
  const setView = (v: string) => {
    card.setAttribute('data-view', v);
    card.querySelectorAll<HTMLElement>('.cv-btn').forEach((b) => b.classList.toggle('on', b.getAttribute('data-v') === v));
  };
  const auto = () => { if (!escolheu) setView(window.matchMedia('(min-width:960px)').matches ? 'month' : 'week'); };
  card.querySelectorAll<HTMLElement>('.cv-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      escolheu = true;
      const v = btn.getAttribute('data-v')!;
      if (v === 'week') semanaRef = new Date(partesDoIso(diaSelecionado).ano, partesDoIso(diaSelecionado).mes0, partesDoIso(diaSelecionado).dia);
      setView(v);
      renderCalendario();
    });
  });
  auto();
  window.addEventListener('resize', auto);
}

/** Liga as setas ‹ › de navegação (mês na visão Mês, semana na visão Semana). */
function montarSetas(): void {
  const setas = document.querySelectorAll<HTMLElement>('.agtools .icon-btn.sm');
  setas[0]?.addEventListener('click', () => navegar(-1));
  setas[1]?.addEventListener('click', () => navegar(1));
}

// ------------------------------------------------------------------
// Painel/dashboard AO VIVO (VA) — derivado do store (dados reais), atualiza
// no auto-refresh sem tocar no calendário/CRUD nem no estado selecionado.
// ------------------------------------------------------------------
type ApexInst = { render(): void; updateSeries(s: unknown, animate?: boolean): void; updateOptions(o: unknown): void };
type ApexCtor = new (el: Element, opts: Record<string, unknown>) => ApexInst;
let chDias: ApexInst | null = null;
let chSit: ApexInst | null = null;
function apex(): ApexCtor | undefined { return (window as unknown as { ApexCharts?: ApexCtor }).ApexCharts; }
function vis(el: Element | null): boolean { return !!el && (el as HTMLElement).clientWidth > 4; }
function ativos(): Servico[] { return todos().filter((s) => s.situacao !== 'cancelado'); }
function somaValor(arr: Servico[]): number { return arr.reduce((a, s) => a + s.valorCentavos, 0); }
function milK(centavos: number): string { const r = centavos / 100; return r >= 1000 ? 'R$ ' + (r / 1000).toFixed(1).replace('.', ',') + ' mil' : formatarBRL(centavos); }
function semanaDeHoje(): { ini: string; fim: string } {
  const p = partesDoIso(HOJE); const d = new Date(p.ano, p.mes0, p.dia);
  const dom = new Date(d); dom.setDate(d.getDate() - d.getDay());
  const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
  return { ini: iso(dom.getFullYear(), dom.getMonth(), dom.getDate()), fim: iso(sab.getFullYear(), sab.getMonth(), sab.getDate()) };
}
const AXIS = { colors: '#6b7385', fontSize: '11px', fontWeight: 600 };

function renderAgStats(): void {
  const el = qs<HTMLElement>('#ag-stats'); if (!el) return;
  const hoje = doDia(HOJE).filter((s) => s.situacao !== 'cancelado');
  const wk = semanaDeHoje();
  const semana = ativos().filter((s) => s.data >= wk.ini && s.data <= wk.fim);
  const pend = ativos().filter((s) => s.situacao === 'pendente');
  el.innerHTML =
    `<div class="ag-stat card"><span class="si blue">${I.calday}</span><div class="ag-info"><b>${hoje.length}</b><small>Hoje</small></div><span class="ag-sub">${formatarBRL(somaValor(hoje))}</span></div>` +
    `<div class="ag-stat card"><span class="si acc">${I.cal}</span><div class="ag-info"><b>${semana.length}</b><small>Esta semana</small></div><span class="ag-sub">${formatarBRL(somaValor(semana))}</span></div>` +
    `<div class="ag-stat card"><span class="si amber">${I.clock}</span><div class="ag-info"><b>${pend.length}</b><small>Pendentes</small></div><span class="ag-sub">${formatarBRL(somaValor(pend))}</span></div>`;
}

function renderDash(): void {
  const all = ativos();
  const total = all.length;
  const conf = all.filter((s) => s.situacao === 'confirmado').length;
  const pend = all.filter((s) => s.situacao === 'pendente').length;
  const done = all.filter((s) => s.situacao === 'concluido').length;
  const receita = somaValor(all);
  const recConf = somaValor(all.filter((s) => s.situacao === 'confirmado' || s.situacao === 'concluido'));
  const taxa = total > 0 ? Math.round((conf / total) * 100) : 0;
  const durMedia = total > 0 ? Math.round(all.reduce((a, s) => a + s.duracaoMin, 0) / total) : 0;
  const k = qs<HTMLElement>('#ag-kpis');
  if (k) k.innerHTML =
    `<div class="dk card"><div class="dk-top"><span class="dk-ic blue">${I.calday}</span>Serviços</div><div class="dk-v">${total}</div><div class="dk-s">no total agendado</div></div>` +
    `<div class="dk card"><div class="dk-top"><span class="dk-ic green">${I.wallet}</span>Receita agendada</div><div class="dk-v">${milK(receita)}</div><div class="dk-s">${receita > 0 ? Math.round((recConf / receita) * 100) : 0}% confirmada</div></div>` +
    `<div class="dk card"><div class="dk-top"><span class="dk-ic orange">${I.check}</span>Taxa de confirmação</div><div class="dk-v">${taxa}%</div><div class="dk-s">${conf} de ${total} serviços</div></div>` +
    `<div class="dk card"><div class="dk-top"><span class="dk-ic amber">${I.clock}</span>Duração média</div><div class="dk-v">${formatarDuracao(durMedia)}</div><div class="dk-s">por serviço</div></div>`;

  const A = apex(); if (!A) return;
  // barras: serviços por dia da semana (Seg..Dom)
  const dias = [0, 0, 0, 0, 0, 0, 0];
  for (const s of all) { const idx = (diaDaSemanaIso(s.data) + 6) % 7; dias[idx] = (dias[idx] ?? 0) + 1; }
  const dEl = qs<HTMLElement>('#ch-dias');
  const dSeries = [{ name: 'Serviços', data: dias }];
  if (chDias) chDias.updateSeries(dSeries);
  else if (vis(dEl)) {
    chDias = new A(dEl!, {
      chart: { type: 'bar', height: 190, toolbar: { show: false }, background: 'transparent', fontFamily: 'Inter, sans-serif', parentHeightOffset: 0 },
      series: dSeries, colors: ['#ef6300'],
      plotOptions: { bar: { columnWidth: '44%', borderRadius: 6, borderRadiusApplication: 'end' } },
      dataLabels: { enabled: false }, stroke: { width: 0 }, fill: { type: 'solid', opacity: 1 },
      grid: { show: false, padding: { left: 6, right: 6, top: 0, bottom: 0 } },
      xaxis: { categories: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: AXIS } },
      yaxis: { show: false }, tooltip: { theme: 'dark', y: { formatter: (v: number) => `${v} ${v === 1 ? 'serviço' : 'serviços'}` } }, legend: { show: false },
    });
    chDias.render();
  }
  // donut: situação (confirmado/pendente/concluído — só os com contagem)
  const sitDefs: [string, number, string][] = [['Confirmado', conf, '#34d399'], ['Pendente', pend, '#fbbf24'], ['Concluído', done, '#5b8def']];
  const sit = sitDefs.filter((x) => x[1] > 0);
  const sEl = qs<HTMLElement>('#ch-sit');
  const sOpts = {
    chart: { type: 'donut', height: 200, background: 'transparent', fontFamily: 'Inter, sans-serif' },
    series: sit.map((x) => x[1]), labels: sit.map((x) => x[0]), colors: sit.map((x) => x[2]), stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: '70%', labels: { show: true, name: { fontSize: '11px', color: '#98a1b3' }, value: { fontSize: '23px', fontFamily: 'Sora, sans-serif', fontWeight: 800, color: '#fff' }, total: { show: true, label: 'Total', fontSize: '11px', color: '#98a1b3', formatter: () => String(total) } } } } },
    dataLabels: { enabled: false },
    legend: { position: 'bottom', labels: { colors: '#98a1b3' }, fontSize: '12px', fontWeight: 600, markers: { radius: 9 }, itemMargin: { horizontal: 8 } },
    tooltip: { theme: 'dark', y: { formatter: (v: number) => `${v} serviços` } },
  };
  if (chSit) chSit.updateOptions(sOpts);
  else if (vis(sEl)) { chSit = new A(sEl!, sOpts); chSit.render(); }
  // receita por técnico (rbars)
  const porTec = new Map<string, number>();
  for (const s of all) porTec.set(s.tecnico, (porTec.get(s.tecnico) ?? 0) + s.valorCentavos);
  const tecs = [...porTec.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...tecs.map((t) => t[1]), 1);
  const cores = ['o', 'b', 'g', 'v', 'n'];
  const rt = qs<HTMLElement>('#ag-receita-tec');
  if (rt) rt.innerHTML = tecs.length
    ? tecs.map(([nome, v], i) => `<div class="rbar"><span class="rb-l">${nome}</span><div class="rb-track"><div class="rb-fill ${cores[i % cores.length]}" style="width:${Math.round((v / max) * 100)}%"></div></div><span class="rb-v">${formatarBRL(v)}</span></div>`).join('')
    : `<div class="dp-sub">Sem receita agendada.</div>`;
}

function refreshAll(): void {
  renderCalendario();
  renderAgendaLateral(diaSelecionado);
  renderAgStats();
  renderDash();
}
/** Recarrega os serviços da API e re-renderiza, preservando o estado do calendário. */
async function refreshLive(): Promise<void> {
  await carregarServicos();
  refreshAll();
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
async function boot(): Promise<void> {
  montarModais();
  montarToggle();
  montarSetas();
  await Promise.all([carregarServicos(), carregarFuncionarios()]);
  renderCalendario();
  renderAgendaLateral(HOJE);
  renderAgStats();
  renderDash();

  const nb = qs<HTMLElement>('#btn-novo-ag');
  if (nb) nb.addEventListener('click', () => abrirDia(diaSelecionado));

  // tempo real por SSE: cada escrita no banco dispara `jc:mudou` (via enhance.web.js)
  // → recarrega da API na hora, preservando dia/mês/semana e modais abertos.
  window.addEventListener('jc:mudou', () => { void refreshLive(); });
  // rede de segurança: se o stream cair, um poll lento mantém a sincronia (igual às demais telas).
  window.setInterval(() => { void refreshLive(); }, 60000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else void boot();
