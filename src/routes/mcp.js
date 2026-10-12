import express from 'express';
import { handleMCPRequest } from '../handlers/mcpHandler.js';
import { getToolsList, getToolSchema } from '../tools/index.js';

export const mcpRouter = express.Router();

// Endpoint principal MCP - recebe requisições JSON-RPC 2.0
mcpRouter.post('/', async (req, res) => {
  try {
    const { jsonrpc, id, method, params } = req.body;

    // Validação básica JSON-RPC 2.0
    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: id || null,
        error: {
          code: -32600,
          message: 'Invalid Request - jsonrpc must be 2.0'
        }
      });
    }

    // Processar requisição MCP
    const response = await handleMCPRequest(method, params);

    // If the request is a JSON-RPC notification (no id), the client does not expect a response.
    // Return 204 No Content in that case.
    if (id === undefined || id === null) {
      return res.status(204).end();
    }

    res.json({
      jsonrpc: '2.0',
      id: id,
      result: response
    });

  } catch (error) {
    console.error('[MCP Error]', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    });
  }
});

// Endpoint para listar tools disponíveis (para debug/documentação)
mcpRouter.get('/tools', (req, res) => {
  res.json({
    tools: getToolsList(),
    total: getToolsList().length
  });
});

// Endpoint para obter schema de uma tool específica
mcpRouter.get('/tools/:toolName', (req, res) => {
  const schema = getToolSchema(req.params.toolName);

  if (!schema) {
    return res.status(404).json({
      error: 'Tool not found',
      availableTools: getToolsList().map(t => t.name)
    });
  }

  res.json(schema);
});
