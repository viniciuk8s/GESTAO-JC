/**
 * Evolução de obras — lógica pura e testável (carteira/backlog + progresso).
 *
 * A partir dos **snapshots mensais** das obras (histórico), monta a série de
 * carteira (contratado, recebido, backlog a faturar) e de progresso médio, e a
 * evolução de progresso por obra. Não acessa banco nem rede. Dinheiro em centavos.
 */
import { delta, type Delta } from './analytics.ts';

export interface SnapshotObra {
  mes: string;          // 'YYYY-MM'
  projetoId: string;
  nome: string;
  cliente: string;
  status: string;       // orcamento|em_andamento|concluido|cancelado
  progresso: number;    // 0..100
  contratadoCentavos: number;
  recebidoCentavos: number;
  aReceberCentavos: number;
}

export interface MesCarteira {
  mes: string;
  contratadoCentavos: number;  // soma dos contratos ativos (não cancelados)
  recebidoCentavos: number;
  backlogCentavos: number;     // carteira a faturar (a receber)
  nObras: number;
  nAtivas: number;             // em andamento
  nConcluidas: number;
  progressoMedio: number;      // média do progresso das obras em andamento (0..100)
}

export interface ComparativoCarteira {
  mes: string;
  mesAnterior: string | null;
  contratado: Delta;
  recebido: Delta;
  backlog: Delta;
  progressoMedio: Delta;
  nAtivas: Delta;
}

export interface ObraEvolucao {
  projetoId: string;
  nome: string;
  cliente: string;
  status: string;              // do último snapshot
  progressoAtual: number;
  contratadoCentavos: number;
  aReceberCentavos: number;
  pontos: { mes: string; progresso: number; status: string }[];
}

function arred(n: number): number { return Math.round(n); }

/** Série mensal de carteira/progresso a partir dos snapshots (meses presentes, asc). */
export function serieCarteira(snaps: readonly SnapshotObra[]): MesCarteira[] {
  const porMes = new Map<string, SnapshotObra[]>();
  for (const s of snaps) {
    const arr = porMes.get(s.mes); if (arr) arr.push(s); else porMes.set(s.mes, [s]);
  }
  return [...porMes.keys()].sort().map((mes) => {
    const obras = porMes.get(mes)!.filter((o) => o.status !== 'cancelado');
    const ativas = obras.filter((o) => o.status === 'em_andamento');
    const progressoMedio = ativas.length ? arred(ativas.reduce((s, o) => s + o.progresso, 0) / ativas.length) : 0;
    return {
      mes,
      contratadoCentavos: obras.reduce((s, o) => s + o.contratadoCentavos, 0),
      recebidoCentavos: obras.reduce((s, o) => s + o.recebidoCentavos, 0),
      backlogCentavos: obras.reduce((s, o) => s + o.aReceberCentavos, 0),
      nObras: obras.length,
      nAtivas: ativas.length,
      nConcluidas: obras.filter((o) => o.status === 'concluido').length,
      progressoMedio,
    };
  });
}

/** Comparação de um mês de carteira contra o anterior. */
export function compararCarteira(atual: MesCarteira, anterior: MesCarteira | null): ComparativoCarteira {
  const a = anterior;
  return {
    mes: atual.mes,
    mesAnterior: a ? a.mes : null,
    contratado: delta(atual.contratadoCentavos, a ? a.contratadoCentavos : 0),
    recebido: delta(atual.recebidoCentavos, a ? a.recebidoCentavos : 0),
    backlog: delta(atual.backlogCentavos, a ? a.backlogCentavos : 0),
    progressoMedio: delta(atual.progressoMedio, a ? a.progressoMedio : 0),
    nAtivas: delta(atual.nAtivas, a ? a.nAtivas : 0),
  };
}

/** Últimos dois meses da série, comparados (para os cards de topo). */
export function resumoCarteira(serie: readonly MesCarteira[]): { atual: MesCarteira | null; comparativo: ComparativoCarteira | null } {
  if (serie.length === 0) return { atual: null, comparativo: null };
  const atual = serie[serie.length - 1]!;
  const anterior = serie.length >= 2 ? serie[serie.length - 2]! : null;
  return { atual, comparativo: compararCarteira(atual, anterior) };
}

/** Evolução do progresso por obra (uma linha por projeto, ordenada por nome). */
export function evolucaoPorObra(snaps: readonly SnapshotObra[]): ObraEvolucao[] {
  const porObra = new Map<string, SnapshotObra[]>();
  for (const s of snaps) {
    const arr = porObra.get(s.projetoId); if (arr) arr.push(s); else porObra.set(s.projetoId, [s]);
  }
  const out: ObraEvolucao[] = [];
  for (const [projetoId, arr] of porObra) {
    const ordenado = [...arr].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
    const ultimo = ordenado[ordenado.length - 1]!;
    out.push({
      projetoId, nome: ultimo.nome, cliente: ultimo.cliente,
      status: ultimo.status, progressoAtual: ultimo.progresso,
      contratadoCentavos: ultimo.contratadoCentavos, aReceberCentavos: ultimo.aReceberCentavos,
      pontos: ordenado.map((s) => ({ mes: s.mes, progresso: s.progresso, status: s.status })),
    });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
