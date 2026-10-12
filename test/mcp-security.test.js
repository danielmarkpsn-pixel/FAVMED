import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mcpRouter } from '../src/routes/mcp.js';

test('o endpoint MCP exige token e aceita somente o token configurado', async () => {
  const app = express();
  app.use(express.json());
  app.use('/mcp', mcpRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/mcp/tools`;
  const tokenOriginal = process.env.MCP_AUTH_TOKEN;

  try {
    delete process.env.MCP_AUTH_TOKEN;
    const semConfiguracao = await fetch(url);
    assert.equal(semConfiguracao.status, 503);

    process.env.MCP_AUTH_TOKEN = 'token-de-teste-nao-utilizar-em-producao';
    const semToken = await fetch(url);
    assert.equal(semToken.status, 401);

    const tokenIncorreto = await fetch(url, {
      headers: { Authorization: 'Bearer token-incorreto' }
    });
    assert.equal(tokenIncorreto.status, 401);

    const autorizado = await fetch(url, {
      headers: { Authorization: 'Bearer token-de-teste-nao-utilizar-em-producao' }
    });
    assert.equal(autorizado.status, 200);
    const conteudo = await autorizado.json();
    assert.ok(Array.isArray(conteudo.ferramentas));
    assert.ok(conteudo.total > 0);
  } finally {
    if (tokenOriginal === undefined) delete process.env.MCP_AUTH_TOKEN;
    else process.env.MCP_AUTH_TOKEN = tokenOriginal;
    server.close();
  }
});
