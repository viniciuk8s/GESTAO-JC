import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jornadaDeServico, DiasTrabalhadosStore, type Jornada } from './jornadas.ts';
import type { Servico } from './agendamentos.ts';

function svc(p: Partial<Servico> & { id: string }): Servico {
  return {
    data: '2026-07-10',
    titulo: 'Instalação solar',
    cliente: 'Cliente X',
    inicio: '09:00',
    duracaoMin: 120,
    tecnico: 'Carlos Lima',
    valorCentavos: 100000,
    situacao: 'concluido',
    ...p,
  };
}

test('jornadaDeServico só gera para serviço concluído com colaborador', () => {
  assert.equal(jornadaDeServico(svc({ id: 'ag_1', situacao: 'confirmado' })), null);
  assert.equal(jornadaDeServico(svc({ id: 'ag_1', situacao: 'pendente' })), null);
  assert.equal(jornadaDeServico(svc({ id: 'ag_1', situacao: 'cancelado' })), null);
  assert.equal(jornadaDeServico(svc({ id: 'ag_1', situacao: 'concluido', tecnico: '   ' })), null);

  const j = jornadaDeServico(svc({ id: 'ag_9', situacao: 'concluido' }));
  assert.ok(j);
  assert.equal(j!.origemId, 'ag_9');
  assert.equal(j!.funcionario, 'Carlos Lima');
  assert.equal(j!.duracaoMin, 120);
  assert.equal(j!.pago, false, 'dia novo começa a pagar');
});

test('adicionarManual gera id próprio e não colide com origens', () => {
  const store = new DiasTrabalhadosStore();
  const j = store.adicionarManual({ funcionario: 'Ana Beatriz', data: '2026-07-20', servico: 'Visita comercial', cliente: 'Loja Central', duracaoMin: 120, pago: true });
  assert.ok(j.id.startsWith('j_man_'));
  assert.equal(j.pago, true);
  assert.equal(store.todas().length, 1);
});

test('marcarPago e removerPorId', () => {
  const store = new DiasTrabalhadosStore();
  const j = store.adicionarManual({ funcionario: 'Ana', data: '2026-07-20', servico: 'X', cliente: 'C', duracaoMin: 60, pago: false });
  assert.equal(store.marcarPago(j.id, true), true);
  assert.equal(store.buscar(j.id)!.pago, true);
  assert.equal(store.marcarPago('inexistente', true), false);
  assert.equal(store.removerPorId(j.id), true);
  assert.equal(store.buscar(j.id), undefined);
});

test('registrar é idempotente por origemId', () => {
  const store = new DiasTrabalhadosStore();
  const s = svc({ id: 'ag_1' });
  assert.ok(store.registrarDeServico(s));
  assert.equal(store.registrarDeServico(s), null, 'não registra duas vezes o mesmo serviço');
  assert.equal(store.todas().length, 1);
});

test('registrarDeServico ignora serviços não concluídos', () => {
  const store = new DiasTrabalhadosStore();
  assert.equal(store.registrarDeServico(svc({ id: 'ag_1', situacao: 'pendente' })), null);
  assert.equal(store.todas().length, 0);
});

test('removerPorOrigem desfaz o registro (serviço reaberto)', () => {
  const store = new DiasTrabalhadosStore();
  store.registrarDeServico(svc({ id: 'ag_1' }));
  assert.equal(store.removerPorOrigem('ag_1'), true);
  assert.equal(store.todas().length, 0);
  assert.equal(store.removerPorOrigem('ag_1'), false);
});

test('porFuncionario agrega dias distintos, horas e serviços', () => {
  const store = new DiasTrabalhadosStore();
  store.registrarDeServico(svc({ id: 'a', tecnico: 'Carlos Lima', data: '2026-07-03', duracaoMin: 240 }));
  store.registrarDeServico(svc({ id: 'b', tecnico: 'Carlos Lima', data: '2026-07-03', duracaoMin: 60 })); // mesmo dia
  store.registrarDeServico(svc({ id: 'c', tecnico: 'Carlos Lima', data: '2026-07-08', duracaoMin: 120 }));
  store.registrarDeServico(svc({ id: 'd', tecnico: 'João Pedro', data: '2026-07-05', duracaoMin: 90 }));

  const resumo = store.porFuncionario();
  assert.equal(resumo.length, 2);
  const carlos = resumo.find((r) => r.funcionario === 'Carlos Lima')!;
  assert.equal(carlos.servicos, 3);
  assert.equal(carlos.dias, 2, 'dois dias distintos (03 e 08)');
  assert.equal(carlos.minutos, 420);
  // ordenado por horas desc → Carlos primeiro
  assert.equal(resumo[0]!.funcionario, 'Carlos Lima');
  // jornadas mais recentes primeiro
  assert.equal(carlos.jornadas[0]!.data, '2026-07-08');
});

test('totais do store', () => {
  const store = new DiasTrabalhadosStore();
  store.registrarDeServico(svc({ id: 'a', tecnico: 'Carlos Lima', data: '2026-07-03', duracaoMin: 240 }));
  store.registrarDeServico(svc({ id: 'b', tecnico: 'Carlos Lima', data: '2026-07-08', duracaoMin: 120 }));
  store.registrarDeServico(svc({ id: 'c', tecnico: 'João Pedro', data: '2026-07-03', duracaoMin: 90 }));
  assert.equal(store.totalDias(), 3, '3 pares funcionário+data distintos');
  assert.equal(store.totalMinutos(), 450);
  assert.equal(store.totalFuncionarios(), 2);
});

test('porFuncionario conta pagos e a pagar', () => {
  const store = new DiasTrabalhadosStore();
  const a = store.adicionarManual({ funcionario: 'Carlos Lima', data: '2026-07-03', servico: 'A', cliente: 'C', duracaoMin: 120, pago: true });
  store.adicionarManual({ funcionario: 'Carlos Lima', data: '2026-07-08', servico: 'B', cliente: 'C', duracaoMin: 60, pago: false });
  const r = store.porFuncionario().find((x) => x.funcionario === 'Carlos Lima')!;
  assert.equal(r.pagos, 1);
  assert.equal(r.aPagar, 1);
  assert.equal(store.totalPagos(), 1);
  assert.equal(store.totalApagar(), 1);
  assert.ok(a.id);
});

test('seed é preservado e não compartilha referência', () => {
  const seed: Jornada[] = [{ id: 'j_x', origemId: 'x', funcionario: 'Maria', data: '2026-07-01', servico: 'S', cliente: 'C', duracaoMin: 60, pago: false }];
  const store = new DiasTrabalhadosStore(seed);
  assert.equal(store.todas().length, 1);
  store.todas()[0]!.funcionario = 'ALTERADO';
  assert.equal(store.todas()[0]!.funcionario, 'Maria', 'cópia defensiva');
});
