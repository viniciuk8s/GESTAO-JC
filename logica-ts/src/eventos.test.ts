/**
 * Testes do barramento de eventos (SSE): emissão, buffer, replay e assinatura.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitirEvento, assinar, recentes, desde, _resetEventos } from './eventos.ts';

test('emitir carimba id monotônico e timestamp ISO', () => {
  _resetEventos();
  const a = emitirEvento({ recurso: 'movimentacoes', acao: 'criar', titulo: 'A' });
  const b = emitirEvento({ recurso: 'projetos', acao: 'criar', titulo: 'B' });
  assert.equal(a.id, 1);
  assert.equal(b.id, 2);
  assert.match(a.ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(a.recurso, 'movimentacoes');
});

test('recentes devolve do mais novo para o mais antigo', () => {
  _resetEventos();
  emitirEvento({ recurso: 'dias', acao: 'criar', titulo: '1' });
  emitirEvento({ recurso: 'dias', acao: 'criar', titulo: '2' });
  emitirEvento({ recurso: 'dias', acao: 'criar', titulo: '3' });
  const r = recentes(2);
  assert.deepEqual(r.map((e) => e.titulo), ['3', '2']);
});

test('desde(lastId) replica só o que veio depois, em ordem cronológica', () => {
  _resetEventos();
  const a = emitirEvento({ recurso: 'fiscal', acao: 'pagar', titulo: 'a' });
  emitirEvento({ recurso: 'fiscal', acao: 'pagar', titulo: 'b' });
  emitirEvento({ recurso: 'fiscal', acao: 'pagar', titulo: 'c' });
  const perdidos = desde(a.id);
  assert.deepEqual(perdidos.map((e) => e.titulo), ['b', 'c']);
});

test('assinar recebe eventos e cancela corretamente', () => {
  _resetEventos();
  const recebidos: string[] = [];
  const off = assinar((e) => recebidos.push(e.titulo));
  emitirEvento({ recurso: 'agendamentos', acao: 'criar', titulo: 'x' });
  off();
  emitirEvento({ recurso: 'agendamentos', acao: 'criar', titulo: 'y' });
  assert.deepEqual(recebidos, ['x']);
});

test('buffer preserva campos opcionais (detalhe, ator)', () => {
  _resetEventos();
  emitirEvento({ recurso: 'documentos', acao: 'criar', titulo: 'NF-e 123', detalhe: 'Cliente X', ator: 'Rodrigo' });
  const [e] = recentes(1);
  assert.equal(e!.detalhe, 'Cliente X');
  assert.equal(e!.ator, 'Rodrigo');
});
