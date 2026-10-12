import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { handleMCPRequest } from '../handlers/mcpHandler.js';
import { getToolsList, getToolSchema } from '../tools/index.js';

export const mcpRouter = express.Router();

function autenticarMCP(req, res, next) {
  const tokenConfigurado = process.env.MCP_AUTH_TOKEN;

  // Não disponibilizar a integração quando a autenticação não foi configurada.
  if (!tokenConfigurado) {
    return res.status(503).json({
      erro: 'Integração indisponível: o administrador precisa configurar a autenticação.'
    });
  }

  const cabecalho = req.get('authorization') || '';
  const correspondencia = cabecalho.match(/^Bearer\s+(.+)$/i);
  const tokenRecebido = correspondencia?.[1] || '';

  const esperado = Buffer.from(tokenConfigurado, 'utf8');
  const recebido = Buffer.from(tokenRecebido, 'utf8');
  const valido = esperado.length > 0 &&
    recebido.length === esperado.length &&
    timingSafeEqual(recebido, esperado);

  if (!valido) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ erro: 'Autenticação necessária ou token inválido.' });
  }

  next();
}

// Todas as rotas MCP, inclusive a documentação de ferramentas, exigem autenticação.
mcpRouter.use(autenticarMCP);

mcpRouter.post('/', async (req, res) => {
  const requisicao = req.body;

  if (!requisicao || typeof requisicao !== 'object' || Array.isArray(requisicao) ||
      requisicao.jsonrpc !== '2.0' || typeof requisicao.method !== 'string') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: requisicao?.id ?? null,
      error: { code: -32600, message: 'Requisição inválida. Informe jsonrpc "2.0" e um método.' }
    });
  }

  const { id, method, params } = requisicao;

  try {
    const resultado = await handleMCPRequest(method, params);

    // Notificações não recebem conteúdo de resposta.
    if (id === undefined || id === null) return res.status(204).end();

    return res.json({ jsonrpc: '2.0', id, result: resultado });
  } catch (error) {
    console.error('[ERRO MCP]', error?.name || 'Erro inesperado');

    if (id === undefined || id === null) return res.status(204).end();

    return res.status(200).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: 'Erro interno ao processar a solicitação.' }
    });
  }
});

mcpRouter.get('/tools', (req, res) => {
  const ferramentas = getToolsList();
  res.json({ ferramentas, total: ferramentas.length });
});

mcpRouter.get('/tools/:toolName', (req, res) => {
  const esquema = getToolSchema(req.params.toolName);

  if (!esquema) {
    return res.status(404).json({ erro: 'Ferramenta não encontrada.' });
  }

  return res.json(esquema);
});
