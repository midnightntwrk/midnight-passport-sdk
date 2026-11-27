import {
  CancelledError,
  NetworkError,
  type HttpRequest,
  type HttpResponse,
} from '@midnight-ntwrk/mn-passport-core';

// The messages leave out the URL and the header values, because they can hold a token.
function requestInit(request: HttpRequest, signal: AbortSignal): [URL, RequestInit] {
  const url = URL.parse(request.url);
  if (url === null) throw new TypeError('The request URL is not valid.');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('The request URL is not HTTP or HTTPS.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new TypeError('The request URL has a user name or a password.');
  }
  let headers: Headers;
  try {
    headers = new Headers(request.headers);
  } catch {
    // The native message can name a header or its value, so it is not kept.
    throw new TypeError('A request header is not valid.');
  }
  if (request.method === 'GET' && request.body !== undefined) {
    throw new TypeError('A GET request cannot have a body.');
  }
  // A redirect rejects, so the headers never go to another origin. No cookie or referrer goes out.
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'error',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  };
  if (request.body !== undefined) {
    init.body = typeof request.body === 'string' ? request.body : new Uint8Array(request.body);
  }
  return [url, init];
}

export async function fetchHttp(request: HttpRequest): Promise<HttpResponse> {
  const controller = new AbortController();
  const [url, init] = requestInit(request, controller.signal);
  const { signal } = request;
  if (signal?.aborted) throw new CancelledError('caller');
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(url, init);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    return {
      status: response.status,
      headers,
      body: new Uint8Array(await response.arrayBuffer()),
    };
  } catch {
    // The upstream error names the host, so it is not kept.
    throw signal?.aborted ? new CancelledError('caller') : new NetworkError();
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
