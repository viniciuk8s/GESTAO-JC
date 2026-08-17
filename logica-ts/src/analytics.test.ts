import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serieMensal,
  delta,
  compararMeses,
  resumoComparativo,
  type LancamentoFin,
} from './analytics.ts';

function ent(data: string, valorCentavos: number, situacao = 'pago'): LancamentoFin { return { data, tipo: 'entrada', valorCentavos, situacao }; }
function sai(data: string, valorCentavos: number, situacao = 'pago'): LancamentoFin { return { data, tipo: 'saida', valorCentavos, situacao }; }

test('serieMensal agrupa por mês e calcula saldo/margem/ticket/recebido', () => {
  const s = serieMensal([
    ent('2026-06-10', 100000), ent('2026-06-20', 300000, 'pendente'), sai('2026-06-15', 100000),
    ent('2026-07-05', 500000), sai('2026-07-09', 100000),
  ]);
  assert.equal(s.length, 2);
  const jun = s[0]!, jul = s[1]!;
  assert.equal(jun.mes, '2026-06');
  assert.equal(jun.entradasCentavos, 400000);
  assert.equal(jun.saidasCentavos, 100000);
  assert.equal(jun.saldoCentavos, 300000);
  assert.equal(jun.recebidoCentavos, 100000);   // só a de 'pago'
  assert.equal(jun.aReceberCentavos, 300000);   // a 'pendente'
  assert.equal(jun.nEntradas, 2);
  assert.equal(jun.ticketMedioCentavos, 200000); // 400000/2
  assert.equal(jun.margemPct, 75);               // 300000/400000
  assert.equal(jul.margemPct, 80);               // 400000/500000
});

test('série vem ordenada ascendente por mês', () => {
  const s = serieMensal([ent('2026-07-01', 100), ent('2026-05-01', 100), ent('2026-06-01', 100)]);
  assert.deepEqual(s.map((m) => m.mes), ['2026-05', '2026-06', '2026-07']);
});

test('com intervalo de/ate, preenche meses vazios com zero', () => {
  const s = serieMensal([ent('2026-06-10', 100000)], { de: '2026-05', ate: '2026-08' });
  assert.deepEqual(s.map((m) => m.mes), ['2026-05', '2026-06', '2026-07', '2026-08']);
  assert.equal(s[0]!.entradasCentavos, 0); // maio vazio
  assert.equal(s[1]!.entradasCentavos, 100000);
  assert.equal(s[3]!.nLancamentos, 0); // agosto vazio
});

test('margem = 0 quando não há entradas (evita divisão por zero)', () => {
  const s = serieMensal([sai('2026-06-10', 50000)]);
  assert.equal(s[0]!.margemPct, 0);
  assert.equal(s[0]!.ticketMedioCentavos, 0);
  assert.equal(s[0]!.saldoCentavos, -50000);
});

test('delta calcula abs, pct e direção', () => {
  const d = delta(120, 100);
  assert.equal(d.abs, 20);
  assert.equal(d.pct, 20);
  assert.equal(d.direcao, 'sobe');
  const d2 = delta(80, 100);
  assert.equal(d2.pct, -20);
  assert.equal(d2.direcao, 'desce');
});

test('delta com anterior 0: pct null se atual ≠ 0, e 0 se ambos 0', () => {
  assert.equal(delta(500, 0).pct, null);
  assert.equal(delta(500, 0).direcao, 'sobe');
  assert.equal(delta(0, 0).pct, 0);
  assert.equal(delta(0, 0).direcao, 'igual');
});

test('compararMeses: margem em pontos percentuais; sem anterior usa base zero', () => {
  const s = serieMensal([
    ent('2026-06-01', 100000), sai('2026-06-02', 40000), // margem 60
    ent('2026-07-01', 200000), sai('2026-07-02', 40000), // margem 80
  ]);
  const c = compararMeses(s[1]!, s[0]!);
  assert.equal(c.mesAnterior, '2026-06');
  assert.equal(c.entradas.abs, 100000);
  assert.equal(c.entradas.pct, 100);          // dobrou
  assert.equal(c.margem.abs, 20);             // 80 - 60 = 20 p.p.
  const semBase = compararMeses(s[0]!, null);
  assert.equal(semBase.mesAnterior, null);
  assert.equal(semBase.entradas.anterior, 0);
});

test('resumoComparativo pega os dois últimos meses', () => {
  const s = serieMensal([ent('2026-05-01', 100), ent('2026-06-01', 200), ent('2026-07-01', 300)]);
  const r = resumoComparativo(s);
  assert.equal(r.atual!.mes, '2026-07');
  assert.equal(r.comparativo!.mesAnterior, '2026-06');
  assert.equal(r.comparativo!.entradas.abs, 100); // 300 - 200
});

test('resumoComparativo com série vazia é seguro', () => {
  const r = resumoComparativo([]);
  assert.equal(r.atual, null);
  assert.equal(r.comparativo, null);
});
