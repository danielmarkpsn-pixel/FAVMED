import { handleToolCall, tools as quarksTools } from './quarks-tools.js';

// Converte array de tools para objeto indexado por nome
export const tools = {};

quarksTools.forEach(tool => {
  tools[tool.name] = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    async execute(args) {
      return await handleToolCall(tool.name, args);
    }
  };
});

export function getToolsList() {
  return Object.values(tools).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

export function getToolSchema(toolName) {
  const tool = tools[toolName];
  return tool ? {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  } : null;
}
