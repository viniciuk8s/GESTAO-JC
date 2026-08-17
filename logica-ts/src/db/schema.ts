/**
 * Schema Drizzle — JC Elétrica & Solar.
 * Tabela de colaboradores (com a foto de perfil).
 */
import { pgTable, text, integer, boolean, primaryKey } from 'drizzle-orm/pg-core';

export const funcionarios = pgTable('funcionarios', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  setor: text('setor').notNull(),
  cor: text('cor').notNull(),
  foto: text('foto'), // caminho servido pela API (/uploads/...) ou null
});

export const agendamentos = pgTable('agendamentos', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // 'YYYY-MM-DD'
  titulo: text('titulo').notNull(),
  cliente: text('cliente').notNull(),
  inicio: text('inicio').notNull(), // 'HH:MM'
  duracaoMin: integer('duracao_min').notNull(),
  tecnico: text('tecnico').notNull(),
  valorCentavos: integer('valor_centavos').notNull(),
  situacao: text('situacao').notNull(), // confirmado|pendente|cancelado|concluido
  obs: text('obs'),
  projetoId: text('projeto_id'), // id da obra (vínculo estável) | null
});

export const jornadas = pgTable('jornadas', {
  id: text('id').primaryKey(),
  origemId: text('origem_id').notNull(),
  funcionario: text('funcionario').notNull(),
  data: text('data').notNull(),
  servico: text('servico').notNull(),
  cliente: text('cliente').notNull(),
  duracaoMin: integer('duracao_min').notNull(),
  pago: boolean('pago').notNull().default(false),
});

// Central de documentos (contratos, NF, garantias, laudos/ART, RH...). Upload no
// mesmo padrão da foto do colaborador: o arquivo vai para /uploads/docs e o caminho fica aqui.
export const documentos = pgTable('documentos', {
  id: text('id').primaryKey(),
  tipo: text('tipo').notNull(), // contrato|nota_fiscal|garantia|laudo|homologacao|recibo|compra|rh
  titulo: text('titulo').notNull(),
  arquivo: text('arquivo'), // caminho servido pela API (/uploads/docs/...) ou null
  formato: text('formato'), // pdf|jpg|docx|xlsx...
  tamanhoBytes: integer('tamanho_bytes'),
  vinculoTipo: text('vinculo_tipo').notNull(), // cliente|servico|colaborador|fornecedor|geral
  vinculoId: text('vinculo_id'), // id da entidade (ag_2, f1) ou nome do cliente/obra
  vinculoLabel: text('vinculo_label'), // rótulo exibido (ex.: "Condomínio Vila Verde")
  emissao: text('emissao'), // 'YYYY-MM-DD'
  vencimento: text('vencimento'), // 'YYYY-MM-DD' | null
  valorCentavos: integer('valor_centavos'), // null quando não se aplica
  situacao: text('situacao'), // rótulo manual: aprovado|pago|emitida | null
  obs: text('obs'),
  projetoId: text('projeto_id'), // id da obra (vínculo estável) | null
  criadoEm: text('criado_em').notNull(), // 'YYYY-MM-DD'
});

// Guias de impostos / obrigações fiscais (aba Fiscal): DAS, ISS, INSS, FGTS...
export const obrigacoesFiscais = pgTable('obrigacoes_fiscais', {
  id: text('id').primaryKey(),
  tipo: text('tipo').notNull(), // das|iss|inss|fgts|irpj|outro
  descricao: text('descricao').notNull(),
  competencia: text('competencia').notNull(), // 'YYYY-MM'
  vencimento: text('vencimento').notNull(), // 'YYYY-MM-DD'
  valorCentavos: integer('valor_centavos').notNull(),
  pago: boolean('pago').notNull().default(false),
  guiaDocId: text('guia_doc_id'), // id do documento da guia (opcional)
});

// Movimentações do fluxo de caixa (entradas e saídas). Alimenta o Financeiro
// e é o destino do import de planilhas. `projetoId` liga o lançamento a uma obra.
export const movimentacoes = pgTable('movimentacoes', {
  id: text('id').primaryKey(),
  data: text('data').notNull(), // 'YYYY-MM-DD'
  descricao: text('descricao').notNull(),
  categoria: text('categoria').notNull(),
  tipo: text('tipo').notNull(), // entrada|saida
  forma: text('forma').notNull(), // pix|dinheiro|cartao|boleto|transferencia
  valorCentavos: integer('valor_centavos').notNull(),
  situacao: text('situacao').notNull(), // pago|pendente|agendado
  recorrente: boolean('recorrente').notNull().default(false),
  obs: text('obs'),
  projetoId: text('projeto_id'), // id do projeto/obra (opcional) | null
});

// Projetos (obras). Guarda-chuva que agrega agendamentos, documentos e
// movimentações de uma obra. Agendamentos/documentos são vinculados pelo
// nome do `cliente`; movimentações pelo `projeto_id`.
export const projetos = pgTable('projetos', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  cliente: text('cliente').notNull(),
  tipo: text('tipo').notNull(), // instalacao_solar|projeto_fotovoltaico|manutencao|eletrica_predial|vistoria|outro
  status: text('status').notNull(), // orcamento|em_andamento|concluido|cancelado
  responsavel: text('responsavel').notNull(),
  endereco: text('endereco'),
  valorContratadoCentavos: integer('valor_contratado_centavos').notNull(),
  inicio: text('inicio'), // 'YYYY-MM-DD' | null
  previsao: text('previsao'), // 'YYYY-MM-DD' | null
  progresso: integer('progresso').notNull().default(0), // 0..100
  obs: text('obs'),
  criadoEm: text('criado_em').notNull(),
});

// Usuários do sistema (login). Senha em hash scrypt; papel admin|viewer.
export const usuarios = pgTable('usuarios', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  email: text('email').notNull(), // único (garantido por índice no init e checagem no app)
  senhaHash: text('senha_hash').notNull(),
  role: text('role').notNull().default('viewer'), // admin|viewer
  foto: text('foto'),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: text('criado_em').notNull(),
});

// Solicitações de conta: quem quer acesso preenche nome/e-mail/senha e fica
// PENDENTE até o TI aprovar. Aprovar cria a conta em `usuarios` e o login passa
// a funcionar. Fluxo: pendente → aprovada (vira usuário) | rejeitada.
export const solicitacoes = pgTable('solicitacoes', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  email: text('email').notNull(),
  senhaHash: text('senha_hash').notNull(),
  status: text('status').notNull().default('pendente'), // pendente|aprovada|rejeitada
  criadoEm: text('criado_em').notNull(),
  decididoEm: text('decidido_em'),   // quando o TI decidiu | null
  decididoPor: text('decidido_por'), // e-mail do TI que decidiu | null
});

// Alterações de conta pendentes: o usuário pede para trocar e-mail, senha ou
// foto e fica PENDENTE até o TI aprovar. Uma linha por campo alterado.
export const alteracoes = pgTable('alteracoes', {
  id: text('id').primaryKey(),
  usuarioId: text('usuario_id').notNull(),
  email: text('email').notNull(),         // e-mail atual (referência p/ o TI)
  campo: text('campo').notNull(),         // email | senha | foto
  valor: text('valor').notNull(),         // novo e-mail | hash da nova senha | foto (data URI)
  rotulo: text('rotulo').notNull(),       // descrição legível para o TI
  status: text('status').notNull().default('pendente'), // pendente|aprovada|rejeitada
  criadoEm: text('criado_em').notNull(),
  decididoEm: text('decidido_em'),
  decididoPor: text('decidido_por'),
});

// Uploads persistidos no próprio banco (base64) — fotos e documentos. Servidos
// por GET /api/uploads/:id. Portável para Neon/Postgres (sem disco externo).
export const uploads = pgTable('uploads', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  mime: text('mime').notNull(),
  tamanho: integer('tamanho').notNull(),
  dados: text('dados').notNull(), // conteúdo em base64
  criadoEm: text('criado_em').notNull(),
});

export type UsuarioRow = typeof usuarios.$inferSelect;
export type SolicitacaoRow = typeof solicitacoes.$inferSelect;
export type AlteracaoRow = typeof alteracoes.$inferSelect;
export type UploadRow = typeof uploads.$inferSelect;
export type FuncionarioRow = typeof funcionarios.$inferSelect;
export type AgendamentoRow = typeof agendamentos.$inferSelect;
export type JornadaRow = typeof jornadas.$inferSelect;
export type DocumentoRow = typeof documentos.$inferSelect;
export type ObrigacaoFiscalRow = typeof obrigacoesFiscais.$inferSelect;
export type MovimentacaoRow = typeof movimentacoes.$inferSelect;
export type ProjetoRow = typeof projetos.$inferSelect;

// Estado por usuário das notificações (lida / dispensada). PK composta (usuario, chave).
export const notificacoesEstado = pgTable('notificacoes_estado', {
  usuarioId: text('usuario_id').notNull(),
  chave: text('chave').notNull(), // id da notificação (ex.: srv_ag_1, imp_of_3)
  lida: boolean('lida').notNull().default(false),
  dispensada: boolean('dispensada').notNull().default(false),
  atualizadoEm: text('atualizado_em').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.usuarioId, t.chave] }) }));
export type NotificacaoEstadoRow = typeof notificacoesEstado.$inferSelect;

// Snapshot mensal de cada obra (histórico p/ evolução de carteira/backlog e progresso).
export const projetoSnapshots = pgTable('projeto_snapshots', {
  mes: text('mes').notNull(),               // 'YYYY-MM'
  projetoId: text('projeto_id').notNull(),
  nome: text('nome').notNull(),
  cliente: text('cliente').notNull(),
  status: text('status').notNull(),         // orcamento|em_andamento|concluido|cancelado
  progresso: integer('progresso').notNull(),
  contratadoCentavos: integer('contratado_centavos').notNull(),
  recebidoCentavos: integer('recebido_centavos').notNull(),
  aReceberCentavos: integer('a_receber_centavos').notNull(),
  criadoEm: text('criado_em').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.mes, t.projetoId] }) }));
export type ProjetoSnapshotRow = typeof projetoSnapshots.$inferSelect;
