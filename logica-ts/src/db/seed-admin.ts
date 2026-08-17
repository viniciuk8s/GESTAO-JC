/**
 * Cria/atualiza os DOIS usuários fixos do sistema — CEO e TI — ambos com acesso
 * total (admin). Use no primeiro deploy ou para redefinir as senhas. Nomes,
 * e-mails e senhas vêm de variáveis de ambiente (CEO_ e TI_), com padrões.
 *
 *   CEO_SENHA=umaSenhaForte TI_SENHA=outraSenha npm run seed:admin
 */
import 'dotenv/config'; // carrega .env
import { initDb } from './init.ts';
import { usuariosRepo } from './authRepos.ts';
import { hashSenha } from '../auth/senha.ts';

async function upsert(nome: string, email: string, senha: string): Promise<void> {
  const existente = await usuariosRepo.porEmail(email);
  if (existente) {
    await usuariosRepo.trocarSenha(existente.id, hashSenha(senha));
    await usuariosRepo.definirPapel(existente.id, 'admin');
    console.log(`Atualizado: ${email} (senha redefinida · admin)`);
  } else {
    const r = await usuariosRepo.criar({ nome, email, senha, role: 'admin' });
    console.log(r.ok ? `Criado: ${email} · admin` : `Falha (${email}): ${(r as { erro: string }).erro}`);
  }
}

async function main(): Promise<void> {
  await initDb();
  await upsert(process.env.CEO_NOME || 'Rodrigo Dantas', process.env.CEO_EMAIL || 'ceo@jcsolar.com', process.env.CEO_SENHA || 'ceo123');
  await upsert(process.env.TI_NOME || 'TI — JC Elétrica & Solar', process.env.TI_EMAIL || 'ti@jcsolar.com', process.env.TI_SENHA || 'ti123');
  process.exit(0);
}
void main();
