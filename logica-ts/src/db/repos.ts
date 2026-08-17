/**
 * Repositórios (persistência em Postgres via Drizzle).
 * -------------------------------------------------------------
 * Substituem os stores em memória (AgendaStore / DiasTrabalhadosStore)
 * SEM reescrever a regra de negócio: a validação, a checagem de conflito
 * e a regra "serviço concluído + colaborador → jornada" continuam vindo
 * das funções puras já testadas de `agendamentos.ts` / `jornadas.ts`.
 * Aqui só acrescentamos o I/O (ler/gravar no banco).
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from './client.ts';
import {
  agendamentos,
  jornadas,
  documentos,
  obrigacoesFiscais,
  movimentacoes,
  projetos,
  notificacoesEstado,
  projetoSnapshots,
  type AgendamentoRow,
  type JornadaRow,
  type DocumentoRow,
  type ObrigacaoFiscalRow,
  type MovimentacaoRow,
  type ProjetoRow,
} from './schema.ts';
import {
  validarServico,
  conflitosDoCandidato,
  minutosDoDia,
  type Servico,
  type Situacao,
  type NovoServico,
  type PatchServico,
  type ResultadoCrud,
  type OpcoesGravacao,
} from '../agendamentos.ts';
import {
  jornadaDeServico,
  DiasTrabalhadosStore,
  type Jornada,
  type NovaJornada,
  type ResumoFuncionario,
} from '../jornadas.ts';
import {
  validarDocumento,
  documentosAVencer,
  type Documento,
  type NovoDocumento,
  type TipoDocumento,
  type VinculoTipo,
  type SituacaoManual,
} from '../documentos.ts';
import {
  statusObrigacao,
  resumoFiscal,
  validarObrigacao,
  type ObrigacaoFiscal,
  type NovaObrigacao,
  type TipoImposto,
  type StatusObrigacao,
  type ResumoFiscal,
} from '../fiscal.ts';
import {
  validarMovimentacao,
  resumoMovimentacoes,
  type Movimentacao,
  type NovaMovimentacao,
  type PatchMovimentacao,
  type TipoMov,
  type FormaPagamento,
  type SituacaoMov,
  type ResumoMov,
} from '../movimentacoes.ts';
import {
  validarProjeto,
  resumoProjeto,
  type Projeto,
  type NovoProjeto,
  type PatchProjeto,
  type TipoProjeto,
  type StatusProjeto,
  type ResumoProjeto,
} from '../projetos.ts';

/**
 * Data de "hoje" ('YYYY-MM-DD') no fuso da empresa (America/Sao_Paulo).
 * Usar o fuso local — e não UTC — evita "virar o dia" à noite e classificar
 * um vencimento como vencido um dia antes da hora.
 */
export function hojeISO(): string {
  // Override opcional (demo/testes): APP_HOJE=YYYY-MM-DD ancora o "hoje" do sistema.
  // Em produção, deixe sem definir → usa a data real (America/Sao_Paulo).
  const override = process.env.APP_HOJE;
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/**
 * Data e HORA reais agora, no fuso America/Sao_Paulo → 'YYYY-MM-DDTHH:MM'.
 * Usada para comparar registros de agendamento com o momento atual (ex.: faltam ≤24h).
 * Aceita override APP_AGORA=YYYY-MM-DDTHH:MM (demo/testes); senão usa o relógio real.
 */
export function agoraISO(): string {
  const ov = process.env.APP_AGORA;
  if (ov && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ov)) return ov.slice(0, 16);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string): string => (parts.find((p) => p.type === t)?.value ?? '00');
  return `${g('year')}-${g('month')}-${g('day')}T${(g('hour') === '24' ? '00' : g('hour'))}:${g('minute')}`;
}

// ------------------------------------------------------------------
// Mapeadores linha do banco <-> tipo de domínio
// ------------------------------------------------------------------

/** Linha do banco → Servico. `obs` null vira ausente (exactOptionalPropertyTypes). */
function toServico(r: AgendamentoRow): Servico {
  const s: Servico = {
    id: r.id,
    data: r.data,
    titulo: r.titulo,
    cliente: r.cliente,
    inicio: r.inicio,
    duracaoMin: r.duracaoMin,
    tecnico: r.tecnico,
    valorCentavos: r.valorCentavos,
    situacao: r.situacao as Situacao,
  };
  if (r.obs != null) s.obs = r.obs;
  if (r.projetoId != null) s.projetoId = r.projetoId;
  return s;
}

/** Servico → valores para inserir/atualizar (obs undefined vira null no banco). */
function toRow(s: Servico): AgendamentoRow {
  return {
    id: s.id,
    data: s.data,
    titulo: s.titulo,
    cliente: s.cliente,
    inicio: s.inicio,
    duracaoMin: s.duracaoMin,
    tecnico: s.tecnico,
    valorCentavos: s.valorCentavos,
    situacao: s.situacao,
    obs: s.obs ?? null,
    projetoId: s.projetoId ?? null,
  };
}

function toJornada(r: JornadaRow): Jornada {
  return {
    id: r.id,
    origemId: r.origemId,
    funcionario: r.funcionario,
    data: r.data,
    servico: r.servico,
    cliente: r.cliente,
    duracaoMin: r.duracaoMin,
    pago: r.pago,
  };
}

// ------------------------------------------------------------------
// Repositório de Agendamentos
// ------------------------------------------------------------------

/** Próximo id no padrão ag_N, a partir do maior sufixo numérico existente. */
async function proximoIdAgenda(): Promise<string> {
  const rows = await db.select({ id: agendamentos.id }).from(agendamentos);
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.id.replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `ag_${max + 1}`;
}

/**
 * Resolve o id da obra a partir do NOME do cliente. É assim que o vínculo passa
 * a ser estável: guardamos o id (não o texto), então renomear o cliente/obra
 * depois não desfaz a ligação. Sem obra correspondente → undefined (item avulso).
 */
async function projetoIdPorCliente(cliente: string | undefined): Promise<string | undefined> {
  const nome = (cliente ?? '').trim();
  if (!nome) return undefined;
  const [p] = await db.select({ id: projetos.id }).from(projetos).where(eq(projetos.cliente, nome)).limit(1);
  return p?.id;
}

export const agendaRepo = {
  async todos(): Promise<Servico[]> {
    const rows = await db.select().from(agendamentos);
    return rows
      .map(toServico)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : minutosDoDia(a.inicio) - minutosDoDia(b.inicio)));
  },

  /** Serviços de um dia, ordenados por horário (mesma ordem do AgendaStore). */
  async doDia(data: string): Promise<Servico[]> {
    const rows = await db.select().from(agendamentos).where(eq(agendamentos.data, data));
    return rows.map(toServico).sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio));
  },

  async buscar(id: string): Promise<Servico | undefined> {
    const [row] = await db.select().from(agendamentos).where(eq(agendamentos.id, id));
    return row ? toServico(row) : undefined;
  },

  /** Cria um serviço. Valida e checa conflito (a menos que permitido) — regra pura. */
  async adicionar(novo: NovoServico, opts: OpcoesGravacao = {}): Promise<ResultadoCrud> {
    const v = validarServico(novo);
    if (!v.ok) return { ok: false, erros: v.erros, conflitos: [] };

    const conflitos = conflitosDoCandidato(
      { data: novo.data, inicio: novo.inicio, duracaoMin: novo.duracaoMin, situacao: novo.situacao },
      await this.doDia(novo.data),
    );
    if (conflitos.length > 0 && !opts.permitirConflito) {
      return { ok: false, erros: ['Conflito de horário com outro serviço.'], conflitos };
    }

    const servico: Servico = { ...novo, id: await proximoIdAgenda() };
    // vínculo estável: resolve a obra pelo nome do cliente e guarda o ID (se ainda não veio).
    if (servico.projetoId === undefined) {
      const pid = await projetoIdPorCliente(servico.cliente);
      if (pid) servico.projetoId = pid;
    }
    await db.insert(agendamentos).values(toRow(servico));
    return { ok: true, servico };
  },

  /** Atualiza um serviço. Mantém id; revalida e recheca conflito — regra pura. */
  async atualizar(id: string, patch: PatchServico, opts: OpcoesGravacao = {}): Promise<ResultadoCrud> {
    const atual = await this.buscar(id);
    if (!atual) return { ok: false, erros: ['Serviço não encontrado.'], conflitos: [] };

    const proposto: Servico = { ...atual, ...patch, id };

    const v = validarServico(proposto);
    if (!v.ok) return { ok: false, erros: v.erros, conflitos: [] };

    const conflitos = conflitosDoCandidato(
      { id, data: proposto.data, inicio: proposto.inicio, duracaoMin: proposto.duracaoMin, situacao: proposto.situacao },
      await this.doDia(proposto.data),
    );
    if (conflitos.length > 0 && !opts.permitirConflito) {
      return { ok: false, erros: ['Conflito de horário com outro serviço.'], conflitos };
    }

    await db.update(agendamentos).set(toRow(proposto)).where(eq(agendamentos.id, id));
    return { ok: true, servico: proposto };
  },

  /** Remove um serviço. Retorna true se removeu. */
  async remover(id: string): Promise<boolean> {
    const res = await db.delete(agendamentos).where(eq(agendamentos.id, id)).returning({ id: agendamentos.id });
    return res.length > 0;
  },

  /**
   * Regra de conclusão: marca como concluído e, se houver colaborador,
   * gera/persiste a jornada. Permite conflito (não recusa concluir).
   */
  async concluir(id: string): Promise<{ ok: true; servico: Servico; jornada: Jornada | null } | { ok: false }> {
    const r = await this.atualizar(id, { situacao: 'concluido' }, { permitirConflito: true });
    if (!r.ok) return { ok: false };
    const jornada = await diasRepo.registrarDeServico(r.servico);
    return { ok: true, servico: r.servico, jornada };
  },
};

// ------------------------------------------------------------------
// Repositório de Jornadas (dias trabalhados)
// ------------------------------------------------------------------

export const diasRepo = {
  async todas(): Promise<Jornada[]> {
    const rows = await db.select().from(jornadas);
    return rows.map(toJornada);
  },

  /**
   * Agrega por funcionário reutilizando a lógica pura testada:
   * carrega as linhas do banco num DiasTrabalhadosStore só para agregar.
   */
  async porFuncionario(): Promise<ResumoFuncionario[]> {
    const rows = await db.select().from(jornadas);
    return new DiasTrabalhadosStore(rows.map(toJornada)).porFuncionario();
  },

  /** Registra a jornada de um serviço concluído (regra pura). Idempotente por origemId. */
  async registrarDeServico(s: Servico): Promise<Jornada | null> {
    const j = jornadaDeServico(s);
    if (!j) return null;
    const [existe] = await db.select({ id: jornadas.id }).from(jornadas).where(eq(jornadas.origemId, j.origemId));
    if (existe) return null; // já registrada
    await db.insert(jornadas).values(j);
    return j;
  },

  /** Marca uma jornada como paga / a pagar. */
  async marcarPago(id: string, pago: boolean): Promise<boolean> {
    const res = await db.update(jornadas).set({ pago }).where(eq(jornadas.id, id)).returning({ id: jornadas.id });
    return res.length > 0;
  },

  /** Lançamento manual de dia trabalhado (não vindo de um serviço). */
  async adicionarManual(nova: NovaJornada): Promise<{ ok: true; jornada: Jornada } | { ok: false; erros: string[] }> {
    const erros: string[] = [];
    if (!nova || typeof nova !== 'object') return { ok: false, erros: ['Dados inválidos.'] };
    if (!nova.funcionario || !String(nova.funcionario).trim()) erros.push('Informe o colaborador.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(nova.data ?? ''))) erros.push('Data inválida (use AAAA-MM-DD).');
    if (!nova.servico || !String(nova.servico).trim()) erros.push('Informe a atividade/serviço.');
    if (!Number.isFinite(Number(nova.duracaoMin)) || Number(nova.duracaoMin) <= 0) erros.push('Duração inválida.');
    if (erros.length) return { ok: false, erros };
    const id = `jm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const jornada: Jornada = {
      id, origemId: `manual_${id}`,
      funcionario: String(nova.funcionario).trim(), data: String(nova.data),
      servico: String(nova.servico).trim(), cliente: String(nova.cliente ?? '—').trim() || '—',
      duracaoMin: Number(nova.duracaoMin), pago: !!nova.pago,
    };
    await db.insert(jornadas).values(jornada);
    return { ok: true, jornada };
  },

  /** Remove uma jornada pelo id. */
  async remover(id: string): Promise<boolean> {
    const res = await db.delete(jornadas).where(eq(jornadas.id, id)).returning({ id: jornadas.id });
    return res.length > 0;
  },

  /** Remove a jornada gerada por um serviço (ex.: serviço removido). */
  async removerPorOrigem(origemId: string): Promise<boolean> {
    const res = await db.delete(jornadas).where(eq(jornadas.origemId, origemId)).returning({ id: jornadas.id });
    return res.length > 0;
  },
};

// ------------------------------------------------------------------
// Repositório de Documentos (central de documentos + upload)
// ------------------------------------------------------------------

function toDocumento(r: DocumentoRow): Documento {
  const d: Documento = {
    id: r.id,
    tipo: r.tipo as TipoDocumento,
    titulo: r.titulo,
    vinculoTipo: r.vinculoTipo as VinculoTipo,
    criadoEm: r.criadoEm,
  };
  if (r.arquivo != null) d.arquivo = r.arquivo;
  if (r.formato != null) d.formato = r.formato;
  if (r.tamanhoBytes != null) d.tamanhoBytes = r.tamanhoBytes;
  if (r.vinculoId != null) d.vinculoId = r.vinculoId;
  if (r.vinculoLabel != null) d.vinculoLabel = r.vinculoLabel;
  if (r.emissao != null) d.emissao = r.emissao;
  if (r.vencimento != null) d.vencimento = r.vencimento;
  if (r.valorCentavos != null) d.valorCentavos = r.valorCentavos;
  if (r.situacao != null) d.situacao = r.situacao as SituacaoManual;
  if (r.obs != null) d.obs = r.obs;
  if (r.projetoId != null) d.projetoId = r.projetoId;
  return d;
}

function toDocRow(d: Documento): DocumentoRow {
  return {
    id: d.id,
    tipo: d.tipo,
    titulo: d.titulo,
    arquivo: d.arquivo ?? null,
    formato: d.formato ?? null,
    tamanhoBytes: d.tamanhoBytes ?? null,
    vinculoTipo: d.vinculoTipo,
    vinculoId: d.vinculoId ?? null,
    vinculoLabel: d.vinculoLabel ?? null,
    emissao: d.emissao ?? null,
    vencimento: d.vencimento ?? null,
    valorCentavos: d.valorCentavos ?? null,
    situacao: d.situacao ?? null,
    obs: d.obs ?? null,
    projetoId: d.projetoId ?? null,
    criadoEm: d.criadoEm,
  };
}

async function proximoId(prefixo: string, ids: readonly { id: string }[]): Promise<string> {
  let max = 0;
  for (const r of ids) {
    const n = Number.parseInt(r.id.replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefixo}${max + 1}`;
}

export interface FiltroDocumentos {
  readonly tipo?: TipoDocumento;
  readonly vinculoTipo?: VinculoTipo;
}

export type ResultadoDoc =
  | { readonly ok: true; readonly documento: Documento }
  | { readonly ok: false; readonly erros: string[] };

export const documentosRepo = {
  /** Lista documentos (mais recentes primeiro), com filtro opcional por tipo/vínculo. */
  async todos(filtro: FiltroDocumentos = {}): Promise<Documento[]> {
    const conds = [];
    if (filtro.tipo) conds.push(eq(documentos.tipo, filtro.tipo));
    if (filtro.vinculoTipo) conds.push(eq(documentos.vinculoTipo, filtro.vinculoTipo));
    const rows = conds.length
      ? await db.select().from(documentos).where(conds.length === 1 ? conds[0] : and(...conds))
      : await db.select().from(documentos);
    return rows.map(toDocumento).sort((a, b) => {
      if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? 1 : -1;
      // mesmo dia: desempata pelo sufixo numérico do id (doc_10 vem antes de doc_9)
      const na = Number.parseInt(a.id.replace(/\D/g, ''), 10);
      const nb = Number.parseInt(b.id.replace(/\D/g, ''), 10);
      return nb - na;
    });
  },

  async buscar(id: string): Promise<Documento | undefined> {
    const [row] = await db.select().from(documentos).where(eq(documentos.id, id));
    return row ? toDocumento(row) : undefined;
  },

  /** Cria um documento (valida com a regra pura). `criadoEm` = hoje. */
  async criar(novo: NovoDocumento): Promise<ResultadoDoc> {
    const v = validarDocumento(novo);
    if (!v.ok) return { ok: false, erros: v.erros };
    const ids = await db.select({ id: documentos.id }).from(documentos);
    const documento: Documento = { ...novo, id: await proximoId('doc_', ids), criadoEm: hojeISO() };
    // vínculo estável: resolve a obra pelo rótulo do vínculo e guarda o ID (se ainda não veio).
    if (documento.projetoId === undefined) {
      const pid = await projetoIdPorCliente(documento.vinculoLabel);
      if (pid) documento.projetoId = pid;
    }
    await db.insert(documentos).values(toDocRow(documento));
    return { ok: true, documento };
  },

  /** Remove um documento. Retorna true se removeu. */
  async remover(id: string): Promise<boolean> {
    const res = await db.delete(documentos).where(eq(documentos.id, id)).returning({ id: documentos.id });
    return res.length > 0;
  },

  /** Documentos que vencem nos próximos `dias` (regra pura), do mais urgente ao menos. */
  async aVencer(dias = 30): Promise<Documento[]> {
    const rows = await db.select().from(documentos);
    return documentosAVencer(rows.map(toDocumento), hojeISO(), dias);
  },
};

// ------------------------------------------------------------------
// Repositório Fiscal (guias de impostos / obrigações)
// ------------------------------------------------------------------

function toObrigacao(r: ObrigacaoFiscalRow): ObrigacaoFiscal {
  const o: ObrigacaoFiscal = {
    id: r.id,
    tipo: r.tipo as TipoImposto,
    descricao: r.descricao,
    competencia: r.competencia,
    vencimento: r.vencimento,
    valorCentavos: r.valorCentavos,
    pago: r.pago,
  };
  if (r.guiaDocId != null) o.guiaDocId = r.guiaDocId;
  return o;
}

export type ObrigacaoComStatus = ObrigacaoFiscal & { readonly status: StatusObrigacao };

export const fiscalRepo = {
  /** Obrigações do período, com o status calculado, ordenadas por vencimento. */
  async obrigacoes(): Promise<ObrigacaoComStatus[]> {
    const hoje = hojeISO();
    const rows = await db.select().from(obrigacoesFiscais);
    return rows
      .map(toObrigacao)
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0))
      .map((o) => ({ ...o, status: statusObrigacao(o, hoje) }));
  },

  /** Resumo do período (a pagar, vencido, pago e próxima a vencer). */
  async resumo(): Promise<ResumoFiscal> {
    const rows = await db.select().from(obrigacoesFiscais);
    return resumoFiscal(rows.map(toObrigacao), hojeISO());
  },

  /** Painel completo da aba Fiscal (obrigações + resumo). */
  async painel(): Promise<{ obrigacoes: ObrigacaoComStatus[]; resumo: ResumoFiscal }> {
    const [obrigacoes, resumo] = await Promise.all([this.obrigacoes(), this.resumo()]);
    return { obrigacoes, resumo };
  },

  /** Marca uma guia como paga / a pagar. */
  async marcarPago(id: string, pago: boolean): Promise<boolean> {
    const res = await db.update(obrigacoesFiscais).set({ pago }).where(eq(obrigacoesFiscais.id, id)).returning({ id: obrigacoesFiscais.id });
    return res.length > 0;
  },

  /** Cria uma guia (valida com a regra pura). */
  async criar(nova: NovaObrigacao): Promise<{ ok: true; obrigacao: ObrigacaoFiscal } | { ok: false; erros: string[] }> {
    const v = validarObrigacao(nova);
    if (!v.ok) return { ok: false, erros: v.erros };
    const ids = await db.select({ id: obrigacoesFiscais.id }).from(obrigacoesFiscais);
    const obrigacao: ObrigacaoFiscal = { ...nova, id: await proximoId('of_', ids) };
    await db.insert(obrigacoesFiscais).values({ ...obrigacao, guiaDocId: obrigacao.guiaDocId ?? null });
    return { ok: true, obrigacao };
  },
};

// ------------------------------------------------------------------
// Repositório de Movimentações (fluxo de caixa)
// ------------------------------------------------------------------

function toMov(r: MovimentacaoRow): Movimentacao {
  const m: Movimentacao = {
    id: r.id,
    data: r.data,
    descricao: r.descricao,
    categoria: r.categoria,
    tipo: r.tipo as TipoMov,
    forma: r.forma as FormaPagamento,
    valorCentavos: r.valorCentavos,
    situacao: r.situacao as SituacaoMov,
    recorrente: r.recorrente,
  };
  if (r.obs != null) m.obs = r.obs;
  if (r.projetoId != null) m.projetoId = r.projetoId;
  return m;
}
function toMovRow(m: Movimentacao): MovimentacaoRow {
  return {
    id: m.id,
    data: m.data,
    descricao: m.descricao,
    categoria: m.categoria,
    tipo: m.tipo,
    forma: m.forma,
    valorCentavos: m.valorCentavos,
    situacao: m.situacao,
    recorrente: m.recorrente,
    obs: m.obs ?? null,
    projetoId: m.projetoId ?? null,
  };
}

export interface FiltroMov {
  readonly tipo?: TipoMov;
  readonly situacao?: SituacaoMov;
  readonly de?: string; // 'YYYY-MM-DD' (>=)
  readonly ate?: string; // 'YYYY-MM-DD' (<=)
}

export type ResultadoMov =
  | { readonly ok: true; readonly movimentacao: Movimentacao }
  | { readonly ok: false; readonly erros: string[] };

async function listarMov(filtro: FiltroMov): Promise<Movimentacao[]> {
  const conds = [];
  if (filtro.tipo) conds.push(eq(movimentacoes.tipo, filtro.tipo));
  if (filtro.situacao) conds.push(eq(movimentacoes.situacao, filtro.situacao));
  if (filtro.de) conds.push(gte(movimentacoes.data, filtro.de));
  if (filtro.ate) conds.push(lte(movimentacoes.data, filtro.ate));
  const rows = conds.length
    ? await db.select().from(movimentacoes).where(conds.length === 1 ? conds[0] : and(...conds))
    : await db.select().from(movimentacoes);
  // mais recentes primeiro; empate por id (sufixo numérico) desc
  return rows.map(toMov).sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    const na = Number.parseInt(a.id.replace(/\D/g, ''), 10);
    const nb = Number.parseInt(b.id.replace(/\D/g, ''), 10);
    return nb - na;
  });
}

export const movimentacoesRepo = {
  todos(filtro: FiltroMov = {}): Promise<Movimentacao[]> {
    return listarMov(filtro);
  },

  async buscar(id: string): Promise<Movimentacao | undefined> {
    const [row] = await db.select().from(movimentacoes).where(eq(movimentacoes.id, id));
    return row ? toMov(row) : undefined;
  },

  /** Resumo do período (aplica o mesmo filtro da listagem). */
  async resumo(filtro: FiltroMov = {}): Promise<ResumoMov> {
    return resumoMovimentacoes(await listarMov(filtro));
  },

  /** Cria um lançamento (valida com a regra pura). */
  async criar(nova: NovaMovimentacao): Promise<ResultadoMov> {
    const v = validarMovimentacao(nova);
    if (!v.ok) return { ok: false, erros: v.erros };
    const ids = await db.select({ id: movimentacoes.id }).from(movimentacoes);
    const movimentacao: Movimentacao = { ...nova, id: await proximoId('mv_', ids) };
    await db.insert(movimentacoes).values(toMovRow(movimentacao));
    return { ok: true, movimentacao };
  },

  /** Cria vários de uma vez (usado pelo import de planilha). Retorna os válidos. */
  async criarVarios(novas: readonly NovaMovimentacao[]): Promise<{ criadas: Movimentacao[]; erros: number }> {
    const ids = await db.select({ id: movimentacoes.id }).from(movimentacoes);
    let seq = 0;
    for (const r of ids) {
      const n = Number.parseInt(r.id.replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > seq) seq = n;
    }
    const criadas: Movimentacao[] = [];
    let erros = 0;
    const linhas: MovimentacaoRow[] = [];
    for (const nova of novas) {
      if (!validarMovimentacao(nova).ok) { erros++; continue; }
      seq += 1;
      const m: Movimentacao = { ...nova, id: `mv_${seq}` };
      criadas.push(m);
      linhas.push(toMovRow(m));
    }
    if (linhas.length) await db.insert(movimentacoes).values(linhas);
    return { criadas, erros };
  },

  /** Atualiza um lançamento. Revalida o resultado proposto. */
  async atualizar(id: string, patch: PatchMovimentacao): Promise<ResultadoMov> {
    const atual = await this.buscar(id);
    if (!atual) return { ok: false, erros: ['Lançamento não encontrado.'] };
    const proposto: Movimentacao = { ...atual, ...patch, id };
    const v = validarMovimentacao(proposto);
    if (!v.ok) return { ok: false, erros: v.erros };
    await db.update(movimentacoes).set(toMovRow(proposto)).where(eq(movimentacoes.id, id));
    return { ok: true, movimentacao: proposto };
  },

  async remover(id: string): Promise<boolean> {
    const res = await db.delete(movimentacoes).where(eq(movimentacoes.id, id)).returning({ id: movimentacoes.id });
    return res.length > 0;
  },

  /** Movimentações vinculadas a uma obra. */
  async porProjeto(projetoId: string): Promise<Movimentacao[]> {
    const rows = await db.select().from(movimentacoes).where(eq(movimentacoes.projetoId, projetoId));
    return rows.map(toMov).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  },
};

// ------------------------------------------------------------------
// Repositório de Projetos (obras) — visão 360° da obra
// ------------------------------------------------------------------

function toProjeto(r: ProjetoRow): Projeto {
  const p: Projeto = {
    id: r.id,
    nome: r.nome,
    cliente: r.cliente,
    tipo: r.tipo as TipoProjeto,
    status: r.status as StatusProjeto,
    responsavel: r.responsavel,
    valorContratadoCentavos: r.valorContratadoCentavos,
    progresso: r.progresso,
    criadoEm: r.criadoEm,
  };
  if (r.endereco != null) p.endereco = r.endereco;
  if (r.inicio != null) p.inicio = r.inicio;
  if (r.previsao != null) p.previsao = r.previsao;
  if (r.obs != null) p.obs = r.obs;
  return p;
}

function toProjRow(p: Projeto): ProjetoRow {
  return {
    id: p.id,
    nome: p.nome,
    cliente: p.cliente,
    tipo: p.tipo,
    status: p.status,
    responsavel: p.responsavel,
    endereco: p.endereco ?? null,
    valorContratadoCentavos: p.valorContratadoCentavos,
    inicio: p.inicio ?? null,
    previsao: p.previsao ?? null,
    progresso: p.progresso,
    obs: p.obs ?? null,
    criadoEm: p.criadoEm,
  };
}

export interface ProjetoComResumo extends Projeto {
  readonly resumo: ResumoProjeto;
}

export interface ProjetoDetalhe {
  readonly projeto: Projeto;
  readonly resumo: ResumoProjeto;
  readonly agendamentos: Servico[];
  readonly documentos: Documento[];
  readonly movimentacoes: Movimentacao[];
}

export type ResultadoProjeto =
  | { readonly ok: true; readonly projeto: Projeto }
  | { readonly ok: false; readonly erros: string[] };

export const projetosRepo = {
  /** Lista projetos (mais recentes primeiro) já com o resumo financeiro de cada obra. */
  async todos(): Promise<ProjetoComResumo[]> {
    const [projRows, agRows, docRows, movRows] = await Promise.all([
      db.select().from(projetos),
      db.select().from(agendamentos),
      db.select().from(documentos),
      db.select().from(movimentacoes),
    ]);
    const ags = agRows.map(toServico);
    const docs = docRows.map(toDocumento);
    const movs = movRows.map(toMov);
    return projRows
      .map(toProjeto)
      .sort((a, b) => {
        if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? 1 : -1;
        const na = Number.parseInt(a.id.replace(/\D/g, ''), 10);
        const nb = Number.parseInt(b.id.replace(/\D/g, ''), 10);
        return nb - na;
      })
      .map((p) => ({
        ...p,
        resumo: resumoProjeto(p, {
          agendamentos: ags.filter((s) => s.projetoId === p.id),
          documentos: docs.filter((d) => d.projetoId === p.id),
          movimentacoes: movs.filter((m) => m.projetoId === p.id),
        }),
      }));
  },

  async buscar(id: string): Promise<Projeto | undefined> {
    const [row] = await db.select().from(projetos).where(eq(projetos.id, id));
    return row ? toProjeto(row) : undefined;
  },

  /** Visão 360° de uma obra: o projeto + agendamentos/documentos/movimentações + resumo. */
  async detalhe(id: string): Promise<ProjetoDetalhe | undefined> {
    const projeto = await this.buscar(id);
    if (!projeto) return undefined;
    const [todosAg, todosDoc, movv] = await Promise.all([
      agendaRepo.todos(),
      documentosRepo.todos(),
      movimentacoesRepo.porProjeto(id),
    ]);
    const agv = todosAg.filter((s) => s.projetoId === id);
    const docv = todosDoc.filter((d) => d.projetoId === id);
    return {
      projeto,
      resumo: resumoProjeto(projeto, { agendamentos: agv, documentos: docv, movimentacoes: movv }),
      agendamentos: agv,
      documentos: docv,
      movimentacoes: movv,
    };
  },

  /** Cria um projeto (valida com a regra pura). `criadoEm` = hoje. */
  async criar(nova: NovoProjeto): Promise<ResultadoProjeto> {
    const v = validarProjeto(nova);
    if (!v.ok) return { ok: false, erros: v.erros };
    const ids = await db.select({ id: projetos.id }).from(projetos);
    const projeto: Projeto = { ...nova, id: await proximoId('prj_', ids), criadoEm: hojeISO() };
    await db.insert(projetos).values(toProjRow(projeto));
    return { ok: true, projeto };
  },

  /** Atualiza um projeto. Revalida o resultado proposto. */
  async atualizar(id: string, patch: PatchProjeto): Promise<ResultadoProjeto> {
    const atual = await this.buscar(id);
    if (!atual) return { ok: false, erros: ['Projeto não encontrado.'] };
    const proposto: Projeto = { ...atual, ...patch, id, criadoEm: atual.criadoEm };
    const { id: _id, criadoEm: _criado, ...nova } = proposto;
    void _id; void _criado;
    const v = validarProjeto(nova);
    if (!v.ok) return { ok: false, erros: v.erros };
    await db.update(projetos).set(toProjRow(proposto)).where(eq(projetos.id, id));
    return { ok: true, projeto: proposto };
  },

  /** Remove um projeto. Desvincula agendamentos, documentos e movimentações da obra antes. */
  async remover(id: string): Promise<boolean> {
    await db.update(movimentacoes).set({ projetoId: null }).where(eq(movimentacoes.projetoId, id));
    await db.update(agendamentos).set({ projetoId: null }).where(eq(agendamentos.projetoId, id));
    await db.update(documentos).set({ projetoId: null }).where(eq(documentos.projetoId, id));
    const res = await db.delete(projetos).where(eq(projetos.id, id)).returning({ id: projetos.id });
    return res.length > 0;
  },
};

// ------------------------------------------------------------------
// Notificações — estado por usuário (lida / dispensada), persistente.
// ------------------------------------------------------------------
export interface EstadoNotifRepo { lida: boolean; dispensada: boolean; }

export const notificacoesRepo = {
  /** Mapa chave -> estado para um usuário. */
  async estados(usuarioId: string): Promise<Record<string, EstadoNotifRepo>> {
    const rows = await db.select().from(notificacoesEstado).where(eq(notificacoesEstado.usuarioId, usuarioId));
    const map: Record<string, EstadoNotifRepo> = {};
    for (const r of rows) map[r.chave] = { lida: !!r.lida, dispensada: !!r.dispensada };
    return map;
  },

  /** Upsert do estado de UMA notificação (marca lida e/ou dispensada). */
  async marcar(usuarioId: string, chave: string, patch: { lida?: boolean; dispensada?: boolean }): Promise<void> {
    const agora = new Date().toISOString();
    const set: { lida?: boolean; dispensada?: boolean; atualizadoEm: string } = { atualizadoEm: agora };
    if (patch.lida !== undefined) set.lida = patch.lida;
    if (patch.dispensada !== undefined) set.dispensada = patch.dispensada;
    await db.insert(notificacoesEstado)
      .values({ usuarioId, chave, lida: patch.lida ?? false, dispensada: patch.dispensada ?? false, atualizadoEm: agora })
      .onConflictDoUpdate({ target: [notificacoesEstado.usuarioId, notificacoesEstado.chave], set });
  },

  /** Marca várias chaves como lidas (usado por "marcar todas como lidas"). */
  async marcarTodasLidas(usuarioId: string, chaves: readonly string[]): Promise<number> {
    for (const chave of chaves) await this.marcar(usuarioId, chave, { lida: true });
    return chaves.length;
  },
};

// ------------------------------------------------------------------
// Snapshots das obras — histórico mensal (evolução de carteira/progresso).
// ------------------------------------------------------------------
export interface ObraSnapshot {
  mes: string; projetoId: string; nome: string; cliente: string; status: string;
  progresso: number; contratadoCentavos: number; recebidoCentavos: number; aReceberCentavos: number;
}

export const snapshotsRepo = {
  /** Todos os snapshots, ordenados por mês e projeto. */
  async todos(): Promise<ObraSnapshot[]> {
    const rows = await db.select().from(projetoSnapshots);
    return rows
      .map((r): ObraSnapshot => ({
        mes: r.mes, projetoId: r.projetoId, nome: r.nome, cliente: r.cliente, status: r.status,
        progresso: r.progresso, contratadoCentavos: r.contratadoCentavos,
        recebidoCentavos: r.recebidoCentavos, aReceberCentavos: r.aReceberCentavos,
      }))
      .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : a.projetoId.localeCompare(b.projetoId)));
  },

  /** Captura o retrato atual de TODAS as obras como o snapshot do mês (upsert). "Fechamento". */
  async capturar(mes: string): Promise<number> {
    const projs = await projetosRepo.todos();
    const criadoEm = new Date().toISOString();
    for (const p of projs) {
      const row = {
        mes, projetoId: p.id, nome: p.nome, cliente: p.cliente, status: p.status, progresso: p.progresso,
        contratadoCentavos: p.resumo.contratadoCentavos, recebidoCentavos: p.resumo.recebidoCentavos,
        aReceberCentavos: p.resumo.aReceberCentavos, criadoEm,
      };
      await db.insert(projetoSnapshots).values(row).onConflictDoUpdate({
        target: [projetoSnapshots.mes, projetoSnapshots.projetoId],
        set: {
          nome: row.nome, cliente: row.cliente, status: row.status, progresso: row.progresso,
          contratadoCentavos: row.contratadoCentavos, recebidoCentavos: row.recebidoCentavos,
          aReceberCentavos: row.aReceberCentavos, criadoEm,
        },
      });
    }
    return projs.length;
  },
};
