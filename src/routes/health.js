import express from 'express';

export const healthRouter = express.Router();

// Endpoint de disponibilidade: não revela tokens, chaves, versão do sistema ou ambiente.
healthRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    servico: 'Clínica Favmed - Medicina Ocupacional',
    status: 'disponivel',
    horario: new Date().toISOString(),
    tempoLigadoSegundos: Math.floor(process.uptime())
  });
});
