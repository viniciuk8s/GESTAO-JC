import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarProjeto, resumoProjeto, progressoSugerido, type NovoProjeto } from './projetos.ts';
import type { Servico } from './agendamentos.ts';
import type { Documento } from './documentos.ts';
import type { Movimentacao } from './movimentacoes.ts';

const base: NovoProjeto = {
  nome: 'Instalação solar — Cond. Vila Verde',
  cliente: 'Condomínio Vila Verde',
  tipo: 'instalacao_solar',
  status: 'em_andamento',
  responsavel: 'Carlos Lima',
  valorContratadoCentavos: 1250000,
  inicio: '2026-07-02',
  previsao: '2026-08-15',
  progresso: 60,
};

test('validarProjeto aceita um projeto bem formado', () => {
  assert.equal(validarProjeto(base).ok, true);
});

test('validarProjeto recusa campos inválidos', () => {
  assert.equal(validarProjeto({ ...base, nome: '  ' }).ok, false);
  assert.equal(validarProjeto({ ...base, cliente: '' }).ok, false);
  assert.equal(validarProjeto({ ...base, tipo: 'foo' as never }).ok, false);
  assert.equal(validarProjeto({ ...base, status: 'x' as never }).ok, false);
  assert.equal(validarProjeto({ ...base, valorContratadoCentavos: -1 }).ok, false);
  assert.equal(validarProjeto({ ...base, progresso: 120 }).ok, false);
  assert.equal(validarProjeto({ ...base, inicio: '2026-13-40' }).ok, false);
});

test('validarProjeto recusa previsão antes do início', () => {
  const r = validarProjeto({ ...base, inicio: '2026-08-01', previsao: '2026-07-01' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('antes do início')));
});

test('validarProjeto aceita datas ausentes (opcionais)', () => {
  const { inicio, previsao, ...semDatas } = base;
  void inicio; void previsao;
  assert.equal(validarProjeto(semDatas as NovoProjeto).ok, true);
});

test('resumoProjeto agrega entradas, a receber, custo e saldo', () => {
  const p = { ...base, id: 'prj_1', criadoEm: '2026-07-02' };
  const movs: Movimentacao[] = [
    { id: 'mv_1', data: '2026-07-22', descricao: 'Sinal', categoria: 'Instalação solar', tipo: 'entrada', forma: 'pix', valorCentavos: 625000, situacao: 'pago', recorrente: false },
    { id: 'mv_2', data: '2026-07-25', descricao: 'Parcela 2', categoria: 'Instalação solar', tipo: 'entrada', forma: 'boleto', valorCentavos: 625000, situacao: 'pendente', recorrente: false },
    { id: 'mv_3', data: '2026-07-20', descricao: 'Cabos e disjuntores', categoria: 'Fornecedores', tipo: 'saida', forma: 'boleto', valorCentavos: 420000, situacao: 'pago', recorrente: false },
  ];
  const ags: Servico[] = [
    { id: 'ag_1', data: '2026-07-22', titulo: 'Instalação', cliente: 'Condomínio Vila Verde', inicio: '09:00', duracaoMin: 120, tecnico: 'Carlos Lima', valorCentavos: 1250000, situacao: 'concluido' },
    { id: 'ag_9', data: '2026-07-30', titulo: 'Vistoria final', cliente: 'Condomínio Vila Verde', inicio: '10:00', duracaoMin: 60, tecnico: 'Carlos Lima', valorCentavos: 0, situacao: 'confirmado' },
  ];
  const docs: Documento[] = [
    { id: 'doc_1', tipo: 'contrato', titulo: 'Contrato', vinculoTipo: 'cliente', criadoEm: '2026-07-02' },
  ];
  const r = resumoProjeto(p, { agendamentos: ags, documentos: docs, movimentacoes: movs });
  assert.equal(r.contratadoCentavos, 1250000);
  assert.equal(r.recebidoCentavos, 625000);
  assert.equal(r.aReceberCentavos, 625000);
  assert.equal(r.custoCentavos, 420000);
  assert.equal(r.saldoCentavos, 205000); // 625000 − 420000
  assert.equal(r.nAgendamentos, 2);
  assert.equal(r.nConcluidos, 1);
  assert.equal(r.nDocumentos, 1);
});

test('resumoProjeto sem vínculos zera os agregados', () => {
  const p = { ...base, id: 'prj_2', criadoEm: '2026-07-02', valorContratadoCentavos: 0 };
  const r = resumoProjeto(p);
  assert.deepEqual(
    [r.recebidoCentavos, r.aReceberCentavos, r.custoCentavos, r.saldoCentavos, r.nAgendamentos, r.nDocumentos],
    [0, 0, 0, 0, 0, 0],
  );
});

test('progressoSugerido = proporção de serviços concluídos', () => {
  const mk = (situacao: Servico['situacao']): Servico => ({
    id: 'x', data: '2026-07-22', titulo: 't', cliente: 'c', inicio: '09:00', duracaoMin: 60, tecnico: 't', valorCentavos: 0, situacao,
  });
  assert.equal(progressoSugerido([]), 0);
  assert.equal(progressoSugerido([mk('concluido'), mk('confirmado'), mk('pendente'), mk('concluido')]), 50);
});
