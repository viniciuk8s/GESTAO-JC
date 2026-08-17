/**
 * Middlewares Express de autenticação/autorização.
 * - requireAuth: exige token válido (401 sem/expirado).
 * - requireAdmin: exige token válido + papel admin (403 se viewer).
 * - protegerApi: aplica a /api — leitura (GET/HEAD) exige login; escrita exige admin.
 */
import type { Request, Response, NextFunction } from 'express';
import { verificarToken, type TokenPayload } from './token.ts';

export interface ReqAuth extends Request { usuario?: TokenPayload }

export function usuarioDaRequisicao(req: Request): TokenPayload | null {
  const h = (req.headers.authorization as string | undefined) ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const token = m ? m[1]! : (typeof req.query.token === 'string' ? req.query.token : '');
  return token ? verificarToken(token) : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const u = usuarioDaRequisicao(req);
  if (!u) { res.status(401).json({ erro: 'Não autenticado', codigo: 'sem_token' }); return; }
  (req as ReqAuth).usuario = u;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const u = usuarioDaRequisicao(req);
  if (!u) { res.status(401).json({ erro: 'Não autenticado', codigo: 'sem_token' }); return; }
  if (u.role !== 'admin') { res.status(403).json({ erro: 'Acesso restrito ao administrador', codigo: 'sem_permissao' }); return; }
  (req as ReqAuth).usuario = u;
  next();
}

/** /api: leitura para qualquer usuário logado; escrita só admin (viewer → 403). */
export function protegerApi(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') { next(); return; } // deixa o CORS/preflight passar
  if (req.method === 'GET' || req.method === 'HEAD') { requireAuth(req, res, next); return; }
  requireAdmin(req, res, next);
}
