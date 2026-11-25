import { check, guarded } from '../packages/dev/dist/index.js';

// Nothing listens on this port.
const UNREACHABLE_URL = 'http://127.0.0.1:1';

const secret = 'secret-token';
/** @param {unknown} error */
const named = (error) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
/** @param {Promise<unknown>} call */
const failure = (call) =>
  call.then(
    () => undefined,
    (/** @type {unknown} */ error) => error,
  );

/**
 * The cases that both adapters add to the Platform contract.
 * @param {() => Promise<{ platform: import('../packages/core/dist/index.js').Platform, okUrl: string }>} make
 */
export const platformCases = (make) =>
  guarded(
    [
      {
        name: 'a caller error throws TypeError with no URL or header value, before any request',
        async run() {
          const { platform, okUrl } = await make();
          for (const request of /** @type {const} */ ([
            { url: `not a url ${secret}`, method: 'GET' },
            { url: `ftp://host/${secret}`, method: 'GET' },
            { url: okUrl, method: 'GET', headers: { 'x-token': `${secret}\nx` } },
            { url: `${okUrl}?${secret}`, method: 'GET', body: 'x' },
            { url: okUrl.replace('://', `://u:${secret}@`), method: 'GET' },
          ])) {
            const error = await failure(platform.http(request));
            check(error instanceof TypeError && !error.message.includes(secret), named(error));
          }
        },
      },
      {
        name: 'http sends the method, the headers, and the body bytes',
        async run() {
          const { platform, okUrl } = await make();
          const response = await platform.http({
            url: new URL('/echo', okUrl).href,
            method: 'POST',
            headers: { 'x-token': 't1' },
            body: new Uint8Array([1, 2, 3]),
          });
          check(response.status === 201, `got status ${response.status}`);
          check(response.headers['x-method'] === 'POST', 'the method');
          check(response.headers['x-token'] === 't1', 'the header');
          check([...response.body].join() === '1,2,3', `got body ${[...response.body].join()}`);
        },
      },
      {
        name: 'randomBytes fills a length over the quota of one getRandomValues call',
        async run() {
          const bytes = (await make()).platform.randomBytes(200_000);
          check(bytes.length === 200_000, `got ${bytes.length} bytes`);
          check(
            bytes.subarray(150_000).some((byte) => byte !== 0),
            'the last chunk is not filled',
          );
        },
      },
      {
        name: 'a key with a lone surrogate rejects with TypeError, so two keys cannot share one entry',
        async run() {
          const { store } = (await make()).platform;
          check(
            (await failure(store.set('a\ud800', new Uint8Array([1])))) instanceof TypeError,
            'set',
          );
          check((await failure(store.get('a\udfff'))) instanceof TypeError, 'get');
        },
      },
      {
        name: 'an unreachable host rejects with NetworkError, which names no URL',
        async run() {
          const { platform } = await make();
          const error = await failure(
            platform.http({ url: `${UNREACHABLE_URL}/${secret}`, method: 'GET' }),
          );
          check(
            error instanceof Error &&
              Reflect.get(error, '_tag') === 'NetworkError' &&
              Reflect.get(error, 'code') === 'NETWORK_FAILED' &&
              error.cause === undefined &&
              !error.message.includes(secret),
            named(error),
          );
        },
      },
    ],
    10_000,
  );
