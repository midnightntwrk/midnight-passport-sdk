import type { ContractAddress } from '@midnight-ntwrk/mn-passport-core';
import { clearTimer, setTimer } from './globals.js';
import type { Timing } from './poll.js';

/** The members of a WebSocket that the adapter uses. */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  // The runtime owns the frame type. A frame that is not text ends the socket.
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
}

export type WebSocketConstructorLike = new (url: string, protocols: string) => WebSocketLike;

export interface SubscriptionTiming extends Timing {
  /** After this quiet time the client sends a ping. With no message in 1.5 times it, the socket is dead. */
  readonly keepAliveMs: number;
}

export interface ActionHandlers {
  readonly onAction: () => void;
  /** `true` while the subscription is acknowledged, `false` when its socket ends. */
  readonly onLive: (live: boolean) => void;
}

// The plain protocol only, so every frame is text.
const PROTOCOL = 'graphql-transport-ws';
const MAX_FRAME_CHARS = 16 * 1024 * 1024;

// Only the event matters. Each event starts a state read, so a replay after a reconnect is harmless.
const CONTRACT_ACTIONS_SUB = `subscription CONTRACT_ACTIONS_SUB($address: HexEncoded!) {
  contractActions(address: $address) { address }
}`;

function parse(data: unknown): { readonly type?: unknown; readonly payload?: unknown } | undefined {
  if (typeof data !== 'string' || data.length > MAX_FRAME_CHARS) return undefined;
  try {
    const message: unknown = JSON.parse(data);
    return typeof message === 'object' && message !== null ? message : undefined;
  } catch {
    return undefined;
  }
}

const hasErrors = (payload: unknown): boolean =>
  typeof payload === 'object' &&
  payload !== null &&
  'errors' in payload &&
  payload.errors !== undefined &&
  payload.errors !== null;

/**
 * Calls `onAction` for each contract action at `address`. A closed or bad socket reconnects
 * with backoff, and reports nothing: the polling reports an indexer outage.
 */
export function followContractActions(
  Socket: WebSocketConstructorLike,
  url: string,
  address: ContractAddress,
  timing: SubscriptionTiming,
  { onAction, onLive }: ActionHandlers,
): () => void {
  let stopped = false;
  let failures = 0;
  let timer: unknown;
  let socket: WebSocketLike | undefined;
  let dropCurrent: (() => void) | undefined;

  const reconnect = (): void => {
    if (stopped) return;
    socket = undefined;
    failures++;
    clearTimer(timer);
    timer = setTimer(connect, Math.min(timing.pollMs * 2 ** failures, timing.maxBackoffMs));
  };

  function connect(): void {
    if (stopped) return;
    let mine: WebSocketLike;
    try {
      mine = new Socket(url, PROTOCOL);
    } catch {
      reconnect();
      return;
    }
    socket = mine;
    let closed = false;
    let live = false;
    // A socket that opens and never acknowledges must not stay open in silence.
    const ackDeadline = setTimer(() => drop(), timing.maxBackoffMs);
    let pingTimer: unknown;
    let idleDeadline: unknown;
    let stable: unknown;
    // The indexer sends no keep-alive of its own and only answers a ping. Any message proves
    // that the socket is alive. A socket can die with no close event.
    const heard = (): void => {
      clearTimer(pingTimer);
      clearTimer(idleDeadline);
      pingTimer = setTimer(() => send({ type: 'ping' }), timing.keepAliveMs);
      idleDeadline = setTimer(() => drop(), timing.keepAliveMs * 1.5);
    };
    const drop = (): void => {
      if (closed) return;
      closed = true;
      clearTimer(ackDeadline);
      clearTimer(pingTimer);
      clearTimer(idleDeadline);
      clearTimer(stable);
      mine.close();
      if (live) onLive(false);
      if (socket === mine) reconnect();
    };
    dropCurrent = drop;
    const send = (message: object): void => mine.send(JSON.stringify(message));
    mine.addEventListener('open', () => send({ type: 'connection_init' }));
    mine.addEventListener('close', drop);
    mine.addEventListener('error', drop);
    mine.addEventListener('message', (event) => {
      // An injected socket can still deliver a frame after the close.
      if (closed) return;
      const message = parse(event.data);
      if (live) heard();
      switch (message?.type) {
        case 'connection_ack':
          // A second ack is a protocol error. It would also set a second backoff timer.
          if (live) {
            drop();
            return;
          }
          clearTimer(ackDeadline);
          heard();
          // Only a socket that stays up resets the backoff. A server can ack, send one event, and end.
          stable = setTimer(() => (failures = 0), timing.maxBackoffMs);
          live = true;
          onLive(true);
          send({
            id: '1',
            type: 'subscribe',
            payload: { query: CONTRACT_ACTIONS_SUB, variables: { address } },
          });
          return;
        case 'ping':
          send({ type: 'pong' });
          return;
        case 'pong':
          return;
        case 'next':
          if (hasErrors(message.payload)) {
            drop();
            return;
          }
          onAction();
          return;
        default:
          // An `error`, a `complete`, or a frame that is not valid ends this socket.
          drop();
      }
    });
  }

  connect();
  return () => {
    stopped = true;
    clearTimer(timer);
    socket = undefined;
    dropCurrent?.();
  };
}
