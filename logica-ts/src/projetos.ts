/**
 * Domínio de Projetos (obras) — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Um projeto é a OBRA de um cliente (ex.: a instalação solar do Condomínio
 * Vila Verde). Serve de guarda-chuva: agrega os agendamentos, documentos e
 * movimentações daquela obra, com status, progresso e um resumo financeiro.
 * Lógica pura e testável. Dinheiro sempre em centavos (inteiro).
 */
import { ehDataValida } from './agendamentos.ts';
import type { Servico } from './agendamentos.ts';
import type { Documento } from './documentos.ts';
import type { Movimentacao } from './movimentacoes.ts';

export type TipoProjeto =
  | 'instalacao_solar'
  | 'projeto_fotovoltaico'
  | 'manutencao'
  | 'eletrica_predial'
  | 'vistoria'
  | 'outro';

export type StatusProjeto = 'orcamento' | 'em_andamento' | 'concluido' | 'cancelado';

const TIPOS: readonly TipoProjeto[] = [
  'instalacao_solar', 'projeto_fotovoltaico', 'manutencao', 'eletrica_predial', 'vistoria', 'outro',
];
const STATUS: readonly StatusProjeto[] = ['orcamento', 'em_andamento', 'concluido', 'cancelado'];

export interface Projeto {
  readonly id: string;
  nome: string; // ex.: 'Instalação solar — Cond. Vila Verde'
  cliente: string; // usado para vincular agendamentos/documentos pela obra
  tipo: TipoProjeto;
  status: StatusProjeto;
  responsavel: string; // técnico responsável
  endereco?: string;
  valorContratadoCentavos: number; // >= 0
  inicio?: string; // 'YYYY-MM-DD'
  previsao?: string; // 'YYYY-MM-DD' — previsão de término
  progresso: number; // 0..100
  obs?: string;
  criadoEm: string; // 'YYYY-MM-DD'
}

/** Campos de um projeto novo (id e criadoEm gerados pelo repo). */
export type NovoProjeto = Omit<Projeto, 'id' | 'criadoEm'>;
/** Campos editáveis num update. */
export type PatchProjeto = Partial<NovoProjeto>;

export interface ResultadoValidacao {
  readonly ok: boolean;
  readonly erros: string[];
}

/** Valida um projeto (novo ou proposto) campo a campo. */
export function validarProjeto(p: NovoProjeto): ResultadoValidacao {
  const erros: string[] = [];
  if (!p || typeof p !== 'object') return { ok: false, erros: ['Dados inválidos.'] };
  if (typeof p.nome !== 'string' || p.nome.trim() === '') erros.push('Informe o nome do projeto.');
  if (typeof p.cliente !== 'string' || p.cliente.trim() === '') erros.push('Informe o cliente / obra.');
  if (!TIPOS.includes(p.tipo)) erros.push('Tipo de projeto inválido.');
  if (!STATUS.includes(p.status)) erros.push('Status inválido.');
  if (typeof p.responsavel !== 'string' || p.responsavel.trim() === '') erros.push('Informe o responsável.');
  if (!Number.isInteger(p.valorContratadoCentavos) || p.valorContratadoCentavos < 0) {
    erros.push('Valor contratado inválido.');
  }
  if (!Number.isInteger(p.progresso) || p.progresso < 0 || p.progresso > 100) {
    erros.push('Progresso deve ficar entre 0 e 100.');
  }
  if (p.inicio != null && p.inicio !== '' && !ehDataValida(p.inicio)) erros.push('Data de início inválida.');
  if (p.previsao != null && p.previsao !== '' && !ehDataValida(p.previsao)) erros.push('Previsão de término inválida.');
  if (p.inicio && p.previsao && ehDataValida(p.inicio) && ehDataValida(p.previsao) && p.previsao < p.inicio) {
    erros.push('Previsão de término é antes do início.');
  }
  return { ok: erros.length === 0, erros };
}

/** Entidades vinculadas a uma obra (para o resumo 360°). */
export interface Vinculados {
  agendamentos?: readonly Servico[];
  documentos?: readonly Documento[];
  movimentacoes?: readonly Movimentacao[];
}

export interface ResumoProjeto {
  contratadoCentavos: number; // valor fechado da obra
  recebidoCentavos: number; // entradas já pagas
  aReceberCentavos: number; // entradas pendentes/agendadas
  custoCentavos: number; // saídas (compras, folha, etc.)
  saldoCentavos: number; // recebido − custo (caixa da obra)
  nAgendamentos: number;
  nConcluidos: number;
  nDocumentos: number;
}

/** Resumo financeiro + contagens de uma obra a partir do que está vinculado a ela. */
export function resumoProjeto(p: Projeto, v: Vinculados = {}): ResumoProjeto {
  const ags = v.agendamentos ?? [];
  const docs = v.documentos ?? [];
  const movs = v.movimentacoes ?? [];

  let recebidoCentavos = 0;
  let aReceberCentavos = 0;
  let custoCentavos = 0;
  for (const m of movs) {
    if (m.tipo === 'entrada') {
      if (m.situacao === 'pago') recebidoCentavos += m.valorCentavos;
      else aReceberCentavos += m.valorCentavos;
    } else {
      custoCentavos += m.valorCentavos;
    }
  }

  return {
    contratadoCentavos: p.valorContratadoCentavos,
    recebidoCentavos,
    aReceberCentavos,
    custoCentavos,
    saldoCentavos: recebidoCentavos - custoCentavos,
    nAgendamentos: ags.length,
    nConcluidos: ags.filter((s) => s.situacao === 'concluido').length,
    nDocumentos: docs.length,
  };
}

/** Progresso sugerido pela proporção de serviços concluídos (0..100). Útil como dica na UI. */
export function progressoSugerido(ags: readonly Servico[]): number {
  if (ags.length === 0) return 0;
  const concluidos = ags.filter((s) => s.situacao === 'concluido').length;
  return Math.round((concluidos / ags.length) * 100);
}
