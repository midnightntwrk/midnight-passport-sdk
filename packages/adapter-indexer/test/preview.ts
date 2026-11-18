import type { HttpRequest, HttpResponse } from '@midnight-ntwrk/mn-passport-core';

// `MN_PREVIEW_CONTRACT` is a deployed contract. `MN_PREVIEW_TX` is the identifier of a final transaction.
export const preview = {
  MN_PREVIEW_INDEXER_URL: process.env.MN_PREVIEW_INDEXER_URL ?? '',
  MN_PREVIEW_INDEXER_WS_URL: process.env.MN_PREVIEW_INDEXER_WS_URL ?? '',
  MN_PREVIEW_NODE_URL: process.env.MN_PREVIEW_NODE_URL ?? '',
  MN_PREVIEW_CONTRACT: process.env.MN_PREVIEW_CONTRACT ?? '',
  MN_PREVIEW_TX: process.env.MN_PREVIEW_TX ?? '',
};

/** A skip reason when one of `names` is not set. */
export const needs = (...names: (keyof typeof preview)[]): string | false => {
  const missing = names.filter((name) => !preview[name]);
  return missing.length > 0 && `set ${missing.join(', ')}`;
};

export async function http(request: HttpRequest): Promise<HttpResponse> {
  const controller = new AbortController();
  request.signal?.addEventListener('abort', () => controller.abort());
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers ?? {},
    body: request.body ?? null,
    signal: controller.signal,
    redirect: 'error',
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: new Uint8Array(await response.arrayBuffer()),
  };
}
