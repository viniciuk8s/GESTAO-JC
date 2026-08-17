/**
 * Domínio de Movimentações (fluxo de caixa) — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Entradas e saídas do caixa. Lógica pura e testável: validação de cada
 * lançamento e o resumo do período (entradas, saídas, saldo, a receber,
 * a pagar e despesas por categoria). Dinheiro sempre em centavos (inteiro).
 */
import { ehDataValida } from './agendamentos.ts';

export type TipoMov = 'entrada' | 'saida';
export type FormaPagamento = 'pix' | 'dinheiro' | 'cartao' | 'boleto' | 'transferencia';
export type SituacaoMov = 'pago' | 'pendente' | 'agendado';

const TIPOS: readonly TipoMov[] = ['entrada', 'saida'];
const FORMAS: readonly FormaPagamento[] = ['pix', 'dinheiro', 'cartao', 'boleto', 'transferencia'];
const SITUACOES: readonly SituacaoMov[] = ['pago', 'pendente', 'agendado'];

export interface Movimentacao {
  readonly id: string;
  data: string; // 'YYYY-MM-DD'
  descricao: string;
  categoria: string; // ex.: 'Instalação solar', 'Folha de pagamento', 'Fornecedores'...
  tipo: TipoMov;
  forma: FormaPagamento;
  valorCentavos: number; // > 0, inteiro
  situacao: SituacaoMov;
  recorrente: boolean; // repete mensalmente
  obs?: string;
  projetoId?: string; // obra/projeto vinculado (opcional)
}

/** Campos de um lançamento novo (id gerado pelo repo). */
export type NovaMovimentacao = Omit<Movimentacao, 'id'>;
/** Campos editáveis num update (id à parte). */
export type PatchMovimentacao = Partial<NovaMovimentacao>;

export interface ResultadoValidacao {
  readonly ok: boolean;
  readonly erros: string[];
}

/** Valida um lançamento (novo ou proposto) campo a campo. */
export function validarMovimentacao(m: NovaMovimentacao): ResultadoValidacao {
  const erros: string[] = [];
  if (!m || typeof m !== 'object') return { ok: false, erros: ['Dados inválidos.'] };
  if (!TIPOS.includes(m.tipo)) erros.push('Tipo inválido (entrada ou saída).');
  if (typeof m.descricao !== 'string' || m.descricao.trim() === '') erros.push('Informe uma descrição.');
  if (typeof m.categoria !== 'string' || m.categoria.trim() === '') erros.push('Informe a categoria.');
  if (!FORMAS.includes(m.forma)) erros.push('Forma de pagamento inválida.');
  if (!SITUACOES.includes(m.situacao)) erros.push('Situação inválida.');
  if (!Number.isInteger(m.valorCentavos) || m.valorCentavos <= 0) erros.push('Valor deve ser maior que zero.');
  if (!ehDataValida(m.data)) erros.push('Data inválida.');
  return { ok: erros.length === 0, erros };
}

export interface CategoriaResumo {
  categoria: string;
  saidaCentavos: number;
}

export interface ResumoMov {
  entradasCentavos: number; // soma de todas as entradas
  saidasCentavos: number; // soma de todas as saídas
  saldoCentavos: number; // entradas − saídas
  aReceberCentavos: number; // entradas ainda não pagas (pendente/agendado)
  aPagarCentavos: number; // saídas ainda não pagas
  totalLancamentos: number;
  porCategoria: CategoriaResumo[]; // só saídas, da maior para a menor
}

/** Resumo do fluxo de caixa a partir de uma lista de movimentações. */
export function resumoMovimentacoes(movs: readonly Movimentacao[]): ResumoMov {
  let entradasCentavos = 0;
  let saidasCentavos = 0;
  let aReceberCentavos = 0;
  let aPagarCentavos = 0;
  const cat = new Map<string, number>();

  for (const m of movs) {
    if (m.tipo === 'entrada') {
      entradasCentavos += m.valorCentavos;
      if (m.situacao !== 'pago') aReceberCentavos += m.valorCentavos;
    } else {
      saidasCentavos += m.valorCentavos;
      if (m.situacao !== 'pago') aPagarCentavos += m.valorCentavos;
      cat.set(m.categoria, (cat.get(m.categoria) ?? 0) + m.valorCentavos);
    }
  }

  const porCategoria: CategoriaResumo[] = [...cat.entries()]
    .map(([categoria, saidaCentavos]) => ({ categoria, saidaCentavos }))
    .sort((a, b) => b.saidaCentavos - a.saidaCentavos);

  return {
    entradasCentavos,
    saidasCentavos,
    saldoCentavos: entradasCentavos - saidasCentavos,
    aReceberCentavos,
    aPagarCentavos,
    totalLancamentos: movs.length,
    porCategoria,
  };
}

/**
 * Ordena por data (e id) e devolve cada lançamento com o **saldo acumulado**
 * até ele (útil para a coluna "saldo" do extrato). Começa do mais antigo.
 * `ordem` controla a ordem do array retornado (padrão: mais recente primeiro).
 */
export function comSaldoAcumulado(
  movs: readonly Movimentacao[],
  ordem: 'desc' | 'asc' = 'desc',
): Array<Movimentacao & { saldoCentavos: number }> {
  const asc = [...movs].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1));
  let saldo = 0;
  const comSaldo = asc.map((m) => {
    saldo += m.tipo === 'entrada' ? m.valorCentavos : -m.valorCentavos;
    return { ...m, saldoCentavos: saldo };
  });
  return ordem === 'asc' ? comSaldo : comSaldo.reverse();
}
