/**
 * Repositórios de autenticação e uploads (Drizzle).
 * - usuariosRepo: contas de login (hash scrypt, papel admin|viewer).
 * - solicitacoesRepo: pedidos de acesso (aprovar cria o usuário).
 * - uploadsRepo: arquivos persistidos no banco em base64 (fotos/documentos).
 */
import { eq } from 'drizzle-orm';
import { db } from './client.ts';
import { usuarios, uploads, solicitacoes, alteracoes, type UsuarioRow, type SolicitacaoRow, type AlteracaoRow } from './schema.ts';
import { hashSenha } from '../auth/senha.ts';
import type { Papel } from '../auth/token.ts';

function novoId(prefixo: string): string {
  return `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function agoraISO(): string { return new Date().toISOString(); }
function normEmail(e: string): string { return (e ?? '').trim().toLowerCase(); }
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface PublicoUsuario { id: string; nome: string; email: string; role: Papel; foto: string | null; ativo: boolean; criadoEm: string }
function publico(u: UsuarioRow): PublicoUsuario {
  return { id: u.id, nome: u.nome, email: u.email, role: u.role as Papel, foto: u.foto ?? null, ativo: u.ativo, criadoEm: u.criadoEm };
}

export const usuariosRepo = {
  publico,
  async porEmail(email: string): Promise<UsuarioRow | undefined> {
    const [row] = await db.select().from(usuarios).where(eq(usuarios.email, normEmail(email)));
    return row;
  },
  async porId(id: string): Promise<UsuarioRow | undefined> {
    const [row] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    return row;
  },
  async listar(): Promise<PublicoUsuario[]> {
    const rows = await db.select().from(usuarios).orderBy(usuarios.criadoEm);
    return rows.map(publico);
  },
  async criar(dados: { nome: string; email: string; senha?: string; senhaHash?: string; role: Papel; foto?: string | null }): Promise<{ ok: true; usuario: PublicoUsuario } | { ok: false; erro: string }> {
    const email = normEmail(dados.email);
    if (!dados.nome || !dados.nome.trim()) return { ok: false, erro: 'Informe o nome.' };
    if (!RE_EMAIL.test(email)) return { ok: false, erro: 'E-mail inválido.' };
    if (dados.role !== 'admin' && dados.role !== 'viewer') return { ok: false, erro: 'Papel inválido.' };
    const hash = dados.senhaHash ?? (dados.senha ? hashSenha(dados.senha) : '');
    if (!hash) return { ok: false, erro: 'Informe a senha.' };
    if (await this.porEmail(email)) return { ok: false, erro: 'Já existe um usuário com esse e-mail.' };
    const row: UsuarioRow = { id: novoId('usr'), nome: dados.nome.trim(), email, senhaHash: hash, role: dados.role, foto: dados.foto ?? null, ativo: true, criadoEm: agoraISO() };
    await db.insert(usuarios).values(row);
    return { ok: true, usuario: publico(row) };
  },
  async trocarFoto(id: string, foto: string | null): Promise<PublicoUsuario | undefined> {
    const [row] = await db.update(usuarios).set({ foto }).where(eq(usuarios.id, id)).returning();
    return row ? publico(row) : undefined;
  },
  async trocarSenha(id: string, novaHash: string): Promise<boolean> {
    const [row] = await db.update(usuarios).set({ senhaHash: novaHash }).where(eq(usuarios.id, id)).returning();
    return !!row;
  },
  async trocarEmail(id: string, email: string): Promise<{ ok: true; usuario: PublicoUsuario } | { ok: false; erro: string }> {
    const e = normEmail(email);
    if (!RE_EMAIL.test(e)) return { ok: false, erro: 'E-mail inválido.' };
    const existente = await this.porEmail(e);
    if (existente && existente.id !== id) return { ok: false, erro: 'Já existe uma conta com esse e-mail.' };
    const [row] = await db.update(usuarios).set({ email: e }).where(eq(usuarios.id, id)).returning();
    return row ? { ok: true, usuario: publico(row) } : { ok: false, erro: 'Usuário não encontrado.' };
  },
  async definirPapel(id: string, role: Papel): Promise<PublicoUsuario | undefined> {
    const [row] = await db.update(usuarios).set({ role }).where(eq(usuarios.id, id)).returning();
    return row ? publico(row) : undefined;
  },
};

export interface PublicoSolicitacao { id: string; nome: string; email: string; status: string; criadoEm: string; decididoEm: string | null; decididoPor: string | null }
function publicoSol(s: SolicitacaoRow): PublicoSolicitacao {
  return { id: s.id, nome: s.nome, email: s.email, status: s.status, criadoEm: s.criadoEm, decididoEm: s.decididoEm ?? null, decididoPor: s.decididoPor ?? null };
}

// Solicitações de conta — cadastro pendente até o TI aprovar.
export const solicitacoesRepo = {
  publico: publicoSol,
  async porId(id: string): Promise<SolicitacaoRow | undefined> {
    const [row] = await db.select().from(solicitacoes).where(eq(solicitacoes.id, id));
    return row;
  },
  async listar(status?: string): Promise<PublicoSolicitacao[]> {
    const rows = status
      ? await db.select().from(solicitacoes).where(eq(solicitacoes.status, status)).orderBy(solicitacoes.criadoEm)
      : await db.select().from(solicitacoes).orderBy(solicitacoes.criadoEm);
    return rows.map(publicoSol);
  },
  async pendentePorEmail(email: string): Promise<SolicitacaoRow | undefined> {
    const rows = await db.select().from(solicitacoes).where(eq(solicitacoes.email, normEmail(email)));
    return rows.find((r) => r.status === 'pendente');
  },
  async criar(dados: { nome: string; email: string; senha: string }): Promise<{ ok: true; solicitacao: PublicoSolicitacao } | { ok: false; erro: string }> {
    const nome = (dados.nome ?? '').trim();
    const email = normEmail(dados.email);
    if (nome.length < 2) return { ok: false, erro: 'Informe seu nome completo.' };
    if (!RE_EMAIL.test(email)) return { ok: false, erro: 'E-mail inválido.' };
    if ((dados.senha ?? '').length < 6) return { ok: false, erro: 'A senha deve ter ao menos 6 caracteres.' };
    if (await usuariosRepo.porEmail(email)) return { ok: false, erro: 'Já existe uma conta com esse e-mail.' };
    if (await this.pendentePorEmail(email)) return { ok: false, erro: 'Já existe uma solicitação pendente com esse e-mail.' };
    const row: SolicitacaoRow = { id: novoId('sol'), nome, email, senhaHash: hashSenha(dados.senha), status: 'pendente', criadoEm: agoraISO(), decididoEm: null, decididoPor: null };
    await db.insert(solicitacoes).values(row);
    return { ok: true, solicitacao: publicoSol(row) };
  },
  async aprovar(id: string, decididoPor: string, role: Papel = 'admin'): Promise<{ ok: true; usuario: PublicoUsuario } | { ok: false; erro: string }> {
    const s = await this.porId(id);
    if (!s) return { ok: false, erro: 'Solicitação não encontrada.' };
    if (s.status !== 'pendente') return { ok: false, erro: `Esta solicitação já foi ${s.status}.` };
    if (await usuariosRepo.porEmail(s.email)) {
      await db.update(solicitacoes).set({ status: 'aprovada', decididoEm: agoraISO(), decididoPor }).where(eq(solicitacoes.id, id));
      return { ok: false, erro: 'Já existe uma conta com esse e-mail.' };
    }
    // cria a conta reaproveitando o hash de senha já guardado no pedido
    const r = await usuariosRepo.criar({ nome: s.nome, email: s.email, senhaHash: s.senhaHash, role });
    if (!r.ok) return r;
    await db.update(solicitacoes).set({ status: 'aprovada', decididoEm: agoraISO(), decididoPor }).where(eq(solicitacoes.id, id));
    return { ok: true, usuario: r.usuario };
  },
  async rejeitar(id: string, decididoPor: string): Promise<{ ok: boolean; erro?: string }> {
    const s = await this.porId(id);
    if (!s) return { ok: false, erro: 'Solicitação não encontrada.' };
    if (s.status !== 'pendente') return { ok: false, erro: `Esta solicitação já foi ${s.status}.` };
    await db.update(solicitacoes).set({ status: 'rejeitada', decididoEm: agoraISO(), decididoPor }).where(eq(solicitacoes.id, id));
    return { ok: true };
  },
};

export interface PublicoAlteracao { id: string; email: string; campo: string; rotulo: string; status: string; criadoEm: string; decididoEm: string | null; decididoPor: string | null }
function publicoAlt(a: AlteracaoRow): PublicoAlteracao {
  return { id: a.id, email: a.email, campo: a.campo, rotulo: a.rotulo, status: a.status, criadoEm: a.criadoEm, decididoEm: a.decididoEm ?? null, decididoPor: a.decididoPor ?? null };
}

// Alterações de conta (trocar e-mail/senha/foto) — pendentes de aprovação do TI.
export const alteracoesRepo = {
  publico: publicoAlt,
  async porId(id: string): Promise<AlteracaoRow | undefined> {
    const [row] = await db.select().from(alteracoes).where(eq(alteracoes.id, id));
    return row;
  },
  async listar(status?: string): Promise<PublicoAlteracao[]> {
    const rows = status
      ? await db.select().from(alteracoes).where(eq(alteracoes.status, status)).orderBy(alteracoes.criadoEm)
      : await db.select().from(alteracoes).orderBy(alteracoes.criadoEm);
    return rows.map(publicoAlt);
  },
  // cria uma linha por campo pedido (email/senha/foto). Retorna quantas criou.
  async criar(dados: { usuarioId: string; email: string; mudancas: { email?: string | undefined; senha?: string | undefined; foto?: string | undefined } }): Promise<{ ok: true; criadas: number } | { ok: false; erro: string }> {
    const m = dados.mudancas || {};
    const linhas: AlteracaoRow[] = [];
    const base = { usuarioId: dados.usuarioId, email: normEmail(dados.email), status: 'pendente', criadoEm: agoraISO(), decididoEm: null, decididoPor: null };
    if (m.email != null && m.email !== '') {
      const e = normEmail(m.email);
      if (!RE_EMAIL.test(e)) return { ok: false, erro: 'E-mail inválido.' };
      const existente = await usuariosRepo.porEmail(e);
      if (existente && existente.id !== dados.usuarioId) return { ok: false, erro: 'Já existe uma conta com esse e-mail.' };
      linhas.push({ id: novoId('alt'), ...base, campo: 'email', valor: e, rotulo: 'Trocar e-mail para ' + e });
    }
    if (m.senha != null && m.senha !== '') {
      if (m.senha.length < 6) return { ok: false, erro: 'A nova senha deve ter ao menos 6 caracteres.' };
      linhas.push({ id: novoId('alt'), ...base, campo: 'senha', valor: hashSenha(m.senha), rotulo: 'Trocar a senha' });
    }
    if (m.foto != null && m.foto !== '') {
      if (!/^data:image\//.test(m.foto)) return { ok: false, erro: 'Foto inválida.' };
      if (m.foto.length > 400000) return { ok: false, erro: 'Foto muito grande (reduza a imagem).' };
      linhas.push({ id: novoId('alt'), ...base, campo: 'foto', valor: m.foto, rotulo: 'Trocar a foto de perfil' });
    }
    if (!linhas.length) return { ok: false, erro: 'Nenhuma alteração informada.' };
    await db.insert(alteracoes).values(linhas);
    return { ok: true, criadas: linhas.length };
  },
  async aprovar(id: string, decididoPor: string): Promise<{ ok: boolean; erro?: string }> {
    const a = await this.porId(id);
    if (!a) return { ok: false, erro: 'Solicitação não encontrada.' };
    if (a.status !== 'pendente') return { ok: false, erro: `Esta solicitação já foi ${a.status}.` };
    if (a.campo === 'email') { const r = await usuariosRepo.trocarEmail(a.usuarioId, a.valor); if (!r.ok) return r; }
    else if (a.campo === 'senha') { await usuariosRepo.trocarSenha(a.usuarioId, a.valor); }
    else if (a.campo === 'foto') { await usuariosRepo.trocarFoto(a.usuarioId, a.valor); }
    await db.update(alteracoes).set({ status: 'aprovada', decididoEm: agoraISO(), decididoPor }).where(eq(alteracoes.id, id));
    return { ok: true };
  },
  async rejeitar(id: string, decididoPor: string): Promise<{ ok: boolean; erro?: string }> {
    const a = await this.porId(id);
    if (!a) return { ok: false, erro: 'Solicitação não encontrada.' };
    if (a.status !== 'pendente') return { ok: false, erro: `Esta solicitação já foi ${a.status}.` };
    await db.update(alteracoes).set({ status: 'rejeitada', decididoEm: agoraISO(), decididoPor }).where(eq(alteracoes.id, id));
    return { ok: true };
  },
};

export const uploadsRepo = {
  async salvar(file: { originalname: string; mimetype: string; size: number; buffer: Buffer }): Promise<string> {
    const id = novoId('up');
    await db.insert(uploads).values({ id, nome: file.originalname, mime: file.mimetype || 'application/octet-stream', tamanho: file.size, dados: file.buffer.toString('base64'), criadoEm: agoraISO() });
    return id;
  },
  async obter(id: string): Promise<{ mime: string; nome: string; buffer: Buffer } | undefined> {
    const [row] = await db.select().from(uploads).where(eq(uploads.id, id));
    if (!row) return undefined;
    return { mime: row.mime, nome: row.nome, buffer: Buffer.from(row.dados, 'base64') };
  },
};
