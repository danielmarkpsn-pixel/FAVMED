import { tools } from '../tools/index.js';

export async function handleMCPRequest(method, params) {
  // Não registrar parâmetros: chamadas podem incluir informações pessoais de pacientes.
  switch (method) {
    case 'initialize':
      return handleInitialize();

    case 'tools/list':
      return handleToolsList();

    case 'tools/call':
      return handleToolsCall(params);

    case 'notifications/initialized':
      return handleNotificationsInitialized();

    default:
      if (typeof method === 'string' && method.startsWith('notifications/')) {
        return null;
      }
      throw new Error('Método MCP não reconhecido.');
  }
}

function handleInitialize() {
  return {
    protocolVersion: '2024-11-05',
    serverInfo: {
      name: 'clinica-favmed-medicina-ocupacional',
      version: '2.1.0',
      description: 'Integração da Clínica Favmed - Medicina Ocupacional com a API Quarks'
    },
    capabilities: {
      tools: {}
    }
  };
}

function handleToolsList() {
  return {
    tools: Object.values(tools).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
}

async function handleToolsCall(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Parâmetros da ferramenta inválidos.');
  }

  const { name, arguments: args } = params;
  if (typeof name !== 'string' || !name) {
    throw new Error('O nome da ferramenta é obrigatório.');
  }

  const tool = tools[name];
  if (!tool) throw new Error('Ferramenta não encontrada.');
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Os argumentos da ferramenta são obrigatórios e devem ser um objeto.');
  }

  const resultado = await tool.execute(args);

  return {
    content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }]
  };
}

function handleNotificationsInitialized() {
  return null;
}
