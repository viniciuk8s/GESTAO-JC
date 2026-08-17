/**
 * API local — JC Elétrica & Solar
 * -------------------------------------------------------------
 * Reúne as três lógicas já testadas (agendamentos, jornadas e a regra de
 * conclusão) e adiciona o cadastro de foto do colaborador. Roda 100% local.
 *
 *   npm run api        (tsx watch)
 *   → http://localhost:3000
 */
import 'dotenv/config'; // carrega .env (DATABASE_URL, AUTH_JWT_SECRET, SEED_DEMO, CEO_*/TI_*…)
import express, { type Request, type Response, type NextFunction } from 'express';
import 'express-async-errors'; // faz rejeições de handlers async chegarem ao error middleware (não derruba o processo)
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { eq } from 'drizzle-orm';
import { type Servico, type PatchServico } from './agendamentos.ts';
import { type NovaJornada } from './jornadas.ts';
import { db, usandoPostgres } from './db/client.ts';
import { funcionarios } from './db/schema.ts';
import { emitirToken, type Papel } from './auth/token.ts';
import { verificarSenha, hashSenha } from './auth/senha.ts';
import { requireAuth, requireAdmin, protegerApi, type ReqAuth } from './auth/middleware.ts';
import { usuariosRepo, uploadsRepo, solicitacoesRepo, alteracoesRepo } from './db/authRepos.ts';
import * as XLSX from 'xlsx';
import { agendaRepo, diasRepo, documentosRepo, fiscalRepo, movimentacoesRepo, projetosRepo, notificacoesRepo, snapshotsRepo, hojeISO, agoraISO, type FiltroMov } from './db/repos.ts';
import { type NovoDocumento, type TipoDocumento, type VinculoTipo, type SituacaoManual } from './documentos.ts';
import { montarNotificacoes, aplicarEstado, resumoComEstado } from './notificacoes.ts';
import { emitirEvento, assinar, recentes, desde, type Recurso, type Evento } from './eventos.ts';
import { serieMensal, resumoComparativo } from './analytics.ts';
import { serieCarteira, resumoCarteira, evolucaoPorObra } from './evolucao.ts';
import { type NovaMovimentacao, type PatchMovimentacao, type TipoMov, type SituacaoMov } from './movimentacoes.ts';
import { type NovoProjeto, type PatchProjeto } from './projetos.ts';
import { mapearLinhas, type LinhaCrua } from './planilhas.ts';
import { initDb } from './db/init.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UPLOADS = path.join(ROOT, 'uploads');
const UPLOADS_DOCS = path.join(UPLOADS, 'docs');
fs.mkdirSync(UPLOADS_DOCS, { recursive: true });

// ---------- app ----------
const app = express();
// Atrás de um proxy (Render/Vercel/nginx): confia em 1 salto para que o IP real
// (X-Forwarded-For) seja usado pelo rate limit. Valor numérico = seguro (não permissivo).
app.set('trust proxy', 1);

// Headers de segurança. A API serve JSON e arquivos (não HTML), então o único
// ajuste ao padrão é liberar o carregamento CROSS-ORIGIN dos uploads (o front pode
// estar noutro domínio e as fotos/documentos entram via <img>/<a>).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: em DEV, sem ALLOWED_ORIGINS, libera todas as origens (conveniência).
// Em PRODUÇÃO, exige a lista explícita e FALHA NO BOOT se faltar ou contiver "*"
// — assim um deploy mal configurado nunca fica silenciosamente aberto.
const ehProd = process.env.NODE_ENV === 'production';
const ORIGENS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (ehProd && (ORIGENS.length === 0 || ORIGENS.includes('*'))) {
  throw new Error('ALLOWED_ORIGINS ausente/curinga em produção: defina os domínios do front (ex.: "https://gestao.jcsolar.com.br"), sem "*".');
}
const corsRestrito = ORIGENS.length > 0 && !ORIGENS.includes('*');
app.use(cors(corsRestrito ? { origin: ORIGENS } : undefined));

app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(UPLOADS));

// Rate limit só no login: trava tentativa de força bruta sem atrapalhar o uso normal.
// 10 tentativas por IP a cada 15 min → 429 com Retry-After.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' },
});
// Mesmo limite para o cadastro (evita flood de solicitações).
const registroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' },
});

// uploads agora vão para o BANCO (base64), servidos por GET /api/uploads/:id.
// Usamos memoryStorage para ter o buffer e persistir de forma portável (Neon/Postgres).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------- tempo real: helpers de evento ----------
/** R$ 1.234,56 a partir de centavos (grupos manuais — sem depender de ICU). */
function brlc(cents: number): string {
  const neg = cents < 0; const t = Math.abs(Math.round(cents));
  const s = String(Math.floor(t / 100)); let g = '';
  for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) g += '.'; g += s[i]; }
  return `${neg ? '-' : ''}R$ ${g},${String(t % 100).padStart(2, '0')}`;
}
/** Emite um evento no barramento. Nunca lança — jamais quebra a resposta da API. */
function evento(req: Request, recurso: Recurso, acao: string, titulo: string, detalhe?: string): void {
  try {
    const ator = (req as ReqAuth).usuario?.nome;
    const e: Parameters<typeof emitirEvento>[0] = { recurso, acao, titulo };
    if (detalhe) e.detalhe = detalhe;
    if (ator) e.ator = ator;
    emitirEvento(e);
  } catch { /* telemetria de evento nunca afeta o negócio */ }
}
/** Serializa um evento no formato text/event-stream (com id p/ Last-Event-ID). */
function sseFrame(e: Evento): string {
  return `id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`;
}

// ======================= AUTENTICAÇÃO (/auth) =======================
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

app.post('/auth/login', loginLimiter, async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '');
  const senha = String(req.body?.senha ?? req.body?.password ?? '');
  const u = await usuariosRepo.porEmail(email);
  if (!u || !u.ativo || !verificarSenha(senha, u.senhaHash)) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }
  const token = emitirToken({ id: u.id, email: u.email, nome: u.nome, role: u.role as Papel });
  res.json({ token, user: usuariosRepo.publico(u) });
});

app.get('/auth/me', requireAuth, async (req: Request, res: Response) => {
  const p = (req as ReqAuth).usuario!;
  const u = await usuariosRepo.porId(p.sub);
  if (!u || !u.ativo) return res.status(401).json({ erro: 'Sessão inválida.' });
  res.json({ user: usuariosRepo.publico(u) });
});

app.post('/auth/senha', requireAuth, async (req: Request, res: Response) => {
  const p = (req as ReqAuth).usuario!;
  const atual = String(req.body?.atual ?? '');
  const nova = String(req.body?.nova ?? '');
  if (nova.length < 6) return res.status(400).json({ erro: 'A nova senha deve ter ao menos 6 caracteres.' });
  const u = await usuariosRepo.porId(p.sub);
  if (!u || !verificarSenha(atual, u.senhaHash)) return res.status(400).json({ erro: 'Senha atual incorreta.' });
  await usuariosRepo.trocarSenha(u.id, hashSenha(nova));
  res.json({ ok: true });
});

// ---- Cadastro de conta (pendente) + aprovação pelo TI ----
// Qualquer pessoa pode SOLICITAR uma conta (nome/e-mail/senha). Fica PENDENTE
// até o TI aprovar. Só então o login funciona.
app.post('/auth/registrar', registroLimiter, async (req: Request, res: Response) => {
  const nome = String(req.body?.nome ?? '');
  const email = String(req.body?.email ?? '');
  const senha = String(req.body?.senha ?? req.body?.password ?? '');
  const r = await solicitacoesRepo.criar({ nome, email, senha });
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.status(201).json({ ok: true, mensagem: 'Solicitação enviada. Aguarde a liberação do TI para entrar.', solicitacao: r.solicitacao });
});

// As três abaixo são só para o TI (admin autenticado).
app.get('/auth/solicitacoes', requireAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ solicitacoes: await solicitacoesRepo.listar(status) });
});
app.post('/auth/solicitacoes/:id/aprovar', requireAdmin, async (req: Request, res: Response) => {
  const quem = (req as ReqAuth).usuario!.email;
  const role = req.body?.role === 'viewer' ? 'viewer' : 'admin';
  const r = await solicitacoesRepo.aprovar(String(req.params.id), quem, role);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true, usuario: r.usuario });
});
app.post('/auth/solicitacoes/:id/rejeitar', requireAdmin, async (req: Request, res: Response) => {
  const quem = (req as ReqAuth).usuario!.email;
  const r = await solicitacoesRepo.rejeitar(String(req.params.id), quem);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true });
});

// ---- Alterações de conta (o próprio usuário pede; o TI aprova) ----
// O usuário logado pede para trocar e-mail, senha e/ou foto → fica PENDENTE.
app.post('/auth/alteracoes', requireAuth, async (req: Request, res: Response) => {
  const u = (req as ReqAuth).usuario!;
  const mudancas = {
    email: req.body?.email != null ? String(req.body.email) : undefined,
    senha: req.body?.senha != null ? String(req.body.senha) : undefined,
    foto: req.body?.foto != null ? String(req.body.foto) : undefined,
  };
  const r = await alteracoesRepo.criar({ usuarioId: u.sub, email: u.email, mudancas });
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.status(201).json({ ok: true, mensagem: 'Pedido enviado. As mudanças valem quando o TI aprovar.', criadas: r.criadas });
});
app.get('/auth/alteracoes', requireAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ alteracoes: await alteracoesRepo.listar(status) });
});
app.post('/auth/alteracoes/:id/aprovar', requireAdmin, async (req: Request, res: Response) => {
  const quem = (req as ReqAuth).usuario!.email;
  const r = await alteracoesRepo.aprovar(String(req.params.id), quem);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true });
});
app.post('/auth/alteracoes/:id/rejeitar', requireAdmin, async (req: Request, res: Response) => {
  const quem = (req as ReqAuth).usuario!.email;
  const r = await alteracoesRepo.rejeitar(String(req.params.id), quem);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  res.json({ ok: true });
});

// A PARTIR DAQUI todo /api exige login (leitura) ou admin (escrita: POST/PUT/DELETE).
app.use('/api', protegerApi);

// ======================= UPLOADS (protegidos por sessão — servidos do banco) =======================
// Ficam DEPOIS do protegerApi: exigem uma sessão válida, autenticada via header
// `Authorization: Bearer` OU `?token=<jwt>` (o mesmo fallback do stream SSE — o
// EventSource/<img>/<a> não enviam header). Motivo: aqui se servem documentos
// sensíveis (contratos, NF, RH). Cache PRIVADO: a resposta é por usuário e não
// deve ser guardada por proxies compartilhados.
app.get('/api/uploads/:id', async (req: Request, res: Response) => {
  const f = await uploadsRepo.obter(String(req.params.id));
  if (!f) return res.status(404).json({ erro: 'Arquivo não encontrado' });
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(f.buffer);
});

// ======================= TEMPO REAL (SSE) =======================
// Push instantâneo de mudanças. O EventSource não envia header Authorization,
// então autentica via ?token= (o middleware já aceita esse fallback na query).
app.get('/api/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // desliga buffering em proxies (ex.: nginx)
  if (typeof (res as unknown as { flushHeaders?: () => void }).flushHeaders === 'function') {
    (res as unknown as { flushHeaders: () => void }).flushHeaders();
  }

  // reconexão: reenvia o que o cliente perdeu (Last-Event-ID) — nada de mudança escapa
  const raw = req.headers['last-event-id'] ?? req.query.lastEventId;
  const lastId = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isFinite(lastId) && lastId > 0) {
    for (const e of desde(lastId)) res.write(sseFrame(e));
  }
  res.write(': conectado\n\n'); // comentário — força o flush inicial

  const off = assinar((e) => res.write(sseFrame(e)));
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000); // mantém a conexão viva
  req.on('close', () => { clearInterval(ping); off(); res.end(); });
});

// buffer recente — alimenta o Feed de Atividade quando a página abre
app.get('/api/eventos', (req: Request, res: Response) => {
  const n = Number(req.query.limite);
  res.json({ eventos: recentes(Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 30) });
});

// ======================= COLABORADORES / FOTO (Postgres via Drizzle) =======================
app.get('/api/funcionarios', async (_req: Request, res: Response) => {
  const rows = await db.select().from(funcionarios).orderBy(funcionarios.id);
  res.json(rows);
});

// adicionar/alterar foto (mesmo endpoint — sobrescreve a anterior)
app.post('/api/funcionarios/:id/foto', upload.single('foto'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo de imagem no campo "foto"' });
  const upId = await uploadsRepo.salvar(req.file);
  const foto = `/api/uploads/${upId}`; // servido do banco (persistente)
  const [row] = await db.update(funcionarios).set({ foto }).where(eq(funcionarios.id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ erro: 'Colaborador não encontrado' });
  evento(req, 'colaboradores', 'foto', `Foto atualizada — ${row.nome}`);
  res.json(row);
});

// remover foto
app.delete('/api/funcionarios/:id/foto', async (req: Request, res: Response) => {
  const [row] = await db.update(funcionarios).set({ foto: null }).where(eq(funcionarios.id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ erro: 'Colaborador não encontrado' });
  evento(req, 'colaboradores', 'foto', `Foto removida — ${row.nome}`);
  res.json(row);
});

// ======================= AGENDAMENTOS (lógica, persistida em Postgres) =======================
app.get('/api/agendamentos', async (req: Request, res: Response) => {
  const data = typeof req.query.data === 'string' ? req.query.data : null;
  res.json(data ? await agendaRepo.doDia(data) : await agendaRepo.todos());
});

app.post('/api/agendamentos', async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Omit<Servico, 'id'> & { forcar?: boolean };
  const r = await agendaRepo.adicionar(b, { permitirConflito: !!b.forcar });
  if (!r.ok) return res.status(r.conflitos.length ? 409 : 400).json(r);
  evento(req, 'agendamentos', 'criar', `Novo agendamento: ${r.servico.titulo}`, r.servico.cliente);
  res.status(201).json(r.servico);
});

app.put('/api/agendamentos/:id', async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as PatchServico & { forcar?: boolean };
  const r = await agendaRepo.atualizar(String(req.params.id), b, { permitirConflito: !!b.forcar });
  if (!r.ok) {
    const naoEncontrado = r.erros[0] === 'Serviço não encontrado.';
    return res.status(r.conflitos.length ? 409 : naoEncontrado ? 404 : 400).json(r);
  }
  evento(req, 'agendamentos', 'atualizar', `Agendamento atualizado: ${r.servico.titulo}`, r.servico.cliente);
  res.json(r.servico);
});

app.delete('/api/agendamentos/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const ok = await agendaRepo.remover(id);
  // regra: remover serviço apaga a jornada gerada por ele
  await diasRepo.removerPorOrigem(id);
  if (ok) evento(req, 'agendamentos', 'remover', 'Agendamento removido');
  res.json({ ok });
});

// regra de conclusão: concluir serviço → gera jornada (se houver colaborador)
app.post('/api/agendamentos/:id/concluir', async (req: Request, res: Response) => {
  const r = await agendaRepo.concluir(String(req.params.id));
  if (!r.ok) return res.status(404).json({ ok: false, erros: ['Serviço não encontrado.'] });
  evento(req, 'agendamentos', 'concluir', `Serviço concluído: ${r.servico?.titulo ?? ''}`, r.jornada ? 'gerou diária' : undefined);
  res.json({ servico: r.servico, jornada: r.jornada });
});

// ======================= JORNADAS / DIAS TRABALHADOS =======================
app.get('/api/jornadas', async (_req: Request, res: Response) => res.json(await diasRepo.todas()));
app.get('/api/jornadas/por-funcionario', async (_req: Request, res: Response) => res.json(await diasRepo.porFuncionario()));

// lançamento manual de dia trabalhado
app.post('/api/jornadas', async (req: Request, res: Response) => {
  const r = await diasRepo.adicionarManual(req.body as NovaJornada);
  if (!r.ok) return res.status(400).json(r);
  evento(req, 'dias', 'criar', `Dia lançado — ${r.jornada.funcionario}`);
  res.status(201).json(r.jornada);
});
// marcar paga / a pagar
app.post('/api/jornadas/:id/pagar', async (req: Request, res: Response) => {
  const pago = req.body?.pago === undefined ? true : Boolean(req.body.pago);
  const ok = await diasRepo.marcarPago(String(req.params.id), pago);
  if (!ok) return res.status(404).json({ ok: false, erro: 'Jornada não encontrada' });
  evento(req, 'dias', 'pagar', pago ? 'Diária marcada como paga' : 'Diária marcada a pagar');
  res.json({ ok: true, pago });
});
// remover jornada
app.delete('/api/jornadas/:id', async (req: Request, res: Response) => {
  const ok = await diasRepo.remover(String(req.params.id));
  if (ok) evento(req, 'dias', 'remover', 'Diária removida');
  res.json({ ok });
});

// ======================= NOTIFICAÇÕES (central do sino) =======================
// Agrega pendências de serviços + pagamentos + documentos a partir das fontes já
// existentes, classifica por severidade e devolve a lista + o resumo (contador).
app.get('/api/notificacoes', async (req: Request, res: Response) => {
  const uid = (req as ReqAuth).usuario!.sub;
  const [agendamentos, obrigacoes, documentos, jornadas, estados] = await Promise.all([
    agendaRepo.todos(),
    fiscalRepo.obrigacoes(),
    documentosRepo.todos(),
    diasRepo.todas(),
    notificacoesRepo.estados(uid),
  ]);
  const hoje = hojeISO();
  const base = montarNotificacoes({ agendamentos, obrigacoes, documentos, jornadas }, hoje, { agora: agoraISO() });
  const notificacoes = aplicarEstado(base, estados); // remove dispensadas + marca lidas (por usuário)
  res.json({ hoje, notificacoes, resumo: resumoComEstado(notificacoes) });
});
// marcar todas as chaves informadas como lidas (registrar ANTES de /:chave/ler)
app.post('/api/notificacoes/ler-todas', async (req: Request, res: Response) => {
  const uid = (req as ReqAuth).usuario!.sub;
  const chaves = Array.isArray(req.body?.chaves) ? (req.body.chaves as unknown[]).map(String) : [];
  const n = await notificacoesRepo.marcarTodasLidas(uid, chaves);
  res.json({ ok: true, n });
});
// marcar UMA como lida (ou não lida com {lida:false})
app.post('/api/notificacoes/:chave/ler', async (req: Request, res: Response) => {
  const uid = (req as ReqAuth).usuario!.sub;
  const lida = req.body?.lida === undefined ? true : Boolean(req.body.lida);
  await notificacoesRepo.marcar(uid, String(req.params.chave), { lida });
  res.json({ ok: true, lida });
});
// dispensar (some da lista, persistente)
app.post('/api/notificacoes/:chave/dispensar', async (req: Request, res: Response) => {
  const uid = (req as ReqAuth).usuario!.sub;
  await notificacoesRepo.marcar(uid, String(req.params.chave), { dispensada: true });
  res.json({ ok: true });
});

// ======================= DOCUMENTOS (central + upload no padrão da foto) =======================
app.get('/api/documentos', async (req: Request, res: Response) => {
  const filtro: { tipo?: TipoDocumento; vinculoTipo?: VinculoTipo } = {};
  if (typeof req.query.tipo === 'string') filtro.tipo = req.query.tipo as TipoDocumento;
  if (typeof req.query.vinculo === 'string') filtro.vinculoTipo = req.query.vinculo as VinculoTipo;
  res.json(await documentosRepo.todos(filtro));
});

// documentos que vencem em breve (alerta) — registrar ANTES de :id
app.get('/api/documentos/a-vencer', async (req: Request, res: Response) => {
  const n = Number(req.query.dias);
  const dias = Number.isFinite(n) && n >= 0 ? n : 30; // 0 = só vencidos/hoje; default 30
  res.json(await documentosRepo.aVencer(dias));
});

// anexar documento: arquivo no campo "arquivo" + metadados no corpo (multipart)
app.post('/api/documentos', uploadDoc.single('arquivo'), async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, string | undefined>;
  const novo: NovoDocumento = {
    tipo: String(b.tipo ?? '') as TipoDocumento,
    titulo: String(b.titulo ?? ''),
    vinculoTipo: String(b.vinculoTipo ?? 'geral') as VinculoTipo,
  };
  if (b.vinculoId) novo.vinculoId = b.vinculoId;
  if (b.vinculoLabel) novo.vinculoLabel = b.vinculoLabel;
  if (b.emissao) novo.emissao = b.emissao;
  if (b.vencimento) novo.vencimento = b.vencimento;
  if (b.valorCentavos !== undefined && b.valorCentavos !== '') novo.valorCentavos = Number(b.valorCentavos);
  if (b.situacao) novo.situacao = b.situacao as SituacaoManual;
  if (b.obs) novo.obs = b.obs;
  if (req.file) {
    const upId = await uploadsRepo.salvar(req.file);
    novo.arquivo = `/api/uploads/${upId}`; // servido do banco (persistente)
    novo.formato = (path.extname(req.file.originalname).slice(1) || 'bin').toLowerCase();
    novo.tamanhoBytes = req.file.size;
  }
  const r = await documentosRepo.criar(novo);
  if (!r.ok) return res.status(400).json(r);
  evento(req, 'documentos', 'criar', `Documento anexado: ${r.documento.titulo}`, r.documento.vinculoLabel);
  res.status(201).json(r.documento);
});

app.delete('/api/documentos/:id', async (req: Request, res: Response) => {
  const ok = await documentosRepo.remover(String(req.params.id));
  if (ok) evento(req, 'documentos', 'remover', 'Documento removido');
  res.json({ ok });
});

// ======================= MOVIMENTAÇÕES (fluxo de caixa) =======================
function filtroDaQuery(req: Request): FiltroMov {
  const f: { tipo?: TipoMov; situacao?: SituacaoMov; de?: string; ate?: string } = {};
  if (req.query.tipo === 'entrada' || req.query.tipo === 'saida') f.tipo = req.query.tipo;
  if (req.query.situacao === 'pago' || req.query.situacao === 'pendente' || req.query.situacao === 'agendado') f.situacao = req.query.situacao;
  if (typeof req.query.de === 'string') f.de = req.query.de;
  if (typeof req.query.ate === 'string') f.ate = req.query.ate;
  return f;
}

app.get('/api/movimentacoes', async (req: Request, res: Response) => {
  res.json(await movimentacoesRepo.todos(filtroDaQuery(req)));
});

app.get('/api/movimentacoes/resumo', async (req: Request, res: Response) => {
  res.json(await movimentacoesRepo.resumo(filtroDaQuery(req)));
});

// comparação mês a mês (financeiro): série mensal + variação vs. mês anterior
app.get('/api/analytics/mensal', async (req: Request, res: Response) => {
  const movs = await movimentacoesRepo.todos();
  const opts: { de?: string; ate?: string } = {};
  if (typeof req.query.de === 'string' && /^\d{4}-\d{2}$/.test(req.query.de)) opts.de = req.query.de;
  if (typeof req.query.ate === 'string' && /^\d{4}-\d{2}$/.test(req.query.ate)) opts.ate = req.query.ate;
  const serie = serieMensal(movs, opts);
  res.json({ serie, ...resumoComparativo(serie) });
});

// evolução das obras (carteira/backlog + progresso) a partir dos snapshots mensais
app.get('/api/analytics/evolucao', async (_req: Request, res: Response) => {
  const [snaps, projs] = await Promise.all([snapshotsRepo.todos(), projetosRepo.todos()]);
  const serie = serieCarteira(snaps);
  const hoje = hojeISO();
  // situação de prazo do PORTFÓLIO ATUAL (previsão vs. hoje)
  const prazo = { emAndamento: 0, noPrazo: 0, atrasadas: 0, concluidas: 0, orcamento: 0 };
  for (const p of projs) {
    if (p.status === 'concluido') { prazo.concluidas += 1; continue; }
    if (p.status === 'orcamento') { prazo.orcamento += 1; continue; }
    if (p.status === 'em_andamento') {
      prazo.emAndamento += 1;
      const atrasada = !!p.previsao && p.previsao < hoje && p.progresso < 100;
      if (atrasada) prazo.atrasadas += 1; else prazo.noPrazo += 1;
    }
  }
  res.json({ serie, ...resumoCarteira(serie), porObra: evolucaoPorObra(snaps), prazo });
});

// captura o retrato atual das obras como snapshot do mês corrente ("fechamento")
app.post('/api/analytics/snapshot', async (req: Request, res: Response) => {
  const mes = hojeISO().slice(0, 7);
  const n = await snapshotsRepo.capturar(mes);
  evento(req, 'evolucao', 'snapshot', `Fechamento do mês ${mes}`, `${n} obras`);
  res.json({ ok: true, mes, obras: n });
});

app.post('/api/movimentacoes', async (req: Request, res: Response) => {
  const r = await movimentacoesRepo.criar(req.body as NovaMovimentacao);
  if (!r.ok) return res.status(400).json(r);
  const m = r.movimentacao;
  evento(req, 'movimentacoes', 'criar', `${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}: ${m.descricao}`, brlc(m.valorCentavos));
  res.status(201).json(r.movimentacao);
});

app.put('/api/movimentacoes/:id', async (req: Request, res: Response) => {
  const r = await movimentacoesRepo.atualizar(String(req.params.id), req.body as PatchMovimentacao);
  if (!r.ok) return res.status(r.erros[0] === 'Lançamento não encontrado.' ? 404 : 400).json(r);
  evento(req, 'movimentacoes', 'atualizar', `Lançamento atualizado: ${r.movimentacao.descricao}`, brlc(r.movimentacao.valorCentavos));
  res.json(r.movimentacao);
});

app.delete('/api/movimentacoes/:id', async (req: Request, res: Response) => {
  const ok = await movimentacoesRepo.remover(String(req.params.id));
  if (ok) evento(req, 'movimentacoes', 'remover', 'Lançamento excluído');
  res.json({ ok });
});

// ======================= PROJETOS (obras — visão 360°) =======================
app.get('/api/projetos', async (_req: Request, res: Response) => {
  res.json(await projetosRepo.todos());
});

app.get('/api/projetos/:id', async (req: Request, res: Response) => {
  const detalhe = await projetosRepo.detalhe(String(req.params.id));
  if (!detalhe) return res.status(404).json({ erro: 'Projeto não encontrado' });
  res.json(detalhe);
});

app.post('/api/projetos', async (req: Request, res: Response) => {
  const r = await projetosRepo.criar(req.body as NovoProjeto);
  if (!r.ok) return res.status(400).json(r);
  evento(req, 'projetos', 'criar', `Nova obra: ${r.projeto.nome}`, r.projeto.cliente);
  res.status(201).json(r.projeto);
});

app.put('/api/projetos/:id', async (req: Request, res: Response) => {
  const r = await projetosRepo.atualizar(String(req.params.id), req.body as PatchProjeto);
  if (!r.ok) return res.status(r.erros[0] === 'Projeto não encontrado.' ? 404 : 400).json(r);
  evento(req, 'projetos', 'atualizar', `Obra atualizada: ${r.projeto.nome}`, r.projeto.cliente);
  res.json(r.projeto);
});

app.delete('/api/projetos/:id', async (req: Request, res: Response) => {
  const ok = await projetosRepo.remover(String(req.params.id));
  if (ok) evento(req, 'projetos', 'remover', 'Obra removida');
  res.json({ ok });
});

// ======================= IMPORT / EXPORT (planilhas, via SheetJS) =======================
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// importar CSV/XLSX → movimentações. ?dry=1 só faz a prévia (não grava).
app.post('/api/importar', uploadMem.single('arquivo'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo CSV ou XLSX no campo "arquivo".' });
  let linhas: LinhaCrua[];
  try {
    const buf = req.file.buffer;
    // XLSX/XLS são binários (magic bytes PK.. ou D0CF..); CSV é texto → ler como UTF-8.
    const binario = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
    const wb = binario
      ? XLSX.read(buf, { type: 'buffer', raw: false })
      : XLSX.read(buf.toString('utf8'), { type: 'string', raw: false });
    const nome = wb.SheetNames[0];
    if (!nome) return res.status(400).json({ erro: 'Planilha vazia.' });
    linhas = XLSX.utils.sheet_to_json<LinhaCrua>(wb.Sheets[nome] as XLSX.WorkSheet, { defval: '', raw: false });
  } catch {
    return res.status(400).json({ erro: 'Não foi possível ler o arquivo (esperado CSV ou XLSX).' });
  }
  const { movs, erros } = mapearLinhas(linhas);
  const dry = req.query.dry === '1' || req.query.dry === 'true';
  if (dry) {
    return res.json({ total: linhas.length, validas: movs.length, invalidas: erros.length, previa: movs.slice(0, 8), erros: erros.slice(0, 6) });
  }
  const r = await movimentacoesRepo.criarVarios(movs);
  if (r.criadas.length) evento(req, 'movimentacoes', 'importar', `Importação: ${r.criadas.length} lançamento(s)`);
  res.json({ total: linhas.length, criadas: r.criadas.length, invalidas: erros.length + r.erros, erros: erros.slice(0, 6) });
});

const reais = (c: number): number => Math.round(c) / 100;
type Aba = { nome: string; linhas: Record<string, unknown>[] };

async function datasetMov(): Promise<Record<string, unknown>[]> {
  const rows = await movimentacoesRepo.todos();
  return rows.map((m) => ({ Data: m.data, Descrição: m.descricao, Categoria: m.categoria, Tipo: m.tipo, Forma: m.forma, 'Valor (R$)': reais(m.valorCentavos), Situação: m.situacao }));
}
async function datasetPorTipo(tipo: string): Promise<Aba[]> {
  if (tipo === 'agendamentos') {
    const rows = await agendaRepo.todos();
    return [{ nome: 'Agendamentos', linhas: rows.map((s) => ({ Data: s.data, Serviço: s.titulo, Cliente: s.cliente, Início: s.inicio, 'Duração (min)': s.duracaoMin, Técnico: s.tecnico, 'Valor (R$)': reais(s.valorCentavos), Situação: s.situacao })) }];
  }
  if (tipo === 'jornadas') {
    const rows = await diasRepo.todas();
    return [{ nome: 'Dias trabalhados', linhas: rows.map((j) => ({ Data: j.data, Colaborador: j.funcionario, Serviço: j.servico, Cliente: j.cliente, 'Duração (min)': j.duracaoMin, Pago: j.pago ? 'sim' : 'não' })) }];
  }
  if (tipo === 'documentos') {
    const rows = await documentosRepo.todos();
    return [{ nome: 'Documentos', linhas: rows.map((d) => ({ Título: d.titulo, Tipo: d.tipo, 'Vinculado a': d.vinculoLabel ?? '', Emissão: d.emissao ?? '', Vencimento: d.vencimento ?? '', 'Valor (R$)': d.valorCentavos != null ? reais(d.valorCentavos) : '' })) }];
  }
  return [{ nome: 'Movimentações', linhas: await datasetMov() }];
}
async function pacoteContador(): Promise<Aba[]> {
  const nf = (await documentosRepo.todos({ tipo: 'nota_fiscal' })).map((d) => ({ 'NF-e': d.titulo, Cliente: d.vinculoLabel ?? '', Emissão: d.emissao ?? '', 'Valor (R$)': d.valorCentavos != null ? reais(d.valorCentavos) : '' }));
  const extrato = await datasetMov();
  const r = await movimentacoesRepo.resumo();
  const dre: Record<string, unknown>[] = [
    { Item: 'Receita (entradas)', 'Valor (R$)': reais(r.entradasCentavos) },
    { Item: 'Despesas (saídas)', 'Valor (R$)': -reais(r.saidasCentavos) },
    ...r.porCategoria.map((c) => ({ Item: `  · ${c.categoria}`, 'Valor (R$)': -reais(c.saidaCentavos) })),
    { Item: 'Resultado do período', 'Valor (R$)': reais(r.saldoCentavos) },
    { Item: 'A receber', 'Valor (R$)': reais(r.aReceberCentavos) },
    { Item: 'A pagar', 'Valor (R$)': reais(r.aPagarCentavos) },
  ];
  return [{ nome: 'Notas fiscais', linhas: nf }, { nome: 'Extrato', linhas: extrato }, { nome: 'DRE', linhas: dre }];
}

// exportar em CSV ou XLSX. tipo=movimentacoes|agendamentos|jornadas|documentos|contador
app.get('/api/exportar', async (req: Request, res: Response) => {
  const tipo = String(req.query.tipo ?? 'movimentacoes');
  const formato = String(req.query.formato ?? 'xlsx');
  const sheets = tipo === 'contador' ? await pacoteContador() : await datasetPorTipo(tipo);
  const base = `jc-${tipo}-${hojeISO()}`;
  if (formato === 'csv') {
    const first = sheets[0] ?? { nome: 'dados', linhas: [] };
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(first.linhas), { FS: ';' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    return res.send('﻿' + csv); // BOM p/ o Excel abrir com acentos
  }
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.linhas), s.nome.slice(0, 31));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
  res.send(buf);
});

// ======================= FISCAL / IMPOSTOS =======================
app.get('/api/fiscal', async (_req: Request, res: Response) => res.json(await fiscalRepo.painel()));

app.post('/api/fiscal/obrigacoes/:id/pagar', async (req: Request, res: Response) => {
  const pago = req.body?.pago === undefined ? true : Boolean(req.body.pago);
  const ok = await fiscalRepo.marcarPago(String(req.params.id), pago);
  if (!ok) return res.status(404).json({ ok: false, erro: 'Obrigação não encontrada' });
  evento(req, 'fiscal', 'pagar', pago ? 'Obrigação fiscal paga' : 'Obrigação fiscal reaberta');
  res.json({ ok: true, pago });
});

// ---------- health ----------
app.get('/api/health', async (_req: Request, res: Response) => {
  const rows = await db.select({ id: funcionarios.id }).from(funcionarios);
  res.json({ ok: true, db: usandoPostgres ? 'postgres' : 'pglite', funcionarios: rows.length });
});

// ---------- tratamento de erros (último middleware) ----------
// Com o express-async-errors acima, QUALQUER erro de handler (inclusive de rotas
// async) cai aqui e vira uma resposta — o processo nunca mais é derrubado.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return; // resposta já iniciada (ex.: stream SSE) — não há o que fazer
  if (err instanceof multer.MulterError) {
    return res.status(413).json({ erro: 'Arquivo inválido ou grande demais.', codigo: err.code });
  }
  // JSON malformado no corpo (express.json lança SyntaxError com `body`) → erro do cliente.
  if (err instanceof SyntaxError && 'body' in (err as { body?: unknown })) {
    return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno.' });
});

const PORT = Number(process.env.PORT ?? 3000);
async function main(): Promise<void> {
  await initDb();
  app.listen(PORT, () => {
    console.log(`API JC Elétrica & Solar em http://localhost:${PORT}  (banco: ${usandoPostgres ? 'Postgres' : 'PGlite local'})`);
    console.log(`  GET  /api/funcionarios`);
    console.log(`  POST /api/funcionarios/:id/foto   (multipart campo "foto")  — adiciona/altera`);
    console.log(`  DELETE /api/funcionarios/:id/foto  — remove`);
    console.log(`  POST /api/agendamentos/:id/concluir  ·  GET /api/jornadas/por-funcionario`);
    console.log(`  GET/POST/DELETE /api/documentos  ·  GET /api/documentos/a-vencer`);
    console.log(`  GET /api/fiscal  ·  POST /api/fiscal/obrigacoes/:id/pagar`);
    console.log(`  GET/POST/PUT/DELETE /api/movimentacoes  ·  GET /api/movimentacoes/resumo`);
    console.log(`  POST /api/importar (CSV/XLSX)  ·  GET /api/exportar?tipo=&formato=`);
  });
}
void main();
