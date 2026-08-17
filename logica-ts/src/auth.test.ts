import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSenha, verificarSenha } from './auth/senha.ts';
import { emitirToken, verificarToken, ttlSegundos } from './auth/token.ts';

test('senha: hash verifica corretamente e rejeita a errada', () => {
  const h = hashSenha('segredo123');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(verificarSenha('segredo123', h), true);
  assert.equal(verificarSenha('errada', h), false);
});

test('senha: salt aleatório gera hashes diferentes p/ a mesma senha', () => {
  assert.notEqual(hashSenha('igual'), hashSenha('igual'));
});

test('senha: armazenado inválido não lança e retorna false', () => {
  assert.equal(verificarSenha('x', 'lixo'), false);
  assert.equal(verificarSenha('x', ''), false);
  assert.equal(verificarSenha('x', 'scrypt$1$2$3$$'), false);
});

test('token: emite e verifica payload', () => {
  const t = emitirToken({ id: 'u1', email: 'a@b.com', nome: 'Ana', role: 'admin' });
  const p = verificarToken(t);
  assert.ok(p);
  assert.equal(p?.sub, 'u1');
  assert.equal(p?.email, 'a@b.com');
  assert.equal(p?.role, 'admin');
});

test('token: assinatura adulterada é rejeitada', () => {
  const t = emitirToken({ id: 'u1', email: 'a@b.com', nome: 'Ana', role: 'viewer' });
  assert.equal(verificarToken(t + 'x'), null);
  const partes = t.split('.'); partes[2] = 'aaaabbbb';
  assert.equal(verificarToken(partes.join('.')), null);
  assert.equal(verificarToken('nada'), null);
});

test('token: expirado é rejeitado (TTL padrão 8h)', () => {
  const agora = Date.now();
  const t = emitirToken({ id: 'u1', email: 'a@b.com', nome: 'Ana', role: 'admin' }, agora - 9 * 3600 * 1000);
  assert.equal(verificarToken(t, agora), null);
  // ainda válido dentro da janela
  const t2 = emitirToken({ id: 'u1', email: 'a@b.com', nome: 'Ana', role: 'admin' }, agora - 1 * 3600 * 1000);
  assert.ok(verificarToken(t2, agora));
});

test('ttlSegundos entende unidades', () => {
  assert.equal(ttlSegundos('8h'), 28800);
  assert.equal(ttlSegundos('30m'), 1800);
  assert.equal(ttlSegundos('7d'), 604800);
  assert.equal(ttlSegundos('45'), 45);
  assert.equal(ttlSegundos(''), 28800);
});
