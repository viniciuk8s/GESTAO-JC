/**
 * Avatares dos colaboradores (browser). Busca as fotos na API local e as usa
 * no lugar das iniciais em qualquer seção. Se a API estiver offline, cai
 * graciosamente para o avatar de iniciais.
 *
 * A base da API pode ser trocada definindo `window.JC_API` antes do bundle.
 */
interface FuncApi { id: string; nome: string; setor: string; cor: string; foto: string | null; }

export const API_BASE: string =
  (typeof window !== 'undefined' && (window as unknown as { JC_API?: string }).JC_API) || 'http://localhost:3000';

const porNome = new Map<string, { foto: string | null; cor: string }>();
let carregados: FuncApi[] = [];

function chave(nome: string): string { return nome.trim().toLowerCase(); }

/**
 * URL final de um arquivo servido pela API. Para arquivos PROTEGIDOS
 * (`/api/uploads/*`), anexa o token de sessão em `?token=` — porque `<img>` e
 * `<a>` não enviam o header `Authorization` (só o `fetch` global envia). Arquivos
 * estáticos (`/uploads/*.png`, avatares-semente) não passam pelo gate e ficam
 * inalterados. Sem sessão, devolve a URL sem token (a guarda de auth já redireciona).
 */
export function urlArquivo(caminho: string): string {
  const url = `${API_BASE}${caminho}`;
  if (!caminho.startsWith('/api/')) return url;
  let tk: string | null = null;
  try { tk = localStorage.getItem('jc_token'); } catch { tk = null; }
  return tk ? `${url}${caminho.includes('?') ? '&' : '?'}token=${encodeURIComponent(tk)}` : url;
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

/** Carrega os colaboradores (e fotos) da API. Nunca lança — offline = fallback. */
export async function carregarFuncionarios(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/funcionarios`);
    if (!r.ok) return;
    carregados = (await r.json()) as FuncApi[];
    porNome.clear();
    for (const f of carregados) porNome.set(chave(f.nome), { foto: f.foto, cor: f.cor });
  } catch { /* API offline → usa iniciais */ }
}

export function listaFuncionarios(): FuncApi[] { return carregados.map((f) => ({ ...f })); }
export function temFoto(nome: string): boolean { return !!porNome.get(chave(nome))?.foto; }

/**
 * HTML do avatar de um colaborador. `baseCls` é a classe do contexto
 * (ex.: 'emp-av', 'av'); quando há foto, adiciona a classe `foto`.
 */
export function avatarHtml(nome: string, baseCls: string, corFallback = 'a'): string {
  const info = porNome.get(chave(nome));
  if (info?.foto) {
    return `<span class="${baseCls} foto"><img src="${urlArquivo(info.foto)}" alt="${nome}"></span>`;
  }
  return `<span class="${baseCls} ${info?.cor ?? corFallback}">${iniciais(nome)}</span>`;
}

/** Só o conteúdo interno (img ou iniciais) — para quando o wrapper já existe. */
export function avatarInner(nome: string): string {
  const info = porNome.get(chave(nome));
  if (info?.foto) return `<img src="${urlArquivo(info.foto)}" alt="${nome}">`;
  return iniciais(nome);
}
