import fetch from "node-fetch";

// Funções para obter configurações da API (lazy loading)
const getApiConfig = () => ({
  baseUrl: process.env.QUARKS_API_URL || "https://api.quark.tec.br/clinic/ext/v1",
  token: process.env.QUARKS_API_TOKEN,
  chaveKey: process.env.QUARKS_CHAVE_KEY,
  secretKey: process.env.QUARKS_SECRET_KEY
});

// Headers padrão para requisições
const getHeaders = () => {
  const config = getApiConfig();

  if (!config.token) {
    throw new Error("QUARKS_API_TOKEN não foi configurado nas variáveis de ambiente");
  }

  const headers = {
    "Auth-token": config.token,
    "Content-Type": "application/json",
  };

  if (config.chaveKey) {
    headers["X-Chave-Key"] = config.chaveKey;
  }
  if (config.secretKey) {
    headers["X-Secret-Key"] = config.secretKey;
  }

  return headers;
};

// Função auxiliar para chamadas à API
export async function apiRequest(endpoint, method = "GET", body = null) {
  const config = getApiConfig();
  const url = `${config.baseUrl}${endpoint}`;
  const options = {
    method,
    headers: getHeaders(),
  };

  if (body) {
    options.body = JSON.stringify(body);
    // Log do payload sendo enviado
    console.log(`[API Request Payload]`, JSON.stringify(body, null, 2));
  }

  try {
    const response = await fetch(url, options);

    // Log do status da resposta HTTP
    console.log(`[API] ${method} ${url} - Status: ${response.status}`);

    // Verificar se a resposta HTTP foi bem-sucedida
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Log da resposta completa para debug
    console.log(`[API Response]`, JSON.stringify(data, null, 2));

    // A API Quarks retorna diretamente os dados, não um wrapper {status: "OK", response: ...}
    // Se a resposta for um objeto com propriedade "status" e "response", usar response
    // Caso contrário, retornar os dados diretamente
    if (data.status && data.response !== undefined) {
      if (data.status !== "OK") {
        const errorMsg = data.errorDetail || data.message || data.error || JSON.stringify(data);
        throw new Error(`API Error: ${errorMsg}`);
      }
      return data.response;
    }

    // Se não for o formato esperado, retornar os dados diretamente
    return data;
  } catch (error) {
    // Se for erro de JSON, mostrar o status HTTP
    if (error.name === 'SyntaxError') {
      throw new Error(`Falha ao parsear resposta JSON. Status HTTP: ${response?.status}`);
    }
    throw new Error(`Falha na requisição: ${error.message}`);
  }
}

export { getApiConfig };
