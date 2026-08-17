/**
 * Domínio de Colaboradores (funcionários) — JC Elétrica & Solar.
 * A foto substitui o avatar de iniciais em todas as seções que citam o
 * colaborador (agenda, dias trabalhados, etc.). `foto` é o caminho servido
 * pela API (ex.: /uploads/f1.png) ou null quando ainda não há foto.
 */
export interface Funcionario {
  id: string;
  nome: string;
  setor: string;
  cor: string; // classe de cor do avatar de fallback: a|b|c|d
  foto: string | null; // caminho da foto na API, ou null
}

export const FUNCIONARIOS_SEED: readonly Funcionario[] = [
  { id: 'f1', nome: 'Carlos Lima', setor: 'Técnico — Energia solar', cor: 'b', foto: null },
  { id: 'f2', nome: 'Rafael Gomes', setor: 'Auxiliar técnico', cor: 'c', foto: null },
  { id: 'f3', nome: 'João Pedro', setor: 'Eletricista', cor: 'd', foto: null },
  { id: 'f4', nome: 'Maria Souza', setor: 'Engenheira eletricista', cor: 'a', foto: null },
  { id: 'f5', nome: 'Ana Beatriz', setor: 'Comercial', cor: 'a', foto: null },
];

/** Iniciais para o avatar de fallback (quando não há foto). */
export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

/** Normaliza nome para casar referências (agenda/jornadas usam o nome como chave). */
export function chaveNome(nome: string): string {
  return nome.trim().toLowerCase();
}
