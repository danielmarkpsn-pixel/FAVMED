import { tools } from '../tools/index.js';

export async function handleMCPRequest(method, params) {
  console.log(`[MCP] Method: ${method}`, params);

  switch (method) {
    case 'initialize':
      return handleInitialize();

    case 'tools/list':
      return handleToolsList();

    case 'tools/call':
      return handleToolsCall(params);

    case 'notifications/initialized':
      return handleNotificationsInitialized(params);

    default:
      if (typeof method === 'string' && method.startsWith('notifications/')) {
        console.log(`[MCP] Ignoring notification method: ${method}`);
        return null;
      }

      throw new Error(`Unknown method: ${method}`);
  }
}

function handleInitialize() {
  return {
    protocolVersion: '2024-11-05',
    serverInfo: {
      name: 'quarks-agendamentos',
      version: '2.0.0',
      description: 'MCP Server para integração com API Quarks Clinic - Agendamentos, Agendas, Convênios e Profissionais'
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
  const { name, arguments: args } = params;

  console.log(`[MCP] Calling tool: ${name}`, args);

  const tool = tools[name];

  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  if (!args) {
    throw new Error('Missing arguments');
  }

  const result = await tool.execute(args);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

function handleNotificationsInitialized(params) {
  console.log('[MCP] notifications/initialized', params);
  return null;
}
