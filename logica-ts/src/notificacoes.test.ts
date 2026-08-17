import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarNotificacoes,
  resumoNotificacoes,
  aplicarEstado,
  resumoComEstado,
  type FontesNotificacao,
  type ServicoNotif,
  type ObrigacaoNotif,
  type DocumentoNotif,
} from './notificacoes.ts';

const HOJE = '2026-07-22';

function srv(over: Partial<ServicoNotif> = {}): ServicoNotif {
  return { id: '1', data: '2026-07-22', inicio: '09:00', titulo: 'Instalação solar', cliente: 'Cond. Vila Verde', situacao: 'confirmado', valorCentavos: 1250000, ...over };
}
function imp(over: Partial<ObrigacaoNotif> = {}): ObrigacaoNotif {
  return { id: '1', descricao: 'DAS — Simples Nacional', vencimento: '2026-07-25', valorCentavos: 418000, pago: false, ...over };
}
function doc(over: Partial<DocumentoNotif> = {}): DocumentoNotif {
  return { id: '1', titulo: 'Laudo técnico / ART-CREA', vencimento: '2026-07-27', vinculoLabel: 'Padaria Pão Quente', ...over };
}

test('serviço de hoje é crítico com dias=0', () => {
  const [n] = montarNotificacoes({ agendamentos: [srv({ data: HOJE })] }, HOJE);
  assert.equal(n?.tipo, 'servico');
  assert.equal(n?.severidade, 'critico');
  assert.equal(n?.dias, 0);
  assert.equal(n?.href, 'agendamentos.html');
  assert.equal(n?.valorCentavos, 1250000);
});

test('serviço amanhã = atenção; em 2 dias = info; em 5 dias (fora da janela) some', () => {
  const amanha = montarNotificacoes({ agendamentos: [srv({ data: '2026-07-23' })] }, HOJE);
  assert.equal(amanha[0]?.severidade, 'atencao');
  const doisDias = montarNotificacoes({ agendamentos: [srv({ data: '2026-07-24' })] }, HOJE);
  assert.equal(doisDias[0]?.severidade, 'info');
  const longe = montarNotificacoes({ agendamentos: [srv({ data: '2026-07-27' })] }, HOJE);
  assert.equal(longe.length, 0);
});

test('serviço atrasado (não concluído no passado) é crítico com dias negativo', () => {
  const [n] = montarNotificacoes({ agendamentos: [srv({ data: '2026-07-20', situacao: 'confirmado' })] }, HOJE);
  assert.equal(n?.severidade, 'critico');
  assert.equal(n?.dias, -2);
});

test('serviço concluído ou cancelado não gera notificação', () => {
  const ns = montarNotificacoes({ agendamentos: [srv({ situacao: 'concluido' }), srv({ id: '2', situacao: 'cancelado' })] }, HOJE);
  assert.equal(ns.length, 0);
});

test('serviço pendente marca "a confirmar" na descrição', () => {
  const [n] = montarNotificacoes({ agendamentos: [srv({ situacao: 'pendente' })] }, HOJE);
  assert.match(n!.descricao, /a confirmar/);
});

test('imposto vencido é crítico; vencendo em 1 dia = atenção; pago é ignorado', () => {
  const vencido = montarNotificacoes({ obrigacoes: [imp({ vencimento: '2026-07-19' })] }, HOJE);
  assert.equal(vencido[0]?.tipo, 'pagamento');
  assert.equal(vencido[0]?.severidade, 'critico');
  const perto = montarNotificacoes({ obrigacoes: [imp({ vencimento: '2026-07-23' })] }, HOJE);
  assert.equal(perto[0]?.severidade, 'atencao');
  const pago = montarNotificacoes({ obrigacoes: [imp({ pago: true, vencimento: '2026-07-19' })] }, HOJE);
  assert.equal(pago.length, 0);
});

test('imposto distante (fora da janela de pagamento) não aparece', () => {
  const ns = montarNotificacoes({ obrigacoes: [imp({ vencimento: '2026-08-30' })] }, HOJE);
  assert.equal(ns.length, 0);
});

test('documento: vencendo em 5 dias = atenção; sem vencimento é ignorado; vencido = crítico', () => {
  const perto = montarNotificacoes({ documentos: [doc({ vencimento: '2026-07-27' })] }, HOJE);
  assert.equal(perto[0]?.tipo, 'documento');
  assert.equal(perto[0]?.severidade, 'atencao');
  const semData = montarNotificacoes({ documentos: [{ id: '9', titulo: 'Contrato sem validade', vinculoLabel: 'X' }] }, HOJE);
  assert.equal(semData.length, 0);
  const vencido = montarNotificacoes({ documentos: [doc({ vencimento: '2026-07-10' })] }, HOJE);
  assert.equal(vencido[0]?.severidade, 'critico');
});

test('dias trabalhados a pagar viram uma notificação agregada', () => {
  const fontes: FontesNotificacao = { jornadas: [
    { id: 'a', funcionario: 'Carlos', pago: false },
    { id: 'b', funcionario: 'Maria', pago: false },
    { id: 'c', funcionario: 'João', pago: true },
  ] };
  const ns = montarNotificacoes(fontes, HOJE);
  assert.equal(ns.length, 1);
  assert.equal(ns[0]?.tipo, 'pagamento');
  assert.match(ns[0]!.titulo, /2 dias trabalhados a pagar/);
  assert.equal(ns[0]?.href, 'dias-trabalhados.html');
});

test('ordena por severidade e depois por urgência (mais atrasado primeiro)', () => {
  const ns = montarNotificacoes({
    agendamentos: [srv({ id: 's-info', data: '2026-07-24' })],          // info
    obrigacoes: [imp({ id: 'i-venc', vencimento: '2026-07-18' })],       // crítico (-4)
    documentos: [doc({ id: 'd-crit', vencimento: '2026-07-21' })],       // crítico (-1)
  }, HOJE);
  assert.equal(ns[0]?.severidade, 'critico');
  assert.equal(ns[0]?.dias, -4);                 // o mais atrasado vem antes
  assert.equal(ns[1]?.severidade, 'critico');
  assert.equal(ns[1]?.dias, -1);
  assert.equal(ns[ns.length - 1]?.severidade, 'info');
});

test('resumoNotificacoes conta total, críticos e por tipo', () => {
  const ns = montarNotificacoes({
    agendamentos: [srv({ data: HOJE })],                                 // crítico · servico
    obrigacoes: [imp({ vencimento: '2026-07-25' }), imp({ id: '2', vencimento: '2026-07-18' })], // info + crítico · pagamento
    jornadas: [{ id: 'a', funcionario: 'Carlos', pago: false }],         // atenção · pagamento
  }, HOJE);
  const r = resumoNotificacoes(ns);
  assert.equal(r.total, 4);
  assert.equal(r.criticos, 2);
  assert.equal(r.porTipo.servico, 1);
  assert.equal(r.porTipo.pagamento, 3);
  assert.equal(r.porTipo.documento, 0);
});

test('janelas configuráveis alteram o que entra', () => {
  const base: FontesNotificacao = { agendamentos: [srv({ data: '2026-07-27' })] }; // +5 dias
  assert.equal(montarNotificacoes(base, HOJE).length, 0);                          // janela padrão 3
  assert.equal(montarNotificacoes(base, HOJE, { janelaServicoDias: 7 }).length, 1); // janela 7 inclui
});

test('aplicarEstado remove dispensadas e marca lidas', () => {
  const base = montarNotificacoes({
    agendamentos: [srv({ id: 'a', data: HOJE }), srv({ id: 'b', data: HOJE }), srv({ id: 'c', data: HOJE })],
  }, HOJE);
  // ids: srv_a, srv_b, srv_c
  const estados = { srv_a: { lida: true }, srv_b: { dispensada: true } };
  const vis = aplicarEstado(base, estados);
  assert.equal(vis.length, 2);                                   // b dispensada saiu
  assert.equal(vis.find((n) => n.id === 'srv_a')?.lida, true);   // a marcada lida
  assert.equal(vis.find((n) => n.id === 'srv_c')?.lida, false);  // c continua não lida
  assert.equal(vis.some((n) => n.id === 'srv_b'), false);
});

test('resumoComEstado: badge conta só não lidas; críticos só os não lidos', () => {
  const base = montarNotificacoes({
    agendamentos: [srv({ id: 'a', data: HOJE }), srv({ id: 'b', data: HOJE })], // 2 críticos
    documentos: [doc({ id: 'd', vencimento: '2026-08-15' })],                    // 1 info
  }, HOJE);
  const vis = aplicarEstado(base, { srv_a: { lida: true } }); // marca 1 crítico como lido
  const r = resumoComEstado(vis);
  assert.equal(r.total, 3);        // nada dispensado
  assert.equal(r.naoLidas, 2);     // srv_b + doc_d
  assert.equal(r.criticos, 1);     // só srv_b (crítico não lido)
});
