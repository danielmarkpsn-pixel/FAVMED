#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { mcpRouter } from './src/routes/mcp.js';
import { healthRouter } from './src/routes/health.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/mcp', mcpRouter);
app.use('/health', healthRouter);

// Root endpoint para MCP discovery
app.get('/', (req, res) => {
  res.json({
    name: 'MCP Quarks Agendamentos',
    version: '2.0.0',
    description: 'Model Context Protocol Server para API Quarks Clinic',
    endpoints: {
      mcp: '/mcp',
      tools: '/mcp/tools',
      health: '/health'
    },
    documentation: {
      baseUrl: process.env.QUARKS_API_URL || 'https://api.quark.tec.br/clinic/ext/v1',
      totalTools: 17
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║     🏥 MCP Quarks Agendamentos v2.0.0                 ║
╠════════════════════════════════════════════════════════╣
║  Servidor HTTP rodando em: http://localhost:${PORT}
║  Endpoint MCP: http://localhost:${PORT}/mcp
║  Tools: http://localhost:${PORT}/mcp/tools
║  Health: http://localhost:${PORT}/health
╚════════════════════════════════════════════════════════╝
  `);
});
