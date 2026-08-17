/**
 * Import de planilhas → movimentações — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Lógica pura de mapeamento: recebe uma linha "crua" (objeto com as colunas
 * da planilha, com cabeçalhos variados) e devolve uma NovaMovimentacao válida
 * ou um erro. Aceita apelidos de coluna, valores "1.234,56"/"1234.56", datas
 * DD/MM/AAAA, AAAA-MM-DD ou serial do Excel, e infere o tipo pelo sinal do
 * valor quando a coluna "tipo" não existe. A leitura do arquivo (CSV/XLSX)
 * fica no servidor (SheetJS); aqui é só o mapeamento — testável, sem I/O.
 */
import type { NovaMovimentacao, FormaPagamento, SituacaoMov, TipoMov } from './movimentacoes.ts';

export type LinhaCrua = Record<string, unknown>;

/** minúsculas, sem acento, sem espaços nas pontas. */
export function normalizarChave(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Pega o primeiro valor não vazio da linha entre os apelidos de coluna. */
function pega(linha: LinhaCrua, aliases: readonly string[]): string {
  const mapa = new Map<string, unknown>();
  for (const k of Object.keys(linha)) mapa.set(normalizarChave(k), linha[k]);
  for (const a of aliases) {
    const v = mapa.get(a);
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** "R$ 1.234,56" / "1234.56" / "-1.850,00" → centavos (com sinal). null se inválido. */
export function parseValorCentavos(v: string): number | null {
  let s = String(v).trim();
  if (s === '') return null;
  const neg = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // vírgula é o decimal
  else if (lastDot > lastComma) s = s.replace(/,/g, ''); // ponto é o decimal
  else s = s.replace(',', '.'); // só um separador
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const cent = Math.round(Math.abs(n) * 100);
  return neg ? -cent : cent;
}

/** DD/MM/AAAA, AAAA-MM-DD ou serial do Excel → 'AAAA-MM-DD'. null se inválido. */
export function parseDataISO(v: string): string | null {
  const s = String(v).trim();
  if (s === '') return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    let y = m[3]!;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  if (/^\d{5,6}$/.test(s)) {
    // serial do Excel (dias desde 1899-12-30)
    const ms = Math.round((Number(s) - 25569) * 86_400_000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

export function normalizarTipo(v: string): TipoMov | null {
  const s = normalizarChave(v);
  if (['entrada', 'entradas', 'receita', 'credito', 'credit', 'income', 'c', '+'].includes(s)) return 'entrada';
  if (['saida', 'saidas', 'despesa', 'debito', 'debit', 'expense', 'd', '-'].includes(s)) return 'saida';
  return null;
}

export function normalizarForma(v: string): FormaPagamento {
  const s = normalizarChave(v);
  if (s.includes('pix')) return 'pix';
  if (s.includes('transfer') || s.includes('ted') || s.includes('doc')) return 'transferencia';
  if (s.includes('boleto')) return 'boleto';
  if (s.includes('cart') || s.includes('cred') || s.includes('deb')) return 'cartao';
  if (s.includes('dinheiro') || s.includes('especie') || s.includes('cash')) return 'dinheiro';
  return 'pix';
}

export function normalizarSituacao(v: string): SituacaoMov {
  const s = normalizarChave(v);
  if (s.includes('pend') || s.includes('aberto') || s.includes('receber') || s.includes('pagar')) return 'pendente';
  if (s.includes('agend') || s.includes('futur') || s.includes('previst')) return 'agendado';
  return 'pago';
}

const COL = {
  data: ['data', 'date', 'dt', 'data lancamento', 'data do lancamento', 'competencia'],
  descricao: ['descricao', 'historico', 'description', 'memo', 'lancamento', 'detalhe', 'observacao'],
  categoria: ['categoria', 'category', 'conta', 'plano de contas', 'classificacao'],
  forma: ['forma', 'forma de pagamento', 'pagamento', 'payment', 'meio', 'meio de pagamento'],
  situacao: ['situacao', 'status', 'estado'],
  valor: ['valor', 'valor (r$)', 'value', 'amount', 'montante', 'total', 'valor rs'],
  tipo: ['tipo', 'type', 'natureza', 'operacao', 'd/c', 'entrada/saida'],
} as const;

export interface ResultadoLinha {
  readonly ok: boolean;
  readonly mov?: NovaMovimentacao;
  readonly erro?: string;
}

/** Mapeia uma linha crua da planilha para uma NovaMovimentacao (ou erro). */
export function linhaParaMovimentacao(linha: LinhaCrua): ResultadoLinha {
  const dataRaw = pega(linha, COL.data);
  const data = dataRaw ? parseDataISO(dataRaw) : null;
  if (!data) return { ok: false, erro: `Data inválida ("${dataRaw}")` };

  const descricao = pega(linha, COL.descricao);
  if (descricao === '') return { ok: false, erro: 'Descrição vazia' };

  const cent = parseValorCentavos(pega(linha, COL.valor));
  if (cent === null || cent === 0) return { ok: false, erro: 'Valor inválido' };

  const tipoRaw = pega(linha, COL.tipo);
  const tipo: TipoMov = (tipoRaw && normalizarTipo(tipoRaw)) || (cent < 0 ? 'saida' : 'entrada');

  const mov: NovaMovimentacao = {
    data,
    descricao,
    categoria: pega(linha, COL.categoria) || 'Outros',
    tipo,
    forma: normalizarForma(pega(linha, COL.forma)),
    valorCentavos: Math.abs(cent),
    situacao: normalizarSituacao(pega(linha, COL.situacao)),
    recorrente: false,
  };
  return { ok: true, mov };
}

export interface ResultadoImport {
  readonly movs: NovaMovimentacao[];
  readonly erros: { linha: number; erro: string }[];
}

/** Mapeia todas as linhas; agrega as válidas e os erros (linha 1 = cabeçalho). */
export function mapearLinhas(linhas: readonly LinhaCrua[]): ResultadoImport {
  const movs: NovaMovimentacao[] = [];
  const erros: { linha: number; erro: string }[] = [];
  linhas.forEach((l, i) => {
    const r = linhaParaMovimentacao(l);
    if (r.ok && r.mov) movs.push(r.mov);
    else erros.push({ linha: i + 2, erro: r.erro ?? 'linha inválida' });
  });
  return { movs, erros };
}
