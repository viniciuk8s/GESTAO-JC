/**
 * Domínio Fiscal — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Guias de impostos / obrigações fiscais (aba Fiscal): DAS do Simples
 * Nacional, ISS, INSS, FGTS, IRPJ. Lógica pura: status de cada guia em
 * relação a hoje (a pagar / paga / vencida) e o resumo do período
 * (total a pagar, vencido, pago e a próxima a vencer). Dinheiro em centavos.
 */
import { ehDataValida } from './agendamentos.ts';

export type TipoImposto = 'das' | 'iss' | 'inss' | 'fgts' | 'irpj' | 'outro';
export type StatusObrigacao = 'a_pagar' | 'pago' | 'vencido';

const TIPOS: readonly TipoImposto[] = ['das', 'iss', 'inss', 'fgts', 'irpj', 'outro'];
const RE_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface ObrigacaoFiscal {
  readonly id: string;
  tipo: TipoImposto;
  descricao: string;
  competencia: string; // 'YYYY-MM'
  vencimento: string; // 'YYYY-MM-DD'
  valorCentavos: number;
  pago: boolean;
  guiaDocId?: string; // id do documento (guia) vinculado
}

/** Campos de uma obrigação nova (id gerado pelo repo). */
export type NovaObrigacao = Omit<ObrigacaoFiscal, 'id'>;

/**
 * Status de uma guia em relação a `hoje` ('YYYY-MM-DD'):
 * paga → 'pago'; não paga e vencida → 'vencido'; senão → 'a_pagar'.
 * A comparação lexicográfica é segura para datas 'YYYY-MM-DD'.
 */
export function statusObrigacao(o: Pick<ObrigacaoFiscal, 'vencimento' | 'pago'>, hoje: string): StatusObrigacao {
  if (o.pago) return 'pago';
  return o.vencimento < hoje ? 'vencido' : 'a_pagar';
}

export interface ResumoFiscal {
  aPagarCentavos: number; // soma das não pagas (inclui vencidas)
  vencidoCentavos: number; // soma das vencidas e não pagas
  pagoCentavos: number; // soma das pagas
  proximoVencimento: ObrigacaoFiscal | null; // guia não paga com menor vencimento
}

/** Resumo do período a partir das obrigações. */
export function resumoFiscal(obrigacoes: readonly ObrigacaoFiscal[], hoje: string): ResumoFiscal {
  let aPagarCentavos = 0;
  let vencidoCentavos = 0;
  let pagoCentavos = 0;
  let proximo: ObrigacaoFiscal | null = null;

  for (const o of obrigacoes) {
    const st = statusObrigacao(o, hoje);
    if (st === 'pago') {
      pagoCentavos += o.valorCentavos;
      continue;
    }
    aPagarCentavos += o.valorCentavos;
    if (st === 'vencido') vencidoCentavos += o.valorCentavos;
    if (proximo === null || o.vencimento < proximo.vencimento) proximo = o;
  }

  return { aPagarCentavos, vencidoCentavos, pagoCentavos, proximoVencimento: proximo };
}

export interface ResultadoValidacao {
  readonly ok: boolean;
  readonly erros: string[];
}

/** Valida os campos de uma obrigação nova. */
export function validarObrigacao(o: NovaObrigacao): ResultadoValidacao {
  const erros: string[] = [];
  if (!o || typeof o !== 'object') return { ok: false, erros: ['Dados inválidos.'] };
  if (!TIPOS.includes(o.tipo)) erros.push('Tipo de imposto inválido.');
  if (typeof o.descricao !== 'string' || o.descricao.trim() === '') erros.push('Informe a descrição.');
  if (!RE_COMPETENCIA.test(o.competencia)) erros.push('Competência inválida (use AAAA-MM).');
  if (!ehDataValida(o.vencimento)) erros.push('Vencimento inválido.');
  if (!Number.isInteger(o.valorCentavos) || o.valorCentavos < 0) erros.push('Valor inválido.');
  return { ok: erros.length === 0, erros };
}
