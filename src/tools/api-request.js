import fetch from 'node-fetch';

const getApiConfig = () => ({
  baseUrl: (process.env.QUARKS_API_URL || 'https://api.quark.tec.br/clinic/ext/v1').replace(/\/+$/, ''),
  token: process.env.QUARKS_API_TOKEN,
  chaveKey: process.env.QUARKS_CHAVE_KEY,
  secretKey: process.env.QUARKS_SECRET_KEY
});

const getHeaders = () => {
  const config = getApiConfig();

  if (!config.token) {
    throw new Error('A integração com a API Quarks não está configurada.');
  }

  const headers = {
    'Auth-token': config.token,
    'Content-Type': 'application/json'
  };

  if (config.chaveKey) headers['X-Chave-Key'] = config.chaveKey;
  if (config.secretKey) headers['X-Secret-Key'] = config.secretKey;

  return headers;
};

export async function apiRequest(endpoint, method = 'GET', body = null) {
  const config = getApiConfig();
  const timeoutMs = Math.min(Math.max(Number(process.env.QUARKS_API_TIMEOUT_MS) || 15000, 1000), 60000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${config.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const options = {
      method,
      headers: getHeaders(),
      signal: controller.signal
    };

    if (body !== null && body !== undefined) {
      options.body = JSON.stringify(body);
    }

    // Nunca registrar corpos de requisição/resposta: podem conter dados pessoais ou de saúde.
    const response = await fetch(url, options);
    const texto = await response.text();

    if (!response.ok) {
      console.warn(`[API Quarks] Requisição recusada; método=${method}; status=${response.status}`);
      throw new Error(`A API Quarks respondeu com o código HTTP ${response.status}.`);
    }

    let dados;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      throw new Error(`A API Quarks retornou uma resposta inválida (HTTP ${response.status}).`);
    }

    if (dados && typeof dados === 'object' && 'status' in dados && 'response' in dados) {
      if (dados.status !== 'OK') {
        // Não propagar a mensagem da API, que pode incluir dados internos.
        throw new Error('A API Quarks não conseguiu concluir a operação solicitada.');
      }
      return dados.response;
    }

    return dados;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('A API Quarks excedeu o tempo máximo de resposta.');
    }
    if (error instanceof Error && (
      error.message.startsWith('A API Quarks') ||
      error.message.startsWith('A integração')
    )) {
      throw error;
    }
    console.error('[API Quarks] Falha de comunicação:', error?.name || 'Erro inesperado');
    throw new Error('Não foi possível concluir a comunicação com a API Quarks.');
  } finally {
    clearTimeout(timeout);
  }
}

export { getApiConfig };
