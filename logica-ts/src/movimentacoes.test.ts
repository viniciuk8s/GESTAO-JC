import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarMovimentacao,
  resumoMovimentacoes,
  comSaldoAcumulado,
  type Movimentacao,
  type NovaMovimentacao,
} from './movimentacoes.ts';

function mov(over: Partial<Movimentacao> = {}): Movimentacao {
  return {
    id: 'mv_1',
    data: '2026-07-22',
    descricao: 'Instalação solar',
    categoria: 'Instalação solar',
    tipo: 'entrada',
    forma: 'pix',
    valorCentavos: 1250000,
    situacao: 'pago',
    recorrente: false,
    ...over,
  };
}

test('validarMovimentacao aceita um lançamento correto', () => {
  const novo: NovaMovimentacao = {
    data: '2026-07-22', descricao: 'Compra de cabos', categoria: 'Fornecedores',
    tipo: 'saida', forma: 'boleto', valorCentavos: 420000, situacao: 'pago', recorrente: false,
  };
  assert.equal(validarMovimentacao(novo).ok, true);
});

test('validarMovimentacao recusa valor <= 0, data e enums inválidos', () => {
  const r = validarMovimentacao({
    data: '2026-13-40', descricao: '  ', categoria: '',
    tipo: 'xpto' as never, forma: 'cheque' as never, valorCentavos: 0, situacao: 'zzz' as never, recorrente: false,
  });
  assert.equal(r.ok, false);
  assert.ok(r.erros.length >= 6);
});

test('resumoMovimentacoes soma entradas, saídas, saldo, a receber e a pagar', () => {
  const lista: Movimentacao[] = [
    mov({ id: 'a', tipo: 'entrada', valorCentavos: 1250000, situacao: 'pago' }),
    mov({ id: 'b', tipo: 'saida', categoria: 'Fornecedores', valorCentavos: 420000, situacao: 'pago' }),
    mov({ id: 'c', tipo: 'entrada', valorCentavos: 185000, situacao: 'pago' }),
    mov({ id: 'd', tipo: 'saida', categoria: 'Folha de pagamento', valorCentavos: 980000, situacao: 'pago' }),
    mov({ id: 'e', tipo: 'entrada', valorCentavos: 760000, situacao: 'pendente' }),
    mov({ id: 'f', tipo: 'saida', categoria: 'Instalações', valorCentavos: 350000, situacao: 'pago' }),
    mov({ id: 'g', tipo: 'entrada', valorCentavos: 90000, situacao: 'agendado' }),
  ];
  const r = resumoMovimentacoes(lista);
  assert.equal(r.entradasCentavos, 2285000); // R$ 22.850,00
  assert.equal(r.saidasCentavos, 1750000); // R$ 17.500,00
  assert.equal(r.saldoCentavos, 535000); // R$ 5.350,00
  assert.equal(r.aReceberCentavos, 850000); // 760000 + 90000
  assert.equal(r.aPagarCentavos, 0);
  assert.equal(r.totalLancamentos, 7);
});

test('resumoMovimentacoes agrupa despesas por categoria (desc)', () => {
  const lista: Movimentacao[] = [
    mov({ id: 'b', tipo: 'saida', categoria: 'Fornecedores', valorCentavos: 420000 }),
    mov({ id: 'd', tipo: 'saida', categoria: 'Folha de pagamento', valorCentavos: 980000 }),
    mov({ id: 'f', tipo: 'saida', categoria: 'Instalações', valorCentavos: 350000 }),
    mov({ id: 'b2', tipo: 'saida', categoria: 'Fornecedores', valorCentavos: 80000 }),
  ];
  const r = resumoMovimentacoes(lista);
  assert.deepEqual(r.porCategoria, [
    { categoria: 'Folha de pagamento', saidaCentavos: 980000 },
    { categoria: 'Fornecedores', saidaCentavos: 500000 },
    { categoria: 'Instalações', saidaCentavos: 350000 },
  ]);
});

test('comSaldoAcumulado acumula do mais antigo e devolve na ordem pedida', () => {
  const lista: Movimentacao[] = [
    mov({ id: 'a', data: '2026-07-18', tipo: 'entrada', valorCentavos: 100000 }),
    mov({ id: 'b', data: '2026-07-19', tipo: 'saida', valorCentavos: 30000 }),
    mov({ id: 'c', data: '2026-07-20', tipo: 'entrada', valorCentavos: 50000 }),
  ];
  const asc = comSaldoAcumulado(lista, 'asc');
  assert.deepEqual(asc.map((m) => m.saldoCentavos), [100000, 70000, 120000]);
  const desc = comSaldoAcumulado(lista, 'desc');
  assert.equal(desc[0]!.id, 'c');
  assert.equal(desc[0]!.saldoCentavos, 120000); // saldo final no topo
});
