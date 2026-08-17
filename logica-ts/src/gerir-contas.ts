/**
 * Gerência de contas (TI) pelo terminal — cadastros E alterações de conta.
 *
 *   npm run contas                     → lista pendentes (cadastros + alterações) e contas ativas
 *   npm run contas aprovar <ref>       → aprova (libera o acesso / aplica a mudança)
 *   npm run contas rejeitar <ref>      → rejeita
 *
 * <ref> pode ser:
 *   - o e-mail (para cadastros de conta novos), ex.: rodrigo@jcsolar.com
 *   - o id do pedido de alteração (começa com "alt_"), ex.: alt_ab12cd
 */
import 'dotenv/config';
import { initDb } from './db/init.ts';
import { solicitacoesRepo, alteracoesRepo, usuariosRepo } from './db/authRepos.ts';

function fmt(d: string): string { try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; } }

async function main(): Promise<void> {
  await initDb();
  const [acao, ref] = process.argv.slice(2);
  const quem = process.env.TI_EMAIL || 'TI (terminal)';

  if (!acao) {
    const cad = await solicitacoesRepo.listar('pendente');
    console.log(`\n=== Cadastros de conta PENDENTES (${cad.length}) ===`);
    if (!cad.length) console.log('  (nenhum)');
    cad.forEach((s) => {
      console.log(`  • ${s.nome}  <${s.email}>   · pedido em ${fmt(s.criadoEm)}`);
      console.log(`      aprovar: npm run contas aprovar ${s.email}   |   rejeitar: npm run contas rejeitar ${s.email}`);
    });

    const alt = await alteracoesRepo.listar('pendente');
    console.log(`\n=== Alterações de conta PENDENTES (${alt.length}) ===`);
    if (!alt.length) console.log('  (nenhuma)');
    alt.forEach((a) => {
      console.log(`  • ${a.rotulo}  (conta ${a.email})   · pedido em ${fmt(a.criadoEm)}   [${a.id}]`);
      console.log(`      aprovar: npm run contas aprovar ${a.id}   |   rejeitar: npm run contas rejeitar ${a.id}`);
    });

    const users = await usuariosRepo.listar();
    console.log(`\n=== Contas ativas (${users.length}) ===`);
    users.forEach((u) => console.log(`  • ${u.nome}  <${u.email}>   · ${u.role}${u.ativo ? '' : ' · inativo'}${u.foto ? ' · com foto' : ''}`));
    console.log('');
    process.exit(0);
  }

  if (acao !== 'aprovar' && acao !== 'rejeitar') {
    console.error('Uso: npm run contas [aprovar|rejeitar] <e-mail ou id>');
    process.exit(1);
  }
  if (!ref) { console.error('Informe o e-mail (cadastro) ou o id (alteração, começa com "alt_").'); process.exit(1); }

  // é uma ALTERAÇÃO de conta?
  if (ref.startsWith('alt_')) {
    const r = acao === 'aprovar'
      ? await alteracoesRepo.aprovar(ref, quem)
      : await alteracoesRepo.rejeitar(ref, quem);
    console.log(r.ok ? `\n✅ Alteração ${acao === 'aprovar' ? 'aplicada' : 'rejeitada'}.\n` : `\n❌ ${r.erro}\n`);
    process.exit(0);
  }

  // senão, é um CADASTRO de conta (por e-mail ou id)
  const todas = await solicitacoesRepo.listar();
  const s = todas.find((x) => x.id === ref) ?? todas.find((x) => x.email.toLowerCase() === ref.toLowerCase() && x.status === 'pendente') ?? todas.find((x) => x.email.toLowerCase() === ref.toLowerCase());
  if (!s) { console.error(`Nenhum cadastro/alteração encontrado para "${ref}".`); process.exit(1); }
  const r = acao === 'aprovar'
    ? await solicitacoesRepo.aprovar(s.id, quem, 'admin')
    : await solicitacoesRepo.rejeitar(s.id, quem);
  if (acao === 'aprovar') console.log(r.ok ? `\n✅ Conta criada: ${s.nome} <${s.email}> — já pode entrar.\n` : `\n❌ ${(r as any).erro}\n`);
  else console.log(r.ok ? `\nCadastro de ${s.email} rejeitado.\n` : `\n❌ ${(r as any).erro}\n`);
  process.exit(0);
}

void main();
