/**
 * JWT próprio (HS256) — emissão e verificação com Node crypto, sem dependências.
 * Assinado com AUTH_JWT_SECRET. Payload leva id/email/nome/role + iat/exp.
 * A verificação confere a assinatura (tempo constante) e a expiração.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Papel = 'admin' | 'viewer';
export interface TokenPayload {
  sub: string; // id do usuário
  email: string;
  nome: string;
  role: Papel;
  iat: number;
  exp: number;
}
export interface DadosUsuarioToken { id: string; email: string; nome: string; role: Papel; }

function segredo(): string {
  return process.env.AUTH_JWT_SECRET || 'jc-dev-secret-troque-em-producao-0000000000000000';
}

/** Converte '8h' | '30m' | '7d' | '3600s' | '3600' em segundos. */
export function ttlSegundos(ttl: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec((ttl || '').trim());
  if (!m) return 8 * 3600;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return n; // sem unidade = segundos
  }
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function emitirToken(u: DadosUsuarioToken, agoraMs: number = Date.now()): string {
  const iat = Math.floor(agoraMs / 1000);
  const exp = iat + ttlSegundos(process.env.AUTH_TOKEN_TTL || '8h');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = b64urlJson({ sub: u.id, email: u.email, nome: u.nome, role: u.role, iat, exp });
  const sig = createHmac('sha256', segredo()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verificarToken(token: string, agoraMs: number = Date.now()): TokenPayload | null {
  const partes = (token || '').split('.');
  if (partes.length !== 3) return null;
  const [h, p, s] = partes;
  const esperado = createHmac('sha256', segredo()).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(s ?? '');
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p ?? '', 'base64url').toString()) as TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(agoraMs / 1000)) return null;
    if (payload.role !== 'admin' && payload.role !== 'viewer') return null;
    return payload;
  } catch {
    return null;
  }
}
