// Utilitário de logging estruturado com níveis configuráveis

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const baseLog = `[${timestamp}] [${level}]`;

  if (Object.keys(meta).length === 0) {
    return `${baseLog} ${message}`;
  }

  return `${baseLog} ${message} ${JSON.stringify(meta)}`;
}

export const logger = {
  error(message, meta) {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error(formatLog('ERROR', message, meta));
    }
  },

  warn(message, meta) {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn(formatLog('WARN', message, meta));
    }
  },

  info(message, meta) {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log(formatLog('INFO', message, meta));
    }
  },

  debug(message, meta) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log(formatLog('DEBUG', message, meta));
    }
  },

  // Helpers para casos específicos
  apiRequest(method, endpoint, duration) {
    this.debug('API Request', { method, endpoint, duration: `${duration}ms` });
  },

  apiError(endpoint, error) {
    this.error('API Request Failed', { endpoint, error: error.message });
  },

  toolCall(toolName, success, duration) {
    this.info('Tool Execution', { tool: toolName, success, duration: `${duration}ms` });
  }
};
