CREATE TABLE "projetos" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cliente" text NOT NULL,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"responsavel" text NOT NULL,
	"endereco" text,
	"valor_contratado_centavos" integer NOT NULL,
	"inicio" text,
	"previsao" text,
	"progresso" integer DEFAULT 0 NOT NULL,
	"obs" text,
	"criado_em" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD COLUMN "projeto_id" text;