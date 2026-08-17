/**
 * Domínio de Agendamentos — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Lógica pura, sem dependências e sem I/O. Serve tanto para o
 * back-end (validar antes de gravar no Postgres) quanto para o
 * front-end (protótipo). Todo dinheiro é inteiro em centavos e
 * todo horário é inteiro em minutos — nada de float, sem margem
 * de erro de arredondamento.
 */

export type Situacao = 'confirmado' | 'pendente' | 'cancelado' | 'concluido';

export interface Servico {
  readonly id: string;
  data: string; // 'YYYY-MM-DD'
  titulo: string; // nome do serviço
  cliente: string;
  inicio: string; // 'HH:MM' (24h)
  duracaoMin: number; // duração em minutos (> 0)
  tecnico: string;
  valorCentavos: number; // >= 0, inteiro
  situacao: Situacao;
  obs?: string;
  projetoId?: string; // id da obra (vínculo estável); resolvido do cliente ao gravar
}

/** Campos de um serviço ainda sem id (formulário de criação). */
export type NovoServico = Omit<Servico, 'id'>;

/** Campos editáveis num update (id vem à parte). */
export type PatchServico = Partial<NovoServico>;

const MIN_POR_DIA = 24 * 60;
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ------------------------------------------------------------------
// Datas e horários
// ------------------------------------------------------------------

/** Valida uma data 'YYYY-MM-DD' de forma estrita (inclui dias por mês e ano bissexto). */
export function ehDataValida(data: string): boolean {
  const m = RE_DATA.exec(data);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12) return false;
  if (dia < 1 || dia > diasNoMes(ano, mes)) return false;
  return true;
}

function diasNoMes(ano: number, mes: number): number {
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dias[mes - 1] ?? 0;
}

/** 'HH:MM' -> minutos desde meia-noite. Lança em entrada inválida. */
export function minutosDoDia(hora: string): number {
  const m = RE_HORA.exec(hora);
  if (!m) throw new RangeError(`Horário inválido: "${hora}" (esperado HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutos desde meia-noite -> 'HH:MM'. Aceita apenas 0..1440. */
export function horaDeMinutos(min: number): string {
  if (!Number.isInteger(min) || min < 0 || min > MIN_POR_DIA) {
    throw new RangeError(`Minutos fora do intervalo do dia: ${min}`);
  }
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface Intervalo {
  readonly inicioMin: number;
  readonly fimMin: number;
}

/** Intervalo [início, fim) de um serviço, em minutos do dia. */
export function intervaloDoServico(s: Pick<Servico, 'inicio' | 'duracaoMin'>): Intervalo {
  const inicioMin = minutosDoDia(s.inicio);
  return { inicioMin, fimMin: inicioMin + s.duracaoMin };
}

// ------------------------------------------------------------------
// Conflitos de horário
// ------------------------------------------------------------------

/**
 * Minutos de sobreposição entre dois intervalos [início, fim).
 * Encostar (fim de um == início do outro) => 0, não é conflito.
 */
export function minutosDeSobreposicao(a: Intervalo, b: Intervalo): number {
  const inicio = Math.max(a.inicioMin, b.inicioMin);
  const fim = Math.min(a.fimMin, b.fimMin);
  return Math.max(0, fim - inicio);
}

export interface Conflito {
  readonly a: Servico;
  readonly b: Servico;
  readonly inicioMin: number; // início da janela sobreposta
  readonly fimMin: number; // fim da janela sobreposta
  readonly minutos: number; // duração da sobreposição (> 0)
}

/** Um serviço "bloqueia" a agenda? Cancelado nunca conflita. */
function ocupaAgenda(s: Pick<Servico, 'situacao'>): boolean {
  return s.situacao !== 'cancelado';
}

/**
 * Todos os pares de serviços que se sobrepõem dentro de UM mesmo dia.
 * Ignora cancelados. A lista de entrada deve ser do mesmo dia; serviços
 * de datas diferentes nunca são comparados (retorna vazio se `data` difere).
 */
export function conflitosNoDia(servicos: readonly Servico[]): Conflito[] {
  const ativos = servicos.filter(ocupaAgenda);
  const conflitos: Conflito[] = [];
  for (let i = 0; i < ativos.length; i++) {
    for (let j = i + 1; j < ativos.length; j++) {
      const a = ativos[i]!;
      const b = ativos[j]!;
      if (a.data !== b.data) continue;
      const ia = intervaloDoServico(a);
      const ib = intervaloDoServico(b);
      const mins = minutosDeSobreposicao(ia, ib);
      if (mins > 0) {
        conflitos.push({
          a,
          b,
          inicioMin: Math.max(ia.inicioMin, ib.inicioMin),
          fimMin: Math.min(ia.fimMin, ib.fimMin),
          minutos: mins,
        });
      }
    }
  }
  return conflitos;
}

/** Candidato (novo ou em edição) a ser encaixado num dia. */
export interface Candidato {
  readonly id?: string; // presente em edição — exclui a si mesmo
  readonly data: string;
  readonly inicio: string;
  readonly duracaoMin: number;
  readonly situacao: Situacao;
}

/**
 * Serviços do dia que conflitam com o candidato. Exclui o próprio
 * (por id, em edição) e ignora cancelados dos dois lados.
 */
export function conflitosDoCandidato(candidato: Candidato, doDia: readonly Servico[]): Servico[] {
  if (!ocupaAgenda(candidato)) return [];
  const alvo = intervaloDoServico(candidato);
  return doDia.filter((s) => {
    if (s.id === candidato.id) return false;
    if (s.data !== candidato.data) return false;
    if (!ocupaAgenda(s)) return false;
    return minutosDeSobreposicao(alvo, intervaloDoServico(s)) > 0;
  });
}

// ------------------------------------------------------------------
// Validação
// ------------------------------------------------------------------

export interface ResultadoValidacao {
  readonly ok: boolean;
  readonly erros: string[];
}

/** Valida um serviço (novo ou existente) campo a campo. */
export function validarServico(s: NovoServico): ResultadoValidacao {
  const erros: string[] = [];
  if (!s || typeof s !== 'object') return { ok: false, erros: ['Dados inválidos.'] };
  if (!ehDataValida(s.data)) erros.push('Data inválida.');
  if (typeof s.titulo !== 'string' || s.titulo.trim() === '') erros.push('Informe o serviço.');
  if (typeof s.cliente !== 'string' || s.cliente.trim() === '') erros.push('Informe o cliente.');
  if (!RE_HORA.test(s.inicio)) erros.push('Horário inválido.');
  if (!Number.isInteger(s.duracaoMin) || s.duracaoMin <= 0) {
    erros.push('Duração deve ser maior que zero.');
  }
  if (!Number.isInteger(s.valorCentavos) || s.valorCentavos < 0) {
    erros.push('Valor inválido.');
  }
  // Não pode ultrapassar a meia-noite.
  if (RE_HORA.test(s.inicio) && Number.isInteger(s.duracaoMin) && s.duracaoMin > 0) {
    if (minutosDoDia(s.inicio) + s.duracaoMin > MIN_POR_DIA) {
      erros.push('O serviço ultrapassa o fim do dia.');
    }
  }
  return { ok: erros.length === 0, erros };
}

// ------------------------------------------------------------------
// Estado da data (que modo o modal abre)
// ------------------------------------------------------------------

/** data < hoje ? (comparação lexicográfica é segura para 'YYYY-MM-DD'). */
export function ehPassado(data: string, hoje: string): boolean {
  return data < hoje;
}

export type EstadoData =
  | { readonly tipo: 'vazio-futuro' }
  | { readonly tipo: 'preenchido-futuro'; readonly servicos: Servico[] }
  | { readonly tipo: 'vazio-passado' }
  | { readonly tipo: 'preenchido-passado'; readonly servicos: Servico[] };

/**
 * Resolve o estado de uma data a partir dos serviços daquele dia,
 * já ordenados por horário. `hoje` no formato 'YYYY-MM-DD'.
 */
export function estadoDaData(data: string, hoje: string, servicosDoDia: readonly Servico[]): EstadoData {
  const ordenados = [...servicosDoDia].sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio));
  const passado = ehPassado(data, hoje);
  if (ordenados.length === 0) {
    return passado ? { tipo: 'vazio-passado' } : { tipo: 'vazio-futuro' };
  }
  return passado
    ? { tipo: 'preenchido-passado', servicos: ordenados }
    : { tipo: 'preenchido-futuro', servicos: ordenados };
}

export interface AcoesModal {
  readonly podeCriar: boolean; // adicionar novo serviço na data
  readonly podeEditar: boolean; // atualizar um serviço existente
  readonly podeRemover: boolean; // excluir um serviço existente
}

/** Quais ações o modal libera para cada estado de data. */
export function acoesPara(estado: EstadoData): AcoesModal {
  switch (estado.tipo) {
    case 'vazio-futuro':
      return { podeCriar: true, podeEditar: false, podeRemover: false };
    case 'preenchido-futuro':
      return { podeCriar: true, podeEditar: true, podeRemover: true };
    case 'vazio-passado':
      return { podeCriar: false, podeEditar: false, podeRemover: false };
    case 'preenchido-passado':
      // No passado não se cria novo, apenas corrige (update) ou remove.
      return { podeCriar: false, podeEditar: true, podeRemover: true };
  }
}

// ------------------------------------------------------------------
// Store CRUD (memória) — mesma lógica que o back-end deve aplicar
// ------------------------------------------------------------------

export type ResultadoCrud =
  | { readonly ok: true; readonly servico: Servico }
  | { readonly ok: false; readonly erros: string[]; readonly conflitos: Servico[] };

export interface OpcoesGravacao {
  /** Permitir salvar mesmo com conflito de horário (sobrepor). Padrão: false. */
  readonly permitirConflito?: boolean;
}

export class AgendaStore {
  private itens: Servico[] = [];
  private seq = 0;

  constructor(seed: readonly Servico[] = []) {
    for (const s of seed) {
      this.itens.push({ ...s });
      const n = Number.parseInt(s.id.replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > this.seq) this.seq = n;
    }
  }

  private novoId(): string {
    this.seq += 1;
    return `ag_${this.seq}`;
  }

  todos(): Servico[] {
    return this.itens.map((s) => ({ ...s }));
  }

  /** Serviços de um dia, ordenados por horário. */
  doDia(data: string): Servico[] {
    return this.itens
      .filter((s) => s.data === data)
      .sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio))
      .map((s) => ({ ...s }));
  }

  buscar(id: string): Servico | undefined {
    const s = this.itens.find((x) => x.id === id);
    return s ? { ...s } : undefined;
  }

  /** Cria um serviço. Valida e checa conflito (a menos que permitido). */
  adicionar(novo: NovoServico, opts: OpcoesGravacao = {}): ResultadoCrud {
    const v = validarServico(novo);
    if (!v.ok) return { ok: false, erros: v.erros, conflitos: [] };

    const conflitos = conflitosDoCandidato(
      { data: novo.data, inicio: novo.inicio, duracaoMin: novo.duracaoMin, situacao: novo.situacao },
      this.doDia(novo.data),
    );
    if (conflitos.length > 0 && !opts.permitirConflito) {
      return { ok: false, erros: ['Conflito de horário com outro serviço.'], conflitos };
    }

    const servico: Servico = { ...novo, id: this.novoId() };
    this.itens.push(servico);
    return { ok: true, servico: { ...servico } };
  }

  /** Atualiza um serviço existente. Mantém id; revalida e recheca conflito. */
  atualizar(id: string, patch: PatchServico, opts: OpcoesGravacao = {}): ResultadoCrud {
    const idx = this.itens.findIndex((s) => s.id === id);
    if (idx < 0) return { ok: false, erros: ['Serviço não encontrado.'], conflitos: [] };

    const atual = this.itens[idx]!;
    const proposto: Servico = { ...atual, ...patch, id };

    const v = validarServico(proposto);
    if (!v.ok) return { ok: false, erros: v.erros, conflitos: [] };

    const conflitos = conflitosDoCandidato(
      { id, data: proposto.data, inicio: proposto.inicio, duracaoMin: proposto.duracaoMin, situacao: proposto.situacao },
      this.doDia(proposto.data),
    );
    if (conflitos.length > 0 && !opts.permitirConflito) {
      return { ok: false, erros: ['Conflito de horário com outro serviço.'], conflitos };
    }

    this.itens[idx] = proposto;
    return { ok: true, servico: { ...proposto } };
  }

  /** Remove um serviço. Retorna true se removeu. */
  remover(id: string): boolean {
    const antes = this.itens.length;
    this.itens = this.itens.filter((s) => s.id !== id);
    return this.itens.length < antes;
  }
}

// ------------------------------------------------------------------
// Formatação (apresentação)
// ------------------------------------------------------------------

/** Centavos -> 'R$ 12.500,00' (agrupamento manual, sem depender de ICU). */
export function formatarBRL(centavos: number): string {
  const negativo = centavos < 0;
  const total = Math.abs(Math.trunc(centavos));
  const reais = Math.floor(total / 100);
  const cent = total % 100;
  const s = String(reais);
  let agrupado = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) agrupado += '.';
    agrupado += s[i];
  }
  return `${negativo ? '-' : ''}R$ ${agrupado},${String(cent).padStart(2, '0')}`;
}

/** Duração em minutos -> '2h', '1h30', '45min'. */
export function formatarDuracao(min: number): string {
  if (min <= 0) return '0min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}
