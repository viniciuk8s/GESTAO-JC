import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehDataValida,
  minutosDoDia,
  horaDeMinutos,
  intervaloDoServico,
  minutosDeSobreposicao,
  conflitosNoDia,
  conflitosDoCandidato,
  validarServico,
  ehPassado,
  estadoDaData,
  acoesPara,
  AgendaStore,
  formatarBRL,
  formatarDuracao,
  type Servico,
  type NovoServico,
} from './agendamentos.ts';

// Helper: cria um serviço completo com defaults sensatos.
function svc(p: Partial<Servico> & { id: string }): Servico {
  return {
    data: '2026-07-22',
    titulo: 'Serviço',
    cliente: 'Cliente',
    inicio: '09:00',
    duracaoMin: 60,
    tecnico: 'Carlos Lima',
    valorCentavos: 100000,
    situacao: 'confirmado',
    ...p,
  };
}

function novo(p: Partial<NovoServico> = {}): NovoServico {
  return {
    data: '2026-07-22',
    titulo: 'Instalação solar',
    cliente: 'Vila Verde',
    inicio: '09:00',
    duracaoMin: 120,
    tecnico: 'Carlos Lima',
    valorCentavos: 1250000,
    situacao: 'confirmado',
    ...p,
  };
}

// ---------------- Datas ----------------
test('ehDataValida aceita datas reais e rejeita inválidas', () => {
  assert.equal(ehDataValida('2026-07-22'), true);
  assert.equal(ehDataValida('2024-02-29'), true); // bissexto
  assert.equal(ehDataValida('2026-02-29'), false); // não bissexto
  assert.equal(ehDataValida('2026-13-01'), false);
  assert.equal(ehDataValida('2026-00-10'), false);
  assert.equal(ehDataValida('2026-04-31'), false); // abril tem 30
  assert.equal(ehDataValida('2026-7-2'), false); // sem zero à esquerda
  assert.equal(ehDataValida('22/07/2026'), false);
});

// ---------------- Horários ----------------
test('minutosDoDia / horaDeMinutos são inversos', () => {
  assert.equal(minutosDoDia('00:00'), 0);
  assert.equal(minutosDoDia('09:30'), 570);
  assert.equal(minutosDoDia('23:59'), 1439);
  assert.equal(horaDeMinutos(0), '00:00');
  assert.equal(horaDeMinutos(570), '09:30');
  assert.equal(horaDeMinutos(1439), '23:59');
});

test('minutosDoDia lança em horário inválido', () => {
  assert.throws(() => minutosDoDia('24:00'), RangeError);
  assert.throws(() => minutosDoDia('9:00'), RangeError);
  assert.throws(() => minutosDoDia('12:60'), RangeError);
  assert.throws(() => minutosDoDia('abc'), RangeError);
});

// ---------------- Sobreposição ----------------
test('minutosDeSobreposicao: casos de borda', () => {
  const a = intervaloDoServico({ inicio: '09:00', duracaoMin: 60 }); // 09:00–10:00
  const encosta = intervaloDoServico({ inicio: '10:00', duracaoMin: 60 }); // 10:00–11:00
  const sobrepoe = intervaloDoServico({ inicio: '09:30', duracaoMin: 60 }); // 09:30–10:30
  const contido = intervaloDoServico({ inicio: '09:15', duracaoMin: 15 }); // 09:15–09:30
  const disjunto = intervaloDoServico({ inicio: '14:00', duracaoMin: 30 });

  assert.equal(minutosDeSobreposicao(a, encosta), 0, 'encostar não é conflito');
  assert.equal(minutosDeSobreposicao(a, sobrepoe), 30);
  assert.equal(minutosDeSobreposicao(a, contido), 15);
  assert.equal(minutosDeSobreposicao(a, disjunto), 0);
  assert.equal(minutosDeSobreposicao(a, a), 60, 'idêntico sobrepõe totalmente');
});

// ---------------- Conflitos no dia ----------------
test('conflitosNoDia encontra pares sobrepostos e ignora cancelados', () => {
  const lista: Servico[] = [
    svc({ id: 'ag_1', inicio: '09:00', duracaoMin: 120 }), // 09–11
    svc({ id: 'ag_2', inicio: '10:00', duracaoMin: 60 }), // 10–11  -> conflita com ag_1
    svc({ id: 'ag_3', inicio: '11:00', duracaoMin: 60 }), // 11–12  -> encosta, sem conflito
    svc({ id: 'ag_4', inicio: '10:30', duracaoMin: 60, situacao: 'cancelado' }), // cancelado, ignora
  ];
  const c = conflitosNoDia(lista);
  assert.equal(c.length, 1);
  assert.equal(c[0]!.a.id, 'ag_1');
  assert.equal(c[0]!.b.id, 'ag_2');
  assert.equal(c[0]!.minutos, 60);
  assert.equal(horaDeMinutos(c[0]!.inicioMin), '10:00');
  assert.equal(horaDeMinutos(c[0]!.fimMin), '11:00');
});

test('conflitosNoDia não compara datas diferentes', () => {
  const lista: Servico[] = [
    svc({ id: 'ag_1', data: '2026-07-22', inicio: '09:00', duracaoMin: 120 }),
    svc({ id: 'ag_2', data: '2026-07-23', inicio: '09:30', duracaoMin: 120 }),
  ];
  assert.equal(conflitosNoDia(lista).length, 0);
});

// ---------------- Conflitos do candidato ----------------
test('conflitosDoCandidato exclui a si mesmo (edição)', () => {
  const doDia: Servico[] = [
    svc({ id: 'ag_1', inicio: '09:00', duracaoMin: 120 }),
    svc({ id: 'ag_2', inicio: '14:00', duracaoMin: 60 }),
  ];
  // Editando ag_1 mantendo o mesmo horário: não conflita consigo.
  const semConflito = conflitosDoCandidato(
    { id: 'ag_1', data: '2026-07-22', inicio: '09:00', duracaoMin: 120, situacao: 'confirmado' },
    doDia,
  );
  assert.equal(semConflito.length, 0);

  // Novo serviço 10:00–11:00 conflita com ag_1.
  const comConflito = conflitosDoCandidato(
    { data: '2026-07-22', inicio: '10:00', duracaoMin: 60, situacao: 'confirmado' },
    doDia,
  );
  assert.equal(comConflito.length, 1);
  assert.equal(comConflito[0]!.id, 'ag_1');
});

test('candidato cancelado nunca conflita', () => {
  const doDia: Servico[] = [svc({ id: 'ag_1', inicio: '09:00', duracaoMin: 120 })];
  const r = conflitosDoCandidato(
    { data: '2026-07-22', inicio: '09:30', duracaoMin: 60, situacao: 'cancelado' },
    doDia,
  );
  assert.equal(r.length, 0);
});

// ---------------- Validação ----------------
test('validarServico acumula erros de campo', () => {
  const r = validarServico(
    novo({ titulo: '  ', cliente: '', inicio: '25:00', duracaoMin: 0, valorCentavos: -1 }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.erros.includes('Informe o serviço.'));
  assert.ok(r.erros.includes('Informe o cliente.'));
  assert.ok(r.erros.includes('Horário inválido.'));
  assert.ok(r.erros.includes('Duração deve ser maior que zero.'));
  assert.ok(r.erros.includes('Valor inválido.'));
});

test('validarServico rejeita serviço que ultrapassa a meia-noite', () => {
  const r = validarServico(novo({ inicio: '23:00', duracaoMin: 120 }));
  assert.equal(r.ok, false);
  assert.ok(r.erros.includes('O serviço ultrapassa o fim do dia.'));
});

test('validarServico aceita serviço válido', () => {
  assert.equal(validarServico(novo()).ok, true);
});

// ---------------- Estado da data / ações ----------------
test('ehPassado compara datas corretamente', () => {
  assert.equal(ehPassado('2026-07-21', '2026-07-22'), true);
  assert.equal(ehPassado('2026-07-22', '2026-07-22'), false); // hoje não é passado
  assert.equal(ehPassado('2026-07-23', '2026-07-22'), false);
});

test('estadoDaData e ações: futuro vazio -> só criar', () => {
  const e = estadoDaData('2026-07-25', '2026-07-22', []);
  assert.equal(e.tipo, 'vazio-futuro');
  assert.deepEqual(acoesPara(e), { podeCriar: true, podeEditar: false, podeRemover: false });
});

test('estadoDaData e ações: futuro preenchido -> criar/editar/remover, ordenado', () => {
  const servicos: Servico[] = [
    svc({ id: 'ag_2', data: '2026-07-25', inicio: '14:00' }),
    svc({ id: 'ag_1', data: '2026-07-25', inicio: '09:00' }),
  ];
  const e = estadoDaData('2026-07-25', '2026-07-22', servicos);
  assert.equal(e.tipo, 'preenchido-futuro');
  assert.ok('servicos' in e);
  if (e.tipo === 'preenchido-futuro') {
    assert.deepEqual(
      e.servicos.map((s) => s.id),
      ['ag_1', 'ag_2'],
      'deve vir ordenado por horário',
    );
  }
  assert.deepEqual(acoesPara(e), { podeCriar: true, podeEditar: true, podeRemover: true });
});

test('estadoDaData e ações: passado preenchido -> só editar/remover (não cria)', () => {
  const servicos: Servico[] = [svc({ id: 'ag_1', data: '2026-07-10', inicio: '09:00' })];
  const e = estadoDaData('2026-07-10', '2026-07-22', servicos);
  assert.equal(e.tipo, 'preenchido-passado');
  assert.deepEqual(acoesPara(e), { podeCriar: false, podeEditar: true, podeRemover: true });
});

test('estadoDaData e ações: passado vazio -> nada', () => {
  const e = estadoDaData('2026-07-10', '2026-07-22', []);
  assert.equal(e.tipo, 'vazio-passado');
  assert.deepEqual(acoesPara(e), { podeCriar: false, podeEditar: false, podeRemover: false });
});

// ---------------- Store CRUD ----------------
test('AgendaStore.adicionar permite múltiplos serviços no mesmo dia sem conflito', () => {
  const store = new AgendaStore();
  const r1 = store.adicionar(novo({ inicio: '09:00', duracaoMin: 120 })); // 09–11
  const r2 = store.adicionar(novo({ inicio: '11:00', duracaoMin: 60, titulo: 'Vistoria' })); // 11–12
  const r3 = store.adicionar(novo({ inicio: '14:00', duracaoMin: 60, titulo: 'Manutenção' }));
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r3.ok, true);
  assert.equal(store.doDia('2026-07-22').length, 3);
});

test('AgendaStore.adicionar bloqueia conflito e devolve os conflitantes', () => {
  const store = new AgendaStore();
  store.adicionar(novo({ inicio: '09:00', duracaoMin: 120 })); // 09–11
  const r = store.adicionar(novo({ inicio: '10:00', duracaoMin: 60, titulo: 'Choca' })); // 10–11
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.conflitos.length, 1);
    assert.equal(r.conflitos[0]!.inicio, '09:00');
  }
  assert.equal(store.doDia('2026-07-22').length, 1, 'não deve ter gravado o conflitante');
});

test('AgendaStore.adicionar aceita conflito quando permitido', () => {
  const store = new AgendaStore();
  store.adicionar(novo({ inicio: '09:00', duracaoMin: 120 }));
  const r = store.adicionar(novo({ inicio: '10:00', duracaoMin: 60 }), { permitirConflito: true });
  assert.equal(r.ok, true);
  assert.equal(store.doDia('2026-07-22').length, 2);
});

test('AgendaStore.atualizar não conflita consigo mesmo e detecta conflito real', () => {
  const store = new AgendaStore();
  const a = store.adicionar(novo({ inicio: '09:00', duracaoMin: 60 }));
  const b = store.adicionar(novo({ inicio: '11:00', duracaoMin: 60, titulo: 'Vistoria' }));
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;

  // Atualiza A mudando só o valor: sem conflito consigo mesmo.
  const upd = store.atualizar(a.servico.id, { valorCentavos: 999 });
  assert.equal(upd.ok, true);

  // Move A para 10:30–11:30: passa a conflitar com B (11:00–12:00).
  const choca = store.atualizar(a.servico.id, { inicio: '10:30', duracaoMin: 60 });
  assert.equal(choca.ok, false);
  if (!choca.ok) assert.equal(choca.conflitos[0]!.id, b.servico.id);
});

test('AgendaStore.remover exclui e ids são estáveis', () => {
  const store = new AgendaStore();
  const r = store.adicionar(novo());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(store.remover(r.servico.id), true);
  assert.equal(store.remover(r.servico.id), false); // já removido
  assert.equal(store.buscar(r.servico.id), undefined);
});

test('AgendaStore preserva ids do seed e continua a sequência', () => {
  const store = new AgendaStore([svc({ id: 'ag_7', inicio: '08:00' })]);
  const r = store.adicionar(novo({ inicio: '10:00' }));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.servico.id, 'ag_8', 'sequência continua a partir do maior id do seed');
});

// ---------------- Formatação ----------------
test('formatarBRL agrupa milhares e centavos', () => {
  assert.equal(formatarBRL(0), 'R$ 0,00');
  assert.equal(formatarBRL(900), 'R$ 9,00');
  assert.equal(formatarBRL(185000), 'R$ 1.850,00');
  assert.equal(formatarBRL(1250000), 'R$ 12.500,00');
  assert.equal(formatarBRL(123456789), 'R$ 1.234.567,89');
});

test('formatarDuracao', () => {
  assert.equal(formatarDuracao(60), '1h');
  assert.equal(formatarDuracao(90), '1h30');
  assert.equal(formatarDuracao(45), '45min');
  assert.equal(formatarDuracao(150), '2h30');
});
