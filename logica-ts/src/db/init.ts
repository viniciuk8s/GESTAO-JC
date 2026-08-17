/**
 * Inicialização do banco.
 * -------------------------------------------------------------
 * 1) Aplica as migrações do Drizzle (pasta `drizzle/`) — cria as três
 *    tabelas (funcionarios, agendamentos, jornadas). Vale para PGlite e
 *    para um Postgres/Neon real; a migração é a mesma.
 * 2) Semeia os dados de exemplo na primeira execução (idempotente):
 *    colaboradores (vinculando a foto de exemplo em uploads/<id>.png) e os
 *    agendamentos iniciais. As jornadas nascem vazias — são geradas quando
 *    um serviço com colaborador é concluído.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db, usandoPostgres } from './client.ts';
import { funcionarios, agendamentos, documentos, obrigacoesFiscais, movimentacoes, projetos, usuarios, projetoSnapshots } from './schema.ts';
import { usuariosRepo } from './authRepos.ts';
import { FUNCIONARIOS_SEED } from '../funcionarios.ts';
import type { Servico } from '../agendamentos.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.resolve(__dirname, '../../uploads');
const MIGRATIONS = path.resolve(__dirname, '../../drizzle');

// Agendamentos de exemplo (mesma base do protótipo). Jornadas ficam vazias.
const AGENDA_SEED: readonly Servico[] = [
  { id: 'ag_1', data: '2026-07-22', titulo: 'Instalação de painéis solares', cliente: 'Condomínio Vila Verde', inicio: '09:00', duracaoMin: 120, tecnico: 'Carlos Lima', valorCentavos: 1250000, situacao: 'confirmado' },
  { id: 'ag_2', data: '2026-07-22', titulo: 'Manutenção elétrica predial', cliente: 'Mercado São José', inicio: '11:00', duracaoMin: 90, tecnico: 'João Pedro', valorCentavos: 185000, situacao: 'pendente' },
  { id: 'ag_3', data: '2026-07-22', titulo: 'Vistoria de geração solar', cliente: 'Padaria Pão Quente', inicio: '14:00', duracaoMin: 60, tecnico: 'Maria Souza', valorCentavos: 90000, situacao: 'confirmado' },
];

// Documentos de exemplo (mesma base da tela Relatórios). Sem arquivo físico ainda
// (arquivo = null); o upload real preenche esse caminho depois.
type DocSeed = {
  id: string; tipo: string; titulo: string; vinculoTipo: string;
  vinculoId?: string; vinculoLabel?: string; emissao?: string; vencimento?: string;
  valorCentavos?: number; situacao?: string; tamanhoBytes?: number;
};
const DOC_SEED: readonly DocSeed[] = [
  { id: 'doc_1', tipo: 'contrato', titulo: 'Contrato de instalação solar', vinculoTipo: 'cliente', vinculoLabel: 'Condomínio Vila Verde', emissao: '2026-07-02', vencimento: '2027-07-02', valorCentavos: 1250000, tamanhoBytes: 245760 },
  { id: 'doc_2', tipo: 'nota_fiscal', titulo: 'Nota fiscal NF-e 001432', vinculoTipo: 'servico', vinculoId: 'ag_2', vinculoLabel: 'Mercado São José', emissao: '2026-07-11', valorCentavos: 185000, situacao: 'emitida', tamanhoBytes: 122880 },
  { id: 'doc_3', tipo: 'garantia', titulo: 'Garantia — inversor Growatt 8 kW', vinculoTipo: 'cliente', vinculoLabel: 'Condomínio Vila Verde', emissao: '2026-07-05', vencimento: '2031-07-05', tamanhoBytes: 1258291 },
  { id: 'doc_4', tipo: 'laudo', titulo: 'Laudo técnico / ART-CREA', vinculoTipo: 'cliente', vinculoLabel: 'Padaria Pão Quente', emissao: '2026-07-14', vencimento: '2026-08-20', tamanhoBytes: 327680 },
  { id: 'doc_5', tipo: 'homologacao', titulo: 'Homologação — parecer de acesso (Enel)', vinculoTipo: 'cliente', vinculoLabel: 'Condomínio Vila Verde', emissao: '2026-07-08', situacao: 'aprovado', tamanhoBytes: 92160 },
  { id: 'doc_6', tipo: 'rh', titulo: 'Certificação NR-35 (trabalho em altura)', vinculoTipo: 'colaborador', vinculoId: 'f2', vinculoLabel: 'Rafael Gomes', emissao: '2025-08-28', vencimento: '2026-08-28', tamanhoBytes: 204800 },
  { id: 'doc_7', tipo: 'compra', titulo: 'Nota de compra — 12 módulos 550 W', vinculoTipo: 'fornecedor', vinculoLabel: 'SolarTech', emissao: '2026-07-01', valorCentavos: 940000, tamanhoBytes: 184320 },
  { id: 'doc_8', tipo: 'recibo', titulo: 'Recibo de pagamento — jornada 22/07', vinculoTipo: 'colaborador', vinculoId: 'f1', vinculoLabel: 'Carlos Lima', emissao: '2026-07-22', situacao: 'pago', tamanhoBytes: 61440 },
  { id: 'doc_9', tipo: 'rh', titulo: 'Contrato de trabalho', vinculoTipo: 'colaborador', vinculoId: 'f3', vinculoLabel: 'João Pedro', emissao: '2025-01-10', tamanhoBytes: 215040 },
];

// Guias de impostos de exemplo (aba Fiscal). Datas coerentes com julho/2026.
type ObrigSeed = { id: string; tipo: string; descricao: string; competencia: string; vencimento: string; valorCentavos: number };
const OBRIG_SEED: readonly ObrigSeed[] = [
  { id: 'of_1', tipo: 'das', descricao: 'DAS — Simples Nacional', competencia: '2026-07', vencimento: '2026-08-20', valorCentavos: 418000 },
  { id: 'of_2', tipo: 'iss', descricao: 'ISS — serviços', competencia: '2026-07', vencimento: '2026-08-15', valorCentavos: 89000 },
  { id: 'of_3', tipo: 'fgts', descricao: 'FGTS + INSS — folha', competencia: '2026-06', vencimento: '2026-07-07', valorCentavos: 57000 },
];

// Movimentações de exemplo (mesma base do protótipo — os totais batem:
// entradas 22.850, saídas 17.500, saldo 5.350, a receber 8.500).
type MovSeed = { id: string; data: string; descricao: string; categoria: string; tipo: string; forma: string; valorCentavos: number; situacao: string; projetoId?: string };
const MOV_SEED: readonly MovSeed[] = [
  { id: 'mv_1', data: '2026-07-22', descricao: 'Instalação solar — Cond. Vila Verde', categoria: 'Instalação solar', tipo: 'entrada', forma: 'pix', valorCentavos: 1250000, situacao: 'pago', projetoId: 'prj_1' },
  { id: 'mv_2', data: '2026-07-22', descricao: 'Compra de cabos e disjuntores', categoria: 'Fornecedores', tipo: 'saida', forma: 'boleto', valorCentavos: 420000, situacao: 'pago', projetoId: 'prj_1' },
  { id: 'mv_3', data: '2026-07-22', descricao: 'Manutenção elétrica — Mercado São José', categoria: 'Serviços', tipo: 'entrada', forma: 'transferencia', valorCentavos: 185000, situacao: 'pago', projetoId: 'prj_3' },
  { id: 'mv_4', data: '2026-07-21', descricao: 'Folha de pagamento — equipe', categoria: 'Folha de pagamento', tipo: 'saida', forma: 'transferencia', valorCentavos: 980000, situacao: 'pago' },
  { id: 'mv_5', data: '2026-07-21', descricao: 'Projeto fotovoltaico — Padaria', categoria: 'Instalação solar', tipo: 'entrada', forma: 'boleto', valorCentavos: 760000, situacao: 'pendente', projetoId: 'prj_2' },
  { id: 'mv_6', data: '2026-07-18', descricao: 'Aluguel do galpão', categoria: 'Instalações', tipo: 'saida', forma: 'boleto', valorCentavos: 350000, situacao: 'pago' },
  { id: 'mv_7', data: '2026-07-18', descricao: 'Vistoria de geração — Aldeota', categoria: 'Serviços', tipo: 'entrada', forma: 'pix', valorCentavos: 90000, situacao: 'agendado' },
  // --- histórico (maio/junho) para a comparação mês a mês ---
  { id: 'mv_8', data: '2026-05-10', descricao: 'Instalação solar — Residência Aldeota', categoria: 'Instalação solar', tipo: 'entrada', forma: 'pix', valorCentavos: 850000, situacao: 'pago' },
  { id: 'mv_9', data: '2026-05-22', descricao: 'Manutenção elétrica — Loja Centro', categoria: 'Serviços', tipo: 'entrada', forma: 'transferencia', valorCentavos: 350000, situacao: 'pago' },
  { id: 'mv_10', data: '2026-05-14', descricao: 'Folha de pagamento — equipe', categoria: 'Folha de pagamento', tipo: 'saida', forma: 'transferencia', valorCentavos: 620000, situacao: 'pago' },
  { id: 'mv_11', data: '2026-05-06', descricao: 'Compra de cabos e disjuntores', categoria: 'Fornecedores', tipo: 'saida', forma: 'boleto', valorCentavos: 130000, situacao: 'pago' },
  { id: 'mv_12', data: '2026-05-05', descricao: 'Aluguel do galpão', categoria: 'Instalações', tipo: 'saida', forma: 'boleto', valorCentavos: 350000, situacao: 'pago' },
  { id: 'mv_13', data: '2026-06-09', descricao: 'Instalação solar — Condomínio Jardim', categoria: 'Instalação solar', tipo: 'entrada', forma: 'boleto', valorCentavos: 1200000, situacao: 'pago' },
  { id: 'mv_14', data: '2026-06-18', descricao: 'Projeto fotovoltaico — Mercado Sul', categoria: 'Instalação solar', tipo: 'entrada', forma: 'pix', valorCentavos: 500000, situacao: 'pago' },
  { id: 'mv_15', data: '2026-06-25', descricao: 'Vistoria de geração — Bairro Novo', categoria: 'Serviços', tipo: 'entrada', forma: 'pix', valorCentavos: 150000, situacao: 'pago' },
  { id: 'mv_16', data: '2026-06-12', descricao: 'Folha de pagamento — equipe', categoria: 'Folha de pagamento', tipo: 'saida', forma: 'transferencia', valorCentavos: 900000, situacao: 'pago' },
  { id: 'mv_17', data: '2026-06-07', descricao: 'Compra de módulos 550 W', categoria: 'Fornecedores', tipo: 'saida', forma: 'boleto', valorCentavos: 420000, situacao: 'pago' },
];

// Projetos (obras) de exemplo — vinculam agendamentos/documentos pelo nome do cliente
// e movimentações pelo id (ver MOV_SEED acima).
type ProjSeed = {
  id: string; nome: string; cliente: string; tipo: string; status: string; responsavel: string;
  endereco: string | null; valorContratadoCentavos: number; inicio: string | null; previsao: string | null;
  progresso: number; obs: string | null; criadoEm: string;
};
const PROJ_SEED: readonly ProjSeed[] = [
  { id: 'prj_1', nome: 'Instalação solar — Cond. Vila Verde', cliente: 'Condomínio Vila Verde', tipo: 'instalacao_solar', status: 'em_andamento', responsavel: 'Carlos Lima', endereco: 'Rua das Palmeiras, 120 — Fortaleza/CE', valorContratadoCentavos: 1250000, inicio: '2026-07-02', previsao: '2026-08-15', progresso: 60, obs: null, criadoEm: '2026-07-02' },
  { id: 'prj_2', nome: 'Projeto fotovoltaico — Padaria Pão Quente', cliente: 'Padaria Pão Quente', tipo: 'projeto_fotovoltaico', status: 'orcamento', responsavel: 'Maria Souza', endereco: null, valorContratadoCentavos: 760000, inicio: '2026-07-14', previsao: '2026-09-01', progresso: 15, obs: null, criadoEm: '2026-07-14' },
  { id: 'prj_3', nome: 'Manutenção elétrica — Mercado São José', cliente: 'Mercado São José', tipo: 'manutencao', status: 'concluido', responsavel: 'João Pedro', endereco: null, valorContratadoCentavos: 185000, inicio: '2026-07-11', previsao: '2026-07-11', progresso: 100, obs: null, criadoEm: '2026-07-11' },
];

// Histórico mensal das obras (mai/jun/jul) — habilita as curvas de carteira e progresso.
interface SnapSeed { mes: string; projetoId: string; nome: string; cliente: string; status: string; progresso: number; contratadoCentavos: number; recebidoCentavos: number; aReceberCentavos: number; }
const SNAP_SEED: readonly SnapSeed[] = [
  // prj_1 — Instalação solar (Cond. Vila Verde) · contratado 1.250.000
  { mes: '2026-05', projetoId: 'prj_1', nome: 'Instalação solar — Cond. Vila Verde', cliente: 'Condomínio Vila Verde', status: 'em_andamento', progresso: 20, contratadoCentavos: 1250000, recebidoCentavos: 0, aReceberCentavos: 1250000 },
  { mes: '2026-06', projetoId: 'prj_1', nome: 'Instalação solar — Cond. Vila Verde', cliente: 'Condomínio Vila Verde', status: 'em_andamento', progresso: 45, contratadoCentavos: 1250000, recebidoCentavos: 600000, aReceberCentavos: 650000 },
  { mes: '2026-07', projetoId: 'prj_1', nome: 'Instalação solar — Cond. Vila Verde', cliente: 'Condomínio Vila Verde', status: 'em_andamento', progresso: 60, contratadoCentavos: 1250000, recebidoCentavos: 1250000, aReceberCentavos: 0 },
  // prj_3 — Manutenção elétrica (Mercado São José) · contratado 185.000
  { mes: '2026-05', projetoId: 'prj_3', nome: 'Manutenção elétrica — Mercado São José', cliente: 'Mercado São José', status: 'em_andamento', progresso: 50, contratadoCentavos: 185000, recebidoCentavos: 0, aReceberCentavos: 185000 },
  { mes: '2026-06', projetoId: 'prj_3', nome: 'Manutenção elétrica — Mercado São José', cliente: 'Mercado São José', status: 'em_andamento', progresso: 85, contratadoCentavos: 185000, recebidoCentavos: 0, aReceberCentavos: 185000 },
  { mes: '2026-07', projetoId: 'prj_3', nome: 'Manutenção elétrica — Mercado São José', cliente: 'Mercado São José', status: 'concluido', progresso: 100, contratadoCentavos: 185000, recebidoCentavos: 185000, aReceberCentavos: 0 },
  // prj_2 — Projeto fotovoltaico (Padaria) · contratado 760.000 (surge em jun como orçamento)
  { mes: '2026-06', projetoId: 'prj_2', nome: 'Projeto fotovoltaico — Padaria Pão Quente', cliente: 'Padaria Pão Quente', status: 'orcamento', progresso: 0, contratadoCentavos: 760000, recebidoCentavos: 0, aReceberCentavos: 760000 },
  { mes: '2026-07', projetoId: 'prj_2', nome: 'Projeto fotovoltaico — Padaria Pão Quente', cliente: 'Padaria Pão Quente', status: 'orcamento', progresso: 15, contratadoCentavos: 760000, recebidoCentavos: 0, aReceberCentavos: 760000 },
];

/** Aplica as migrações com o migrator correto para a engine em uso. */
async function migrar(): Promise<void> {
  if (usandoPostgres) {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db as never, { migrationsFolder: MIGRATIONS });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(db as never, { migrationsFolder: MIGRATIONS });
  }
}

/** Cria as tabelas de auth/uploads (fora das migrações do Drizzle). Idempotente. */
async function criarTabelasAuth(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS usuarios (
    id text PRIMARY KEY, nome text NOT NULL, email text NOT NULL,
    senha_hash text NOT NULL, role text NOT NULL DEFAULT 'viewer',
    foto text, ativo boolean NOT NULL DEFAULT true, criado_em text NOT NULL
  )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_uidx ON usuarios (email)`);
  // solicitações de conta (cadastro pendente de aprovação do TI)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS solicitacoes (
    id text PRIMARY KEY, nome text NOT NULL, email text NOT NULL, senha_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pendente', criado_em text NOT NULL,
    decidido_em text, decidido_por text
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS solicitacoes_status_idx ON solicitacoes (status)`);
  // alterações de conta (troca de e-mail/senha/foto pendente de aprovação do TI)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS alteracoes (
    id text PRIMARY KEY, usuario_id text NOT NULL, email text NOT NULL,
    campo text NOT NULL, valor text NOT NULL, rotulo text NOT NULL,
    status text NOT NULL DEFAULT 'pendente', criado_em text NOT NULL,
    decidido_em text, decidido_por text
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS alteracoes_status_idx ON alteracoes (status)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS uploads (
    id text PRIMARY KEY, nome text NOT NULL, mime text NOT NULL, tamanho integer NOT NULL,
    dados text NOT NULL, criado_em text NOT NULL
  )`);
  // estado por usuário das notificações (lida / dispensada)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS notificacoes_estado (
    usuario_id text NOT NULL, chave text NOT NULL,
    lida boolean NOT NULL DEFAULT false, dispensada boolean NOT NULL DEFAULT false,
    atualizado_em text NOT NULL, PRIMARY KEY (usuario_id, chave)
  )`);
  // snapshot mensal das obras (histórico p/ evolução de carteira e progresso)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS projeto_snapshots (
    mes text NOT NULL, projeto_id text NOT NULL, nome text NOT NULL, cliente text NOT NULL,
    status text NOT NULL, progresso integer NOT NULL,
    contratado_centavos integer NOT NULL, recebido_centavos integer NOT NULL, a_receber_centavos integer NOT NULL,
    criado_em text NOT NULL, PRIMARY KEY (mes, projeto_id)
  )`);
  // vínculo estável por id da obra (idempotente; complementa a migração do Drizzle
  // caso ela não seja regenerada). Assim renomear um cliente não desfaz o vínculo.
  await db.execute(sql`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS projeto_id text`);
  await db.execute(sql`ALTER TABLE documentos ADD COLUMN IF NOT EXISTS projeto_id text`);

  // Índices secundários nas colunas efetivamente filtradas em SQL. Inócuos com
  // poucos registros; evitam varredura completa conforme o volume cresce. (As
  // agregações que hoje filtram em JS — 360°/analytics — só se beneficiam quando
  // migradas para SQL; ver PROXIMOS-PASSOS.) Idempotentes.
  await db.execute(sql`CREATE INDEX IF NOT EXISTS mov_data_idx        ON movimentacoes (data)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS mov_projeto_idx     ON movimentacoes (projeto_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agenda_data_idx     ON agendamentos (data)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS agenda_projeto_idx  ON agendamentos (projeto_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS jornadas_origem_idx ON jornadas (origem_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS doc_projeto_idx     ON documentos (projeto_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS doc_tipo_idx        ON documentos (tipo)`);
}

/**
 * Liga os agendamentos/documentos LEGADOS à obra por id, a partir do nome do
 * cliente/rótulo (a regra antiga). Só preenche onde ainda está NULL — preserva os
 * vínculos que existiam por texto e os torna estáveis a renomeações. Idempotente:
 * rodar de novo só completa o que faltar; não mexe no que já tem id.
 */
async function backfillVinculoObras(): Promise<void> {
  await db.execute(sql`
    UPDATE agendamentos SET projeto_id = p.id
    FROM projetos p
    WHERE agendamentos.projeto_id IS NULL AND agendamentos.cliente = p.cliente
  `);
  await db.execute(sql`
    UPDATE documentos SET projeto_id = p.id
    FROM projetos p
    WHERE documentos.projeto_id IS NULL AND documentos.vinculo_label = p.cliente
  `);
}

/**
 * Semeia os DOIS usuários fixos do sistema na primeira execução: CEO e TI.
 * Ambos com acesso total (admin). Credenciais/nome configuráveis por variáveis
 * de ambiente (CEO_*, TI_*). Não há cadastro/solicitação de acesso.
 */
async function seedUsuarios(): Promise<void> {
  const existentes = await db.select({ id: usuarios.id }).from(usuarios);
  if (existentes.length > 0) return;
  await usuariosRepo.criar({
    nome: process.env.CEO_NOME || 'Rodrigo Dantas',
    email: process.env.CEO_EMAIL || 'ceo@jcsolar.com',
    senha: process.env.CEO_SENHA || 'ceo123', role: 'admin',
  });
  await usuariosRepo.criar({
    nome: process.env.TI_NOME || 'TI — JC Elétrica & Solar',
    email: process.env.TI_EMAIL || 'ti@jcsolar.com',
    senha: process.env.TI_SENHA || 'ti123', role: 'admin',
  });
}

export async function initDb(): Promise<void> {
  await migrar();
  await criarTabelasAuth();

  // SEED_DEMO=0 → começa VAZIO (só a equipe e os 2 usuários; nada de dados de exemplo).
  // Ideal para cadastrar tudo do zero. Padrão (1) semeia os dados de demonstração.
  const SEED_DEMO = process.env.SEED_DEMO !== '0';

  // --- colaboradores (sempre; é a equipe usada nos avatares e seletores) ---
  const temFunc = await db.select({ id: funcionarios.id }).from(funcionarios);
  if (temFunc.length === 0) {
    const linhas = FUNCIONARIOS_SEED.map((f) => {
      const arq = path.join(UPLOADS, `${f.id}.png`);
      return { id: f.id, nome: f.nome, setor: f.setor, cor: f.cor, foto: fs.existsSync(arq) ? `/uploads/${f.id}.png` : null };
    });
    await db.insert(funcionarios).values(linhas);
  }

  // --- agendamentos iniciais ---
  const temAgenda = await db.select({ id: agendamentos.id }).from(agendamentos);
  if (SEED_DEMO && temAgenda.length === 0) {
    await db.insert(agendamentos).values(AGENDA_SEED.map((s) => ({ ...s, obs: s.obs ?? null })));
  }

  // --- documentos iniciais ---
  const temDocs = await db.select({ id: documentos.id }).from(documentos);
  if (SEED_DEMO && temDocs.length === 0) {
    await db.insert(documentos).values(
      DOC_SEED.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        titulo: d.titulo,
        arquivo: null,
        formato: 'pdf',
        tamanhoBytes: d.tamanhoBytes ?? null,
        vinculoTipo: d.vinculoTipo,
        vinculoId: d.vinculoId ?? null,
        vinculoLabel: d.vinculoLabel ?? null,
        emissao: d.emissao ?? null,
        vencimento: d.vencimento ?? null,
        valorCentavos: d.valorCentavos ?? null,
        situacao: d.situacao ?? null,
        obs: null,
        criadoEm: d.emissao ?? '2026-07-01',
      })),
    );
  }

  // --- obrigações fiscais iniciais ---
  const temObrig = await db.select({ id: obrigacoesFiscais.id }).from(obrigacoesFiscais);
  if (SEED_DEMO && temObrig.length === 0) {
    await db.insert(obrigacoesFiscais).values(
      OBRIG_SEED.map((o) => ({ ...o, pago: false, guiaDocId: null })),
    );
  }

  // --- projetos iniciais (antes das movimentações, que os referenciam) ---
  const temProj = await db.select({ id: projetos.id }).from(projetos);
  if (SEED_DEMO && temProj.length === 0) {
    await db.insert(projetos).values(PROJ_SEED.map((p) => ({ ...p })));
  }

  // --- snapshots históricos das obras (evolução de carteira/progresso) ---
  const temSnap = await db.select({ mes: projetoSnapshots.mes }).from(projetoSnapshots);
  if (SEED_DEMO && temSnap.length === 0) {
    await db.insert(projetoSnapshots).values(SNAP_SEED.map((s) => ({ ...s, criadoEm: `${s.mes}-28` })));
  }

  // --- movimentações iniciais ---
  const temMov = await db.select({ id: movimentacoes.id }).from(movimentacoes);
  if (SEED_DEMO && temMov.length === 0) {
    await db.insert(movimentacoes).values(
      MOV_SEED.map((m) => ({ ...m, recorrente: false, obs: null, projetoId: m.projetoId ?? null })),
    );
  }

  // --- usuários (admin + viewer de exemplo) ---
  await seedUsuarios();

  // --- vínculo estável: liga o legado (agendamentos/documentos) à obra por id ---
  await backfillVinculoObras();
}
