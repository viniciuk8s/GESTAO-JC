import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diasEntre,
  validadeDoc,
  documentosAVencer,
  validarDocumento,
  type Documento,
  type NovoDocumento,
} from './documentos.ts';

const HOJE = '2026-07-23';

function doc(over: Partial<Documento> = {}): Documento {
  return {
    id: 'doc_1',
    tipo: 'contrato',
    titulo: 'Contrato de instalação',
    vinculoTipo: 'cliente',
    vinculoLabel: 'Condomínio Vila Verde',
    criadoEm: '2026-07-02',
    ...over,
  };
}

test('diasEntre conta dias corridos e sinal', () => {
  assert.equal(diasEntre('2026-07-23', '2026-07-23'), 0);
  assert.equal(diasEntre('2026-07-23', '2026-07-24'), 1);
  assert.equal(diasEntre('2026-07-23', '2026-08-22'), 30);
  assert.equal(diasEntre('2026-07-23', '2026-07-13'), -10);
});

test('diasEntre atravessa ano bissexto corretamente', () => {
  // 2028 é bissexto: 29/02 existe
  assert.equal(diasEntre('2028-02-28', '2028-03-01'), 2);
});

test('validadeDoc: sem vencimento => sem-validade', () => {
  const v = validadeDoc(doc(), HOJE); // doc() já vem sem vencimento
  assert.equal(v.tipo, 'sem-validade');
  assert.equal(v.dias, null);
});

test('validadeDoc: vencimento futuro distante => vigente', () => {
  const v = validadeDoc(doc({ vencimento: '2027-07-02' }), HOJE);
  assert.equal(v.tipo, 'vigente');
  assert.ok(v.dias! > 30);
});

test('validadeDoc: dentro de 30 dias => vence (alerta)', () => {
  const v = validadeDoc(doc({ vencimento: '2026-08-20' }), HOJE);
  assert.equal(v.tipo, 'vence');
  assert.equal(v.dias, 28);
});

test('validadeDoc: limite é inclusivo (exatamente 30 dias)', () => {
  assert.equal(validadeDoc(doc({ vencimento: '2026-08-22' }), HOJE).tipo, 'vence');
  assert.equal(validadeDoc(doc({ vencimento: '2026-08-23' }), HOJE).tipo, 'vigente');
});

test('validadeDoc: vencimento passado => vencido (dias negativo)', () => {
  const v = validadeDoc(doc({ vencimento: '2026-07-07' }), HOJE);
  assert.equal(v.tipo, 'vencido');
  assert.equal(v.dias, -16);
});

test('documentosAVencer: só os dentro da janela, ordenados por vencimento', () => {
  const docs: Documento[] = [
    doc({ id: 'a', vencimento: '2027-07-02' }), // vigente (fora)
    doc({ id: 'b', vencimento: '2026-08-20' }), // vence
    doc({ id: 'c' }), // sem validade (fora)
    doc({ id: 'd', vencimento: '2026-08-05' }), // vence (mais cedo)
    doc({ id: 'e', vencimento: '2026-07-07' }), // vencido
  ];
  const r = documentosAVencer(docs, HOJE, 30);
  assert.deepEqual(r.map((d) => d.id), ['e', 'd', 'b']); // vencido primeiro (data menor), depois por data
});

test('documentosAVencer: pode excluir os já vencidos', () => {
  const docs: Documento[] = [
    doc({ id: 'd', vencimento: '2026-08-05' }),
    doc({ id: 'e', vencimento: '2026-07-07' }),
  ];
  const r = documentosAVencer(docs, HOJE, 30, false);
  assert.deepEqual(r.map((d) => d.id), ['d']);
});

test('validarDocumento aceita um documento correto', () => {
  const novo: NovoDocumento = {
    tipo: 'nota_fiscal',
    titulo: 'NF-e 001432',
    vinculoTipo: 'servico',
    vinculoId: 'ag_2',
    emissao: '2026-07-11',
    valorCentavos: 185000,
  };
  assert.equal(validarDocumento(novo).ok, true);
});

test('validarDocumento recusa campos inválidos', () => {
  const r = validarDocumento({
    tipo: 'xpto' as never,
    titulo: '   ',
    vinculoTipo: 'nada' as never,
    emissao: '2026-13-40',
    vencimento: '2026-99-99',
    valorCentavos: -5,
  });
  assert.equal(r.ok, false);
  assert.ok(r.erros.length >= 5);
});
