import express from 'express';

export const healthRouter = express.Router();

healthRouter.get('/', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      apiConfigured: !!process.env.QUARKS_API_TOKEN,
      keysConfigured: !!(process.env.QUARKS_CHAVE_KEY && process.env.QUARKS_SECRET_KEY)
    }
  };

  res.json(healthStatus);
});
