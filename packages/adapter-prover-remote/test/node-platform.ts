import {
  CancelledError,
  NetworkError,
  type HttpRequest,
  type Platform,
} from '@midnight-ntwrk/mn-passport-core';
import { createStubPlatform } from '@midnight-ntwrk/mn-passport-dev';

export interface Recording {
  /** With no `authorization` header. */
  readonly requests: HttpRequest[];
  /** The size of each request: the URL, the headers, the body, and an allowance for the rest. */
  readonly sizes: number[];
}

// The request line and the headers that fetch adds.
const OVERHEAD_BYTES = 256;

/** A fetch platform for tests that records each request. */
export function nodePlatform(): Platform & Recording {
  const requests: HttpRequest[] = [];
  const sizes: number[] = [];
  return {
    ...createStubPlatform(),
    requests,
    sizes,
    async http(request) {
      const headers = Object.entries(request.headers ?? {});
      requests.push({
        ...request,
        headers: Object.fromEntries(headers.filter(([name]) => name !== 'authorization')),
      });
      sizes.push(
        OVERHEAD_BYTES +
          request.url.length +
          headers.reduce((sum, [name, value]) => sum + name.length + value.length + 4, 0) +
          (request.body?.length ?? 0),
      );
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: Object.fromEntries(headers),
          ...(request.body === undefined ? {} : { body: request.body }),
          ...(request.signal ? { signal: request.signal as AbortSignal } : {}),
          redirect: 'error',
        });
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: new Uint8Array(await response.arrayBuffer()),
        };
      } catch (error) {
        if (request.signal?.aborted) throw new CancelledError('caller');
        throw error instanceof TypeError ? new NetworkError() : error;
      }
    },
  };
}
