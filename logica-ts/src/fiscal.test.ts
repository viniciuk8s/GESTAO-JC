import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusObrigacao,
  resumoFiscal,
  validarObrigacao,
  type ObrigacaoFiscal,
  type NovaObrigacao,
} from './fiscal.ts';

const HOJE = '2026-07-23';

function ob(over: Partial<ObrigacaoFiscal> = {}): ObrigacaoFiscal {
  return {
    id: 'of_1',
    tipo: 'das',
    descricao: 'DAS — Simples Nacional',
    competencia: '2026-07',
    vencimento: '2026-08-20',
    valorCentavos: 418000,
    pago: false,
    ...over,
  };
}

test('statusObrigacao: paga', () => {
  assert.equal(statusObrigacao(ob({ pago: true, vencimento: '2026-07-01' }), HOJE), 'pago');
});

test('statusObrigacao: não paga e vencida', () => {
  assert.equal(statusObrigacao(ob({ pago: false, vencimento: '2026-07-07' }), HOJE), 'vencido');
});

test('statusObrigacao: não paga e futura => a pagar', () => {
  assert.equal(statusObrigacao(ob({ pago: false, vencimento: '2026-08-20' }), HOJE), 'a_pagar');
});

test('statusObrigacao: vence hoje ainda é a pagar (não vencido)', () => {
  assert.equal(statusObrigacao(ob({ pago: false, vencimento: HOJE }), HOJE), 'a_pagar');
});

test('resumoFiscal soma por status e acha o próximo a vencer', () => {
  const lista: ObrigacaoFiscal[] = [
    ob({ id: 'a', vencimento: '2026-08-20', valorCentavos: 418000, pago: false }), // a pagar
    ob({ id: 'b', vencimento: '2026-08-15', valorCentavos: 89000, pago: false }), // a pagar (mais cedo)
    ob({ id: 'c', vencimento: '2026-07-07', valorCentavos: 57000, pago: false }), // vencido
    ob({ id: 'd', vencimento: '2026-06-20', valorCentavos: 120000, pago: true }), // pago
  ];
  const r = resumoFiscal(lista, HOJE);
  assert.equal(r.aPagarCentavos, 418000 + 89000 + 57000); // todas não pagas
  assert.equal(r.vencidoCentavos, 57000);
  assert.equal(r.pagoCentavos, 120000);
  assert.equal(r.proximoVencimento?.id, 'c'); // menor vencimento entre as não pagas
});

test('resumoFiscal sem obrigações zera tudo', () => {
  const r = resumoFiscal([], HOJE);
  assert.deepEqual(r, { aPagarCentavos: 0, vencidoCentavos: 0, pagoCentavos: 0, proximoVencimento: null });
});

test('validarObrigacao aceita uma guia correta', () => {
  const nova: NovaObrigacao = {
    tipo: 'iss',
    descricao: 'ISS — serviços',
    competencia: '2026-07',
    vencimento: '2026-08-15',
    valorCentavos: 89000,
    pago: false,
  };
  assert.equal(validarObrigacao(nova).ok, true);
});

test('validarObrigacao recusa competência e valor inválidos', () => {
  const r = validarObrigacao({
    tipo: 'das',
    descricao: 'x',
    competencia: '07/2026', // formato errado
    vencimento: '2026-08-15',
    valorCentavos: -1,
    pago: false,
  });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('Competência')));
  assert.ok(r.erros.some((e) => e.includes('Valor')));
});
