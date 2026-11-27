import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createCheckPayload, createProvingPayload } from '@midnightntwrk/ledger-v9';
import { parseKeyLocation } from '../dist/key-location.js';

export interface ProxyOptions {
  /** A compiler output folder, with `keys/` and `zkir/`. */
  readonly dir: string;
  /** A stock proof server. */
  readonly upstream: string;
}

/** A test harness, not a self-host proxy: it has no auth, no TLS, no CORS, and no rate limit. */
export interface TestProxy {
  readonly url: string;
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 1_000_000;
const DECIMAL = /^\d{1,80}$/;

async function readBody(request: IncomingMessage): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** A key-holding proxy in front of a stock proof server. It finds a key by its `vk` hash. */
export async function startProxy(options: ProxyOptions): Promise<TestProxy> {
  const upstream = options.upstream.replace(/\/+$/, '');
  const read = async (circuit: string, file: 'verifier' | 'prover' | 'bzkir') =>
    new Uint8Array(
      await readFile(join(options.dir, file === 'bzkir' ? 'zkir' : 'keys', `${circuit}.${file}`)),
    );
  // Only the small verifier keys load at start; a p256 prover key is about 470 MB.
  const circuitOf = new Map<string, string>();
  for (const file of await readdir(join(options.dir, 'keys'))) {
    if (!file.endsWith('.verifier')) continue;
    const circuit = file.slice(0, -'.verifier'.length);
    circuitOf.set(
      createHash('sha256')
        .update(await read(circuit, 'verifier'))
        .digest('hex'),
      circuit,
    );
  }
  const answer = (response: ServerResponse, status: number, body?: Uint8Array): void => {
    response.writeHead(status, { 'content-type': 'application/octet-stream' });
    response.end(body);
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://proxy');
    const route = url.pathname;
    if (request.method !== 'POST' || (route !== '/check' && route !== '/prove')) {
      return answer(response, 404);
    }
    const body = await readBody(request);
    if (body === undefined) return answer(response, 413);
    let circuit: string | undefined;
    let binding: bigint | undefined;
    try {
      const location = parseKeyLocation(url.searchParams.get('key') ?? '');
      if (location.kind === 'contract') {
        circuit = circuitOf.get(location.verifierKeyHash);
        if (circuit === undefined) return answer(response, 404);
      }
      const decimal = url.searchParams.get('binding');
      if (decimal !== null && !DECIMAL.test(decimal)) return answer(response, 400);
      binding = decimal === null ? undefined : BigInt(decimal);
    } catch {
      return answer(response, 400);
    }
    const material =
      circuit === undefined
        ? undefined
        : {
            verifierKey: await read(circuit, 'verifier'),
            proverKey: route === '/prove' ? await read(circuit, 'prover') : new Uint8Array(),
            ir: await read(circuit, 'bzkir'),
          };
    let payload: Uint8Array;
    try {
      payload =
        route === '/check'
          ? createCheckPayload(body, material?.ir)
          : createProvingPayload(body, binding, material);
    } catch {
      return answer(response, 400);
    }
    // The proof job stops when the client goes away.
    const gone = new AbortController();
    response.on('close', () => response.writableFinished || gone.abort());
    const forwarded = await fetch(`${upstream}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: payload,
      signal: gone.signal,
    });
    answer(response, forwarded.status, new Uint8Array(await forwarded.arrayBuffer()));
  };
  const server = createServer((request, response) => {
    handle(request, response).catch(() => response.headersSent || answer(response, 502));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
