import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseValorCentavos,
  parseDataISO,
  normalizarTipo,
  normalizarForma,
  normalizarSituacao,
  linhaParaMovimentacao,
  mapearLinhas,
} from './planilhas.ts';

test('parseValorCentavos entende formatos BR e internacionais', () => {
  assert.equal(parseValorCentavos('R$ 1.234,56'), 123456);
  assert.equal(parseValorCentavos('1234.56'), 123456);
  assert.equal(parseValorCentavos('12.500,00'), 1250000);
  assert.equal(parseValorCentavos('900'), 90000);
  assert.equal(parseValorCentavos('-1.850,00'), -185000);
  assert.equal(parseValorCentavos('(4.200,00)'), -420000);
  assert.equal(parseValorCentavos(''), null);
  assert.equal(parseValorCentavos('abc'), null);
});

test('parseDataISO entende DD/MM/AAAA, ISO e serial do Excel', () => {
  assert.equal(parseDataISO('22/07/2026'), '2026-07-22');
  assert.equal(parseDataISO('5/7/26'), '2026-07-05');
  assert.equal(parseDataISO('2026-07-22'), '2026-07-22');
  assert.equal(parseDataISO('2026-7-5'), '2026-07-05');
  assert.equal(parseDataISO('46225'), '2026-07-22'); // serial do Excel
  assert.equal(parseDataISO('xx'), null);
});

test('normalizações de tipo/forma/situação', () => {
  assert.equal(normalizarTipo('Entrada'), 'entrada');
  assert.equal(normalizarTipo('despesa'), 'saida');
  assert.equal(normalizarTipo('crédito'), 'entrada');
  assert.equal(normalizarTipo('???'), null);
  assert.equal(normalizarForma('PIX'), 'pix');
  assert.equal(normalizarForma('Transferência'), 'transferencia');
  assert.equal(normalizarForma('cartão de crédito'), 'cartao');
  assert.equal(normalizarForma('desconhecido'), 'pix');
  assert.equal(normalizarSituacao('Pendente'), 'pendente');
  assert.equal(normalizarSituacao('a receber'), 'pendente');
  assert.equal(normalizarSituacao('qualquer'), 'pago');
});

test('linhaParaMovimentacao mapeia colunas com apelidos e acentos', () => {
  const r = linhaParaMovimentacao({
    Data: '22/07/2026', 'Descrição': 'Instalação solar', Categoria: 'Instalação solar',
    Tipo: 'Entrada', 'Forma de pagamento': 'Pix', 'Valor (R$)': '12.500,00', 'Situação': 'Pago',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.mov, {
    data: '2026-07-22', descricao: 'Instalação solar', categoria: 'Instalação solar',
    tipo: 'entrada', forma: 'pix', valorCentavos: 1250000, situacao: 'pago', recorrente: false,
  });
});

test('linhaParaMovimentacao infere tipo pelo sinal do valor quando falta a coluna tipo', () => {
  const saida = linhaParaMovimentacao({ data: '2026-07-18', historico: 'Aluguel', valor: '-3.500,00' });
  assert.equal(saida.mov?.tipo, 'saida');
  assert.equal(saida.mov?.valorCentavos, 350000);
  assert.equal(saida.mov?.categoria, 'Outros'); // categoria ausente → padrão
  const entrada = linhaParaMovimentacao({ data: '2026-07-18', historico: 'Recebimento', valor: '900,00' });
  assert.equal(entrada.mov?.tipo, 'entrada');
});

test('linhaParaMovimentacao recusa data e valor inválidos', () => {
  assert.equal(linhaParaMovimentacao({ data: 'xx', descricao: 'X', valor: '10' }).ok, false);
  assert.equal(linhaParaMovimentacao({ data: '2026-07-01', descricao: '', valor: '10' }).ok, false);
  assert.equal(linhaParaMovimentacao({ data: '2026-07-01', descricao: 'X', valor: 'zero' }).ok, false);
});

test('mapearLinhas separa válidas de erros com número de linha', () => {
  const r = mapearLinhas([
    { data: '2026-07-22', descricao: 'A', valor: '100,00' },
    { data: 'ruim', descricao: 'B', valor: '50,00' },
    { data: '2026-07-23', descricao: 'C', valor: '-30,00' },
  ]);
  assert.equal(r.movs.length, 2);
  assert.equal(r.erros.length, 1);
  assert.equal(r.erros[0]!.linha, 3); // 2ª linha de dados = linha 3 na planilha
});
