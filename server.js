#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { mcpRouter } from './src/routes/mcp.js';
import { healthRouter } from './src/routes/health.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// CORS fica desativado por padrão. Informe apenas origens confiáveis em CORS_ORIGINS.
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Cabeçalhos básicos de segurança para este serviço HTTP.
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Registra somente método e rota, sem parâmetros, tokens ou dados de pacientes.
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/mcp', mcpRouter);
app.use('/health', healthRouter);

app.get('/favicon.svg', (req, res) => {
  res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#123b3a"/><path d="M26 10h12v16h16v12H38v16H26V38H10V26h16z" fill="#fff"/><circle cx="48" cy="16" r="5" fill="#64d6b2"/></svg>`);
});

// Informações públicas mínimas do serviço. Nenhuma credencial é exposta.
app.get('/', (req, res) => {
  res.json({
    nome: 'Clínica Favmed - Medicina Ocupacional',
    servico: 'Integração segura de agendamentos com a API Quarks',
    versao: '2.1.0',
    idioma: 'pt-BR',
    endpoints: {
      integracaoMCP: '/mcp',
      documentacaoFerramentas: '/mcp/tools',
      saudeDoServico: '/health',
      icone: '/favicon.svg'
    }
  });
});

// Não devolve mensagens internas, dados da API ou informações sensíveis ao cliente.
app.use((err, req, res, next) => {
  console.error('[ERRO DO SERVIDOR]', err?.name || 'Erro inesperado');
  if (res.headersSent) return next(err);

  const status = err?.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json({
    erro: status === 413 ? 'A requisição excede o limite permitido.' : 'Não foi possível processar a requisição.'
  });
});

app.listen(PORT, () => {
  console.log('======================================================');
  console.log(' Clínica Favmed - Medicina Ocupacional | v2.1.0');
  console.log(` Serviço HTTP iniciado na porta ${PORT}`);
  console.log(` Integração MCP: /mcp | Saúde: /health`);
  console.log('======================================================');

  if (!process.env.MCP_AUTH_TOKEN) {
    console.warn('ATENÇÃO: MCP_AUTH_TOKEN não configurado. A integração MCP permanecerá bloqueada.');
  }
});
