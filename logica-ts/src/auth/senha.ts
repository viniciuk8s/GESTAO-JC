/**
 * Hash de senha com scrypt (Node crypto — sem dependências externas).
 * Formato armazenado: `scrypt$N$r$p$saltHex$hashHex`. O salt é aleatório por senha
 * e a verificação é feita em tempo constante (timingSafeEqual).
 */
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384; // custo de CPU/memória (2^14)
const R = 8;
const P = 1;
const KEYLEN = 64;

export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verificarSenha(senha: string, armazenado: string): boolean {
  try {
    const partes = armazenado.split('$');
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
    const [, ns, rs, ps, saltHex, hashHex] = partes;
    const salt = Buffer.from(saltHex ?? '', 'hex');
    const alvo = Buffer.from(hashHex ?? '', 'hex');
    if (salt.length === 0 || alvo.length === 0) return false;
    const hash = scryptSync(senha, salt, alvo.length, { N: Number(ns), r: Number(rs), p: Number(ps), maxmem: 64 * 1024 * 1024 });
    return hash.length === alvo.length && timingSafeEqual(hash, alvo);
  } catch {
    return false;
  }
}
