import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serieCarteira,
  compararCarteira,
  resumoCarteira,
  evolucaoPorObra,
  type SnapshotObra,
} from './evolucao.ts';

function snap(over: Partial<SnapshotObra> = {}): SnapshotObra {
  return { mes: '2026-06', projetoId: 'p1', nome: 'Obra', cliente: 'Cliente', status: 'em_andamento', progresso: 50, contratadoCentavos: 1000000, recebidoCentavos: 400000, aReceberCentavos: 600000, ...over };
}

test('serieCarteira agrega por mês: contratado, recebido, backlog, contagens', () => {
  const s = serieCarteira([
    snap({ mes: '2026-06', projetoId: 'a', progresso: 40, aReceberCentavos: 600000, recebidoCentavos: 400000, contratadoCentavos: 1000000 }),
    snap({ mes: '2026-06', projetoId: 'b', status: 'concluido', progresso: 100, aReceberCentavos: 0, recebidoCentavos: 200000, contratadoCentavos: 200000 }),
  ]);
  assert.equal(s.length, 1);
  const m = s[0]!;
  assert.equal(m.contratadoCentavos, 1200000);
  assert.equal(m.recebidoCentavos, 600000);
  assert.equal(m.backlogCentavos, 600000);   // só a "a" ainda tem a receber
  assert.equal(m.nObras, 2);
  assert.equal(m.nAtivas, 1);                 // só "a" em andamento
  assert.equal(m.nConcluidas, 1);
  assert.equal(m.progressoMedio, 40);         // média só das em andamento (a)
});

test('progressoMedio ignora orçamento/concluído (só em andamento) e cancelado sai da carteira', () => {
  const s = serieCarteira([
    snap({ projetoId: 'a', status: 'em_andamento', progresso: 60 }),
    snap({ projetoId: 'b', status: 'orcamento', progresso: 0, aReceberCentavos: 500000, contratadoCentavos: 500000, recebidoCentavos: 0 }),
    snap({ projetoId: 'c', status: 'cancelado', progresso: 10, aReceberCentavos: 999999, contratadoCentavos: 999999 }),
  ]);
  const m = s[0]!;
  assert.equal(m.progressoMedio, 60);         // só "a"
  assert.equal(m.nObras, 2);                  // cancelado não conta
  assert.equal(m.backlogCentavos, 600000 + 500000); // a + b (cancelado fora)
});

test('série ordenada asc por mês e backlog evolui', () => {
  const s = serieCarteira([
    snap({ mes: '2026-07', projetoId: 'a', aReceberCentavos: 0, recebidoCentavos: 1000000 }),
    snap({ mes: '2026-05', projetoId: 'a', aReceberCentavos: 1000000, recebidoCentavos: 0 }),
    snap({ mes: '2026-06', projetoId: 'a', aReceberCentavos: 400000, recebidoCentavos: 600000 }),
  ]);
  assert.deepEqual(s.map((m) => m.mes), ['2026-05', '2026-06', '2026-07']);
  assert.deepEqual(s.map((m) => m.backlogCentavos), [1000000, 400000, 0]);
});

test('compararCarteira: deltas de backlog e progresso vs. mês anterior', () => {
  const s = serieCarteira([
    snap({ mes: '2026-06', projetoId: 'a', progresso: 40, aReceberCentavos: 600000 }),
    snap({ mes: '2026-07', projetoId: 'a', progresso: 60, aReceberCentavos: 300000 }),
  ]);
  const c = compararCarteira(s[1]!, s[0]!);
  assert.equal(c.mesAnterior, '2026-06');
  assert.equal(c.backlog.abs, -300000);       // backlog caiu
  assert.equal(c.backlog.direcao, 'desce');
  assert.equal(c.progressoMedio.abs, 20);      // 60 - 40
  assert.equal(c.progressoMedio.direcao, 'sobe');
});

test('resumoCarteira pega os dois últimos meses; série vazia é segura', () => {
  const s = serieCarteira([
    snap({ mes: '2026-05', projetoId: 'a' }), snap({ mes: '2026-06', projetoId: 'a' }), snap({ mes: '2026-07', projetoId: 'a' }),
  ]);
  const r = resumoCarteira(s);
  assert.equal(r.atual!.mes, '2026-07');
  assert.equal(r.comparativo!.mesAnterior, '2026-06');
  const vazio = resumoCarteira([]);
  assert.equal(vazio.atual, null);
  assert.equal(vazio.comparativo, null);
});

test('evolucaoPorObra agrupa por projeto com pontos ordenados por mês', () => {
  const ev = evolucaoPorObra([
    snap({ projetoId: 'a', nome: 'Zeta', mes: '2026-07', progresso: 80 }),
    snap({ projetoId: 'a', nome: 'Zeta', mes: '2026-05', progresso: 20 }),
    snap({ projetoId: 'b', nome: 'Alfa', mes: '2026-06', progresso: 50 }),
  ]);
  assert.equal(ev.length, 2);
  assert.equal(ev[0]!.nome, 'Alfa');                       // ordenado por nome
  const zeta = ev.find((o) => o.projetoId === 'a')!;
  assert.deepEqual(zeta.pontos.map((p) => p.mes), ['2026-05', '2026-07']);
  assert.deepEqual(zeta.pontos.map((p) => p.progresso), [20, 80]);
});
