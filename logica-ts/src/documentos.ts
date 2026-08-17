/**
 * Domínio de Documentos — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Central de documentos da empresa (contratos, notas fiscais, garantias,
 * laudos/ART, homologações, recibos, notas de compra e RH). Lógica pura e
 * testável: validação e controle de **validade/vencimento** (o que dispara
 * o alerta de "documentos a vencer"). O I/O (upload + banco) fica no repo.
 */
import { ehDataValida } from './agendamentos.ts';

export type TipoDocumento =
  | 'contrato'
  | 'nota_fiscal'
  | 'garantia'
  | 'laudo'
  | 'homologacao'
  | 'recibo'
  | 'compra'
  | 'rh';

export type VinculoTipo = 'cliente' | 'servico' | 'colaborador' | 'fornecedor' | 'geral';

/** Rótulo manual de situação (quando não deriva do vencimento). */
export type SituacaoManual = 'aprovado' | 'pago' | 'emitida';

const TIPOS: readonly TipoDocumento[] = ['contrato', 'nota_fiscal', 'garantia', 'laudo', 'homologacao', 'recibo', 'compra', 'rh'];
const VINCULOS: readonly VinculoTipo[] = ['cliente', 'servico', 'colaborador', 'fornecedor', 'geral'];
const SITUACOES: readonly SituacaoManual[] = ['aprovado', 'pago', 'emitida'];

export interface Documento {
  readonly id: string;
  tipo: TipoDocumento;
  titulo: string;
  arquivo?: string; // caminho servido pela API (/uploads/docs/...)
  formato?: string; // pdf|jpg|docx|xlsx
  tamanhoBytes?: number;
  vinculoTipo: VinculoTipo;
  vinculoId?: string;
  vinculoLabel?: string;
  emissao?: string; // 'YYYY-MM-DD'
  vencimento?: string; // 'YYYY-MM-DD'
  valorCentavos?: number;
  situacao?: SituacaoManual;
  obs?: string;
  projetoId?: string; // id da obra (vínculo estável); resolvido do vinculoLabel ao gravar
  criadoEm: string; // 'YYYY-MM-DD'
}

/** Campos de um documento novo (id e criadoEm são gerados pelo repo). */
export type NovoDocumento = Omit<Documento, 'id' | 'criadoEm'>;

// ------------------------------------------------------------------
// Datas (dias inteiros, sem depender de fuso — 'hoje' é sempre injetado)
// ------------------------------------------------------------------

/** 'YYYY-MM-DD' -> número de dias epoch (UTC). Assume data já validada. */
function emDias(data: string): number {
  const [a, m, d] = data.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(a, m - 1, d) / 86_400_000);
}

/** Dias de `de` até `ate` (ate - de). Negativo se `ate` for anterior. */
export function diasEntre(de: string, ate: string): number {
  return emDias(ate) - emDias(de);
}

// ------------------------------------------------------------------
// Validade / vencimento
// ------------------------------------------------------------------

export type ValidadeTipo = 'vigente' | 'vence' | 'vencido' | 'sem-validade';

export interface Validade {
  readonly tipo: ValidadeTipo;
  readonly dias: number | null; // dias até vencer (negativo = já venceu); null se sem vencimento
}

/**
 * Situação de validade de um documento em relação a `hoje`.
 * - sem vencimento           → 'sem-validade'
 * - vencimento já passou      → 'vencido'
 * - vence dentro de `limite`  → 'vence'  (alerta)
 * - senão                     → 'vigente'
 */
export function validadeDoc(doc: Pick<Documento, 'vencimento'>, hoje: string, limiteDias = 30): Validade {
  if (!doc.vencimento) return { tipo: 'sem-validade', dias: null };
  const dias = diasEntre(hoje, doc.vencimento);
  if (dias < 0) return { tipo: 'vencido', dias };
  if (dias <= limiteDias) return { tipo: 'vence', dias };
  return { tipo: 'vigente', dias };
}

/**
 * Documentos que vencem nos próximos `dias` (inclui os já vencidos por padrão),
 * ordenados do mais urgente para o menos urgente. É o que alimenta o alerta.
 */
export function documentosAVencer(
  docs: readonly Documento[],
  hoje: string,
  dias = 30,
  incluirVencidos = true,
): Documento[] {
  return docs
    .filter((d) => {
      if (!d.vencimento) return false;
      const restante = diasEntre(hoje, d.vencimento);
      if (restante < 0) return incluirVencidos;
      return restante <= dias;
    })
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : a.vencimento! > b.vencimento! ? 1 : 0));
}

// ------------------------------------------------------------------
// Validação
// ------------------------------------------------------------------

export interface ResultadoValidacao {
  readonly ok: boolean;
  readonly erros: string[];
}

/** Valida os campos de um documento novo. */
export function validarDocumento(doc: NovoDocumento): ResultadoValidacao {
  const erros: string[] = [];
  if (!doc || typeof doc !== 'object') return { ok: false, erros: ['Dados inválidos.'] };
  if (!TIPOS.includes(doc.tipo)) erros.push('Tipo de documento inválido.');
  if (typeof doc.titulo !== 'string' || doc.titulo.trim() === '') erros.push('Informe o título do documento.');
  if (!VINCULOS.includes(doc.vinculoTipo)) erros.push('Vínculo inválido.');
  if (doc.emissao !== undefined && !ehDataValida(doc.emissao)) erros.push('Data de emissão inválida.');
  if (doc.vencimento !== undefined && !ehDataValida(doc.vencimento)) erros.push('Data de vencimento inválida.');
  if (doc.valorCentavos !== undefined && (!Number.isInteger(doc.valorCentavos) || doc.valorCentavos < 0)) {
    erros.push('Valor inválido.');
  }
  if (doc.tamanhoBytes !== undefined && (!Number.isInteger(doc.tamanhoBytes) || doc.tamanhoBytes < 0)) {
    erros.push('Tamanho de arquivo inválido.');
  }
  if (doc.situacao !== undefined && !SITUACOES.includes(doc.situacao)) erros.push('Situação inválida.');
  return { ok: erros.length === 0, erros };
}
