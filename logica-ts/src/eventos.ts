/**
 * Barramento de eventos em processo — o coração do "tempo real" (SSE).
 * -------------------------------------------------------------------
 * Toda escrita bem-sucedida na API emite um Evento aqui. Os clientes conectados
 * em GET /api/stream (Server-Sent Events) recebem o push instantâneo e cada
 * secção aberta se re-sincroniza na hora — substituindo o polling de 5–10s.
 *
 * Mantém também um anel (ring buffer) dos últimos eventos, usado para:
 *   • popular o Feed de Atividade quando a página abre (GET /api/eventos);
 *   • reenviar o que o cliente perdeu numa reconexão (Last-Event-ID).
 *
 * É puro Node (EventEmitter), sem dependência externa e 100% testável.
 */
import { EventEmitter } from 'node:events';

export type Recurso =
  | 'movimentacoes' | 'agendamentos' | 'dias' | 'documentos'
  | 'projetos' | 'fiscal' | 'colaboradores' | 'evolucao';

export interface Evento {
  id: number;        // sequência monotônica (serve de Last-Event-ID)
  ts: string;        // ISO 8601
  recurso: Recurso;  // qual secção mudou
  acao: string;      // criar | atualizar | remover | concluir | pagar | importar | snapshot | foto
  titulo: string;    // rótulo humano (PT-BR)
  detalhe?: string;  // linha secundária opcional
  ator?: string;     // nome de quem fez a mudança
}

export type NovoEvento = Omit<Evento, 'id' | 'ts'>;

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // muitos clientes SSE simultâneos, sem warning

const BUFFER: Evento[] = [];
const MAX = 200;
// Base do id por BOOT. Começa no epoch em ms para que os ids sejam sempre
// crescentes ENTRE reinícios do processo. O buffer é volátil (reiniciar zera o
// replay — correto), mas os ids nunca "voltam": um cliente que reconecta com um
// Last-Event-ID antigo (menor) recebe o replay do buffer atual em ordem, e nunca
// recebe um id repetido de um boot anterior.
let seq = Date.now();

/** Registra e transmite um evento. Devolve o evento já carimbado (id + ts). */
export function emitirEvento(e: NovoEvento): Evento {
  const ev: Evento = { ...e, id: ++seq, ts: new Date().toISOString() };
  BUFFER.push(ev);
  if (BUFFER.length > MAX) BUFFER.shift();
  emitter.emit('evento', ev);
  return ev;
}

/** Assina o fluxo de eventos. Devolve a função para cancelar a assinatura. */
export function assinar(fn: (e: Evento) => void): () => void {
  emitter.on('evento', fn);
  return () => { emitter.off('evento', fn); };
}

/** Últimos `limite` eventos, do mais novo para o mais antigo (para o feed). */
export function recentes(limite = 30): Evento[] {
  return BUFFER.slice(-limite).reverse();
}

/** Eventos com id > `lastId`, em ordem cronológica (replay de reconexão SSE). */
export function desde(lastId: number): Evento[] {
  return BUFFER.filter((e) => e.id > lastId);
}

/** Só para testes: zera o buffer e a sequência (base opcional simula um restart). */
export function _resetEventos(base = 0): void {
  BUFFER.length = 0;
  seq = base;
}
