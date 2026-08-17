/**
 * Domínio de Dias trabalhados (jornadas) — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Regra central: quando um serviço da agenda é **concluído** e tem um
 * colaborador atribuído, gera-se automaticamente uma jornada (dia
 * trabalhado) para aquele funcionário. Lógica pura, tipada e testável.
 */
import type { Servico } from './agendamentos.ts';

export interface Jornada {
  readonly id: string;
  readonly origemId: string; // id do serviço que originou a jornada (ou 'man_x' para manual)
  funcionario: string;
  data: string; // 'YYYY-MM-DD'
  servico: string;
  cliente: string;
  duracaoMin: number;
  pago: boolean; // se o dia já foi pago ao colaborador
}

/** Campos de um lançamento manual de dia trabalhado (sem id). */
export type NovaJornada = Omit<Jornada, 'id' | 'origemId'>;

/**
 * Converte um serviço em jornada — SOMENTE se estiver concluído e tiver
 * colaborador. Caso contrário retorna null (nada é registrado).
 */
export function jornadaDeServico(s: Servico): Jornada | null {
  if (s.situacao !== 'concluido') return null;
  if (s.tecnico.trim() === '') return null;
  return {
    id: `j_${s.id}`,
    origemId: s.id,
    funcionario: s.tecnico,
    data: s.data,
    servico: s.titulo,
    cliente: s.cliente,
    duracaoMin: s.duracaoMin,
    pago: false, // dia recém-registrado começa como "a pagar"
  };
}

export interface ResumoFuncionario {
  funcionario: string;
  dias: number; // dias distintos trabalhados
  minutos: number; // soma da duração
  servicos: number; // qtd de jornadas
  pagos: number; // jornadas já pagas
  aPagar: number; // jornadas ainda não pagas
  jornadas: Jornada[]; // mais recentes primeiro
}

export class DiasTrabalhadosStore {
  private itens: Jornada[] = [];
  private seq = 0;

  constructor(seed: readonly Jornada[] = []) {
    for (const j of seed) {
      this.itens.push({ ...j });
      const n = Number.parseInt(j.origemId.replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > this.seq) this.seq = n;
    }
  }

  /** Registra uma jornada. Idempotente por `origemId` (não duplica). */
  registrar(j: Jornada): boolean {
    if (this.itens.some((x) => x.origemId === j.origemId)) return false;
    this.itens.push({ ...j });
    return true;
  }

  /** Registra a partir de um serviço concluído com colaborador. */
  registrarDeServico(s: Servico): Jornada | null {
    const j = jornadaDeServico(s);
    if (!j) return null;
    return this.registrar(j) ? { ...j } : null;
  }

  /** Lançamento manual de um dia trabalhado (gera id/origemId próprios). */
  adicionarManual(dados: NovaJornada): Jornada {
    this.seq += 1;
    const origemId = `man_${this.seq}`;
    const j: Jornada = { id: `j_${origemId}`, origemId, ...dados };
    this.itens.push({ ...j });
    return { ...j };
  }

  /** Marca uma jornada como paga ou a pagar. */
  marcarPago(id: string, pago: boolean): boolean {
    const j = this.itens.find((x) => x.id === id);
    if (!j) return false;
    j.pago = pago;
    return true;
  }

  buscar(id: string): Jornada | undefined {
    const j = this.itens.find((x) => x.id === id);
    return j ? { ...j } : undefined;
  }

  /** Remove a jornada gerada por um serviço (ex.: serviço/​data removidos). */
  removerPorOrigem(origemId: string): boolean {
    const antes = this.itens.length;
    this.itens = this.itens.filter((x) => x.origemId !== origemId);
    return this.itens.length < antes;
  }

  /** Remove uma jornada pelo seu id (ex.: excluir um lançamento manual). */
  removerPorId(id: string): boolean {
    const antes = this.itens.length;
    this.itens = this.itens.filter((x) => x.id !== id);
    return this.itens.length < antes;
  }

  todas(): Jornada[] {
    return this.itens.map((j) => ({ ...j }));
  }

  /** Agrupa por funcionário, com totais; ordena por horas (desc). */
  porFuncionario(): ResumoFuncionario[] {
    const mapa = new Map<string, Jornada[]>();
    for (const j of this.itens) {
      const arr = mapa.get(j.funcionario) ?? [];
      arr.push(j);
      mapa.set(j.funcionario, arr);
    }
    const res: ResumoFuncionario[] = [];
    for (const [funcionario, js] of mapa) {
      const dias = new Set(js.map((j) => j.data)).size;
      const minutos = js.reduce((a, j) => a + j.duracaoMin, 0);
      const pagos = js.filter((j) => j.pago).length;
      const jornadas = [...js].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
      res.push({ funcionario, dias, minutos, servicos: js.length, pagos, aPagar: js.length - pagos, jornadas });
    }
    res.sort((a, b) => b.minutos - a.minutos);
    return res;
  }

  /** Total de "pessoa-dias" (pares distintos funcionário+data). */
  totalDias(): number {
    return new Set(this.itens.map((j) => `${j.funcionario}|${j.data}`)).size;
  }

  totalMinutos(): number {
    return this.itens.reduce((a, j) => a + j.duracaoMin, 0);
  }

  totalFuncionarios(): number {
    return new Set(this.itens.map((j) => j.funcionario)).size;
  }

  totalPagos(): number {
    return this.itens.filter((j) => j.pago).length;
  }

  totalApagar(): number {
    return this.itens.filter((j) => !j.pago).length;
  }
}
