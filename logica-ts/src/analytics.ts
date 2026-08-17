/**
 * Analytics financeira — lógica pura e testável (comparação mês a mês).
 *
 * A partir das movimentações (que já têm `data`, `tipo`, `valorCentavos`,
 * `situacao`), monta a **série mensal** de faturamento/despesa/lucro/margem e
 * calcula as **variações vs. o mês anterior**. Não acessa banco nem rede.
 * Dinheiro em centavos; percentuais com 1 casa.
 */

export interface LancamentoFin {
  data: string;        // 'YYYY-MM-DD'
  tipo: 'entrada' | 'saida';
  valorCentavos: number;
  situacao: string;    // 'pago' | 'pendente' | 'agendado'
}

export interface MesFinanceiro {
  mes: string;                 // 'YYYY-MM'
  entradasCentavos: number;    // faturamento do mês
  saidasCentavos: number;      // despesas do mês
  saldoCentavos: number;       // lucro = entradas - saídas
  recebidoCentavos: number;    // entradas já pagas
  aReceberCentavos: number;    // entradas ainda não pagas
  nEntradas: number;
  nSaidas: number;
  nLancamentos: number;
  margemPct: number;           // saldo / entradas * 100 (0 se entradas = 0)
  ticketMedioCentavos: number; // entradas / nEntradas (0 se nEntradas = 0)
}

export type Direcao = 'sobe' | 'desce' | 'igual';
export interface Delta {
  atual: number;
  anterior: number;
  abs: number;             // atual - anterior (em centavos, ou p.p. para margem)
  pct: number | null;      // variação %; null quando não há base (anterior = 0 e atual ≠ 0)
  direcao: Direcao;
}

export interface ComparativoMes {
  mes: string;
  mesAnterior: string | null;
  entradas: Delta;
  saidas: Delta;
  saldo: Delta;
  recebido: Delta;
  aReceber: Delta;
  margem: Delta;         // abs em pontos percentuais
  ticketMedio: Delta;
  nLancamentos: Delta;
}

export interface OpcoesSerie { de?: string; ate?: string; } // 'YYYY-MM'

// ---- helpers de mês ----
function mesDe(iso: string): string { return iso.slice(0, 7); }
function proximoMes(m: string): string {
  let y = Number(m.slice(0, 4)); let mo = Number(m.slice(5, 7)) + 1;
  if (mo > 12) { mo = 1; y += 1; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}
function mesesNoIntervalo(de: string, ate: string): string[] {
  const out: string[] = [];
  let cur = de;
  for (let i = 0; cur <= ate && i < 600; i++) { out.push(cur); cur = proximoMes(cur); }
  return out;
}
function arred(n: number, casas = 1): number { const p = 10 ** casas; return Math.round(n * p) / p; }
function vazio(mes: string): MesFinanceiro {
  return { mes, entradasCentavos: 0, saidasCentavos: 0, saldoCentavos: 0, recebidoCentavos: 0, aReceberCentavos: 0, nEntradas: 0, nSaidas: 0, nLancamentos: 0, margemPct: 0, ticketMedioCentavos: 0 };
}
function finalizar(m: MesFinanceiro): MesFinanceiro {
  m.saldoCentavos = m.entradasCentavos - m.saidasCentavos;
  m.margemPct = m.entradasCentavos > 0 ? arred((m.saldoCentavos / m.entradasCentavos) * 100) : 0;
  m.ticketMedioCentavos = m.nEntradas > 0 ? Math.round(m.entradasCentavos / m.nEntradas) : 0;
  return m;
}

/**
 * Série mensal ordenada (ascendente). Sem `de/ate`, cobre os meses presentes
 * nos dados; com `de/ate`, preenche o intervalo inteiro (meses sem dados = 0).
 */
export function serieMensal(lancamentos: readonly LancamentoFin[], opts: OpcoesSerie = {}): MesFinanceiro[] {
  const porMes = new Map<string, MesFinanceiro>();
  const garantir = (mes: string): MesFinanceiro => {
    let x = porMes.get(mes);
    if (!x) { x = vazio(mes); porMes.set(mes, x); }
    return x;
  };
  for (const l of lancamentos) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.data)) continue;
    const x = garantir(mesDe(l.data));
    if (l.tipo === 'entrada') {
      x.entradasCentavos += l.valorCentavos; x.nEntradas += 1;
      if (l.situacao === 'pago') x.recebidoCentavos += l.valorCentavos; else x.aReceberCentavos += l.valorCentavos;
    } else {
      x.saidasCentavos += l.valorCentavos; x.nSaidas += 1;
    }
    x.nLancamentos += 1;
  }
  const presentes = [...porMes.keys()].sort();
  const de = opts.de ?? presentes[0];
  const ate = opts.ate ?? presentes[presentes.length - 1];
  const meses = (de && ate) ? mesesNoIntervalo(de, ate) : presentes;
  return meses.map((mes) => finalizar(porMes.get(mes) ?? vazio(mes)));
}

/** Variação entre dois valores (atual vs. anterior). */
export function delta(atual: number, anterior: number): Delta {
  const abs = arred(atual - anterior, 2); // evita ruído de ponto flutuante (ex.: p.p. da margem)
  const pct = anterior === 0 ? (atual === 0 ? 0 : null) : arred((abs / Math.abs(anterior)) * 100);
  const eps = 1e-9;
  const direcao: Direcao = abs > eps ? 'sobe' : abs < -eps ? 'desce' : 'igual';
  return { atual, anterior, abs, pct, direcao };
}

/** Comparação completa de um mês contra o anterior (null = sem base). */
export function compararMeses(atual: MesFinanceiro, anterior: MesFinanceiro | null): ComparativoMes {
  const a = anterior ?? vazio(atual.mes);
  return {
    mes: atual.mes,
    mesAnterior: anterior ? anterior.mes : null,
    entradas: delta(atual.entradasCentavos, a.entradasCentavos),
    saidas: delta(atual.saidasCentavos, a.saidasCentavos),
    saldo: delta(atual.saldoCentavos, a.saldoCentavos),
    recebido: delta(atual.recebidoCentavos, a.recebidoCentavos),
    aReceber: delta(atual.aReceberCentavos, a.aReceberCentavos),
    margem: delta(atual.margemPct, a.margemPct),
    ticketMedio: delta(atual.ticketMedioCentavos, a.ticketMedioCentavos),
    nLancamentos: delta(atual.nLancamentos, a.nLancamentos),
  };
}

/** Pega os dois últimos meses da série e compara (para os cards de topo). */
export function resumoComparativo(serie: readonly MesFinanceiro[]): { atual: MesFinanceiro | null; comparativo: ComparativoMes | null } {
  if (serie.length === 0) return { atual: null, comparativo: null };
  const atual = serie[serie.length - 1]!;
  const anterior = serie.length >= 2 ? serie[serie.length - 2]! : null;
  return { atual, comparativo: compararMeses(atual, anterior) };
}
