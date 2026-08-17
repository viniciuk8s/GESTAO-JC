/**
 * Central de notificações — lógica pura e testável.
 *
 * Agrega, a partir das fontes já existentes no sistema, as pendências que
 * merecem atenção do gestor e as classifica por severidade:
 *   - serviços (agendamentos) próximos, de hoje, ou atrasados/a confirmar;
 *   - pagamentos: impostos vencendo/vencidos + dias trabalhados a pagar;
 *   - documentos com validade/vencimento próximo.
 *
 * Não acessa banco nem rede: recebe os dados e "hoje" (YYYY-MM-DD) e devolve a
 * lista ordenada + o resumo para o contador do sino. Dinheiro em centavos.
 */

export type NotifTipo = 'servico' | 'pagamento' | 'documento';
export type NotifSeveridade = 'critico' | 'atencao' | 'info';

export interface Notificacao {
  id: string;
  tipo: NotifTipo;
  severidade: NotifSeveridade;
  titulo: string;
  descricao: string;
  data: string;   // YYYY-MM-DD da data relevante (agendamento/vencimento)
  dias: number;   // dias de hoje até `data` (negativo = atrasado; 0 = hoje)
  href: string;   // página de destino ao clicar
  valorCentavos?: number;
}

// ---- fontes (formas mínimas — desacopladas dos tipos de domínio completos) ----
export interface ServicoNotif { id: string; data: string; inicio?: string; titulo: string; cliente: string; situacao: string; valorCentavos?: number; }
export interface ObrigacaoNotif { id: string; descricao: string; vencimento: string; valorCentavos: number; pago: boolean; }
export interface DocumentoNotif { id: string; titulo: string; vencimento?: string; vinculoLabel?: string; }
export interface JornadaNotif { id: string; funcionario: string; pago: boolean; }

export interface FontesNotificacao {
  agendamentos?: readonly ServicoNotif[];
  obrigacoes?: readonly ObrigacaoNotif[];
  documentos?: readonly DocumentoNotif[];
  jornadas?: readonly JornadaNotif[];
}

export interface OpcoesNotif {
  janelaServicoDias?: number;   // serviços dentro dos próximos N dias (padrão 3)
  janelaPagamentoDias?: number; // impostos vencendo em N dias (padrão 7)
  janelaDocDias?: number;       // documentos vencendo em N dias (padrão 30)
  agora?: string;               // data+hora reais 'YYYY-MM-DDTHH:MM' → lembrete de serviço faltando ≤24h
}

export interface ResumoNotificacoes {
  total: number;
  criticos: number;
  porTipo: Record<NotifTipo, number>;
}

// ---- utilidades de data (UTC → sem surpresa de fuso) ----
function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 1, Number(de.slice(8, 10)));
  const b = Date.UTC(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)) - 1, Number(ate.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** Minutos entre dois 'YYYY-MM-DDTHH:MM' (ambos no mesmo fuso → diferença exata). */
function minutosEntre(de: string, ate: string): number {
  const p = (s: string): number => {
    const parts = s.split('T');
    const d = parts[0] ?? s;
    const hm = (parts[1] ?? '00:00').split(':');
    return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), Number(hm[0] ?? 0), Number(hm[1] ?? 0));
  };
  return Math.round((p(ate) - p(de)) / 60_000);
}

/** Rótulo de "quanto falta" a partir de minutos (positivo = futuro). '' se ≥24h. */
function rotuloFalta(min: number): string {
  if (min < 0) { const a = -min; return a < 60 ? `começou há ${a} min` : `atrasado ${Math.floor(a / 60)}h`; }
  if (min === 0) return 'agora';
  if (min < 60) return `faltam ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (min < 24 * 60) return m ? `faltam ${h}h ${m}min` : `faltam ${h}h`;
  return '';
}

const ORDEM_SEV: Record<NotifSeveridade, number> = { critico: 0, atencao: 1, info: 2 };

/**
 * Monta a lista de notificações ordenada por severidade e urgência.
 */
export function montarNotificacoes(fontes: FontesNotificacao, hoje: string, opts: OpcoesNotif = {}): Notificacao[] {
  const janelaServico = opts.janelaServicoDias ?? 3;
  const janelaPagamento = opts.janelaPagamentoDias ?? 7;
  const janelaDoc = opts.janelaDocDias ?? 30;
  const out: Notificacao[] = [];

  // 1) Serviços (agendamentos): não concluídos/cancelados, dentro da janela ou atrasados.
  //    Comparação em TEMPO REAL (data + hora) → destaca serviços faltando ≤24h.
  const agora = opts.agora;
  for (const s of fontes.agendamentos ?? []) {
    if (s.situacao === 'concluido' || s.situacao === 'cancelado') continue;
    const dias = diasEntre(hoje, s.data);
    if (dias > janelaServico) continue; // ainda distante
    const partes = [s.cliente];
    if (s.inicio) partes.push(s.inicio);
    if (s.situacao === 'pendente') partes.push('a confirmar');
    let id = `srv_${s.id}`;
    let severidade: NotifSeveridade = dias <= 0 ? 'critico' : dias <= 1 ? 'atencao' : 'info';
    if (agora) {
      const min = minutosEntre(agora, `${s.data}T${s.inicio || '00:00'}`);
      if (min <= 24 * 60) {
        // faltando 24h ou menos (ou já na hora/atrasado): lembrete destacado, com id
        // próprio para disparar um aviso NOVO ao entrar nessa janela.
        id = `srv24_${s.id}`;
        severidade = min <= 120 ? 'critico' : 'atencao';
        const rot = rotuloFalta(min);
        if (rot) partes.push(rot);
      }
    }
    const n: Notificacao = {
      id, tipo: 'servico', severidade,
      titulo: s.titulo, descricao: partes.join(' · '),
      data: s.data, dias, href: 'agendamentos.html',
    };
    if (typeof s.valorCentavos === 'number' && s.valorCentavos > 0) n.valorCentavos = s.valorCentavos;
    out.push(n);
  }

  // 2) Pagamentos — impostos/obrigações fiscais não pagas: vencidas ou vencendo na janela
  for (const o of fontes.obrigacoes ?? []) {
    if (o.pago) continue;
    const dias = diasEntre(hoje, o.vencimento);
    if (dias > janelaPagamento) continue;
    const severidade: NotifSeveridade = dias < 0 ? 'critico' : dias <= 2 ? 'atencao' : 'info';
    out.push({
      id: `imp_${o.id}`, tipo: 'pagamento', severidade,
      titulo: o.descricao, descricao: 'Imposto / obrigação fiscal',
      data: o.vencimento, dias, href: 'relatorios.html', valorCentavos: o.valorCentavos,
    });
  }

  // 3) Documentos com vencimento próximo (ou vencidos) dentro da janela
  for (const d of fontes.documentos ?? []) {
    if (!d.vencimento) continue;
    const dias = diasEntre(hoje, d.vencimento);
    if (dias > janelaDoc) continue;
    const severidade: NotifSeveridade = dias < 0 ? 'critico' : dias <= 7 ? 'atencao' : 'info';
    out.push({
      id: `doc_${d.id}`, tipo: 'documento', severidade,
      titulo: d.titulo, descricao: d.vinculoLabel ? `${d.vinculoLabel} · documento` : 'Documento',
      data: d.vencimento, dias, href: 'relatorios.html',
    });
  }

  // 4) Pagamentos — dias trabalhados a pagar (agregado, para não poluir)
  const aPagar = (fontes.jornadas ?? []).filter((j) => !j.pago);
  if (aPagar.length > 0) {
    out.push({
      id: 'jorn_apagar', tipo: 'pagamento', severidade: 'atencao',
      titulo: `${aPagar.length} ${aPagar.length === 1 ? 'dia trabalhado a pagar' : 'dias trabalhados a pagar'}`,
      descricao: 'Pagamento da equipe pendente',
      data: hoje, dias: 0, href: 'dias-trabalhados.html',
    });
  }

  out.sort((a, b) => (ORDEM_SEV[a.severidade] - ORDEM_SEV[b.severidade]) || (a.dias - b.dias) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  return out;
}

/** Resumo para o contador do sino (total, quantos críticos, por tipo). */
export function resumoNotificacoes(ns: readonly Notificacao[]): ResumoNotificacoes {
  const porTipo: Record<NotifTipo, number> = { servico: 0, pagamento: 0, documento: 0 };
  let criticos = 0;
  for (const n of ns) {
    porTipo[n.tipo] += 1;
    if (n.severidade === 'critico') criticos += 1;
  }
  return { total: ns.length, criticos, porTipo };
}

// ---- estado por usuário: lida / dispensada (persistente) --------------------
export interface EstadoNotif { lida?: boolean; dispensada?: boolean; }
export interface NotificacaoComEstado extends Notificacao { lida: boolean; }
export interface ResumoComEstado {
  total: number;      // visíveis (não dispensadas)
  naoLidas: number;   // visíveis e não lidas → é o número do badge
  criticos: number;   // críticos ainda não lidos (cor do badge)
  porTipo: Record<NotifTipo, number>;
}

/** Remove as dispensadas e marca `lida` nas demais, a partir do estado do usuário. */
export function aplicarEstado(ns: readonly Notificacao[], estados: Record<string, EstadoNotif>): NotificacaoComEstado[] {
  const out: NotificacaoComEstado[] = [];
  for (const n of ns) {
    const e = estados[n.id];
    if (e?.dispensada) continue;
    out.push({ ...n, lida: !!e?.lida });
  }
  return out;
}

/** Resumo considerando o estado: badge = não lidas; cor = críticos não lidos. */
export function resumoComEstado(ns: readonly NotificacaoComEstado[]): ResumoComEstado {
  const porTipo: Record<NotifTipo, number> = { servico: 0, pagamento: 0, documento: 0 };
  let naoLidas = 0;
  let criticos = 0;
  for (const n of ns) {
    porTipo[n.tipo] += 1;
    if (!n.lida) {
      naoLidas += 1;
      if (n.severidade === 'critico') criticos += 1;
    }
  }
  return { total: ns.length, naoLidas, criticos, porTipo };
}
