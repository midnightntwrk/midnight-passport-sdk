import assert from 'node:assert/strict';

/**
 * Listens on a free port, and gives the base URL. `until` gets the close, which also ends open requests.
 * @param {import('node:http').Server} server
 * @param {(close: () => void) => void} until
 */
export async function listen(server, until, host = '127.0.0.1') {
  await new Promise((done) => server.listen(0, host, () => done(undefined)));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  until(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://${host}:${address.port}`;
}

/**
 * Answers the URLs of the Platform contract: `/ok`, a redirect at `/moved`, and never `/pending`.
 * `/echo` answers 201 with the method, the `x-token` header, and the body.
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @returns {boolean} false for another path.
 */
export function contractRoutes(request, response) {
  if (request.url === '/echo') {
    response.writeHead(201, { 'x-method': request.method, 'x-token': request.headers['x-token'] });
    request.pipe(response);
  } else if (request.url === '/ok') response.writeHead(200).end('ok');
  else if (request.url === '/moved') response.writeHead(302, { location: '/ok' }).end();
  else if (request.url !== '/pending') return false;
  return true;
}
