CREATE TABLE "agendamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"titulo" text NOT NULL,
	"cliente" text NOT NULL,
	"inicio" text NOT NULL,
	"duracao_min" integer NOT NULL,
	"tecnico" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"situacao" text NOT NULL,
	"obs" text
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"arquivo" text,
	"formato" text,
	"tamanho_bytes" integer,
	"vinculo_tipo" text NOT NULL,
	"vinculo_id" text,
	"vinculo_label" text,
	"emissao" text,
	"vencimento" text,
	"valor_centavos" integer,
	"situacao" text,
	"obs" text,
	"criado_em" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funcionarios" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"setor" text NOT NULL,
	"cor" text NOT NULL,
	"foto" text
);
--> statement-breakpoint
CREATE TABLE "jornadas" (
	"id" text PRIMARY KEY NOT NULL,
	"origem_id" text NOT NULL,
	"funcionario" text NOT NULL,
	"data" text NOT NULL,
	"servico" text NOT NULL,
	"cliente" text NOT NULL,
	"duracao_min" integer NOT NULL,
	"pago" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimentacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"descricao" text NOT NULL,
	"categoria" text NOT NULL,
	"tipo" text NOT NULL,
	"forma" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"situacao" text NOT NULL,
	"recorrente" boolean DEFAULT false NOT NULL,
	"obs" text
);
--> statement-breakpoint
CREATE TABLE "obrigacoes_fiscais" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"competencia" text NOT NULL,
	"vencimento" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"pago" boolean DEFAULT false NOT NULL,
	"guia_doc_id" text
);
