import { apiRequest, getApiConfig } from "./api-request.js";


// Função auxiliar para formatar data no padrão Quarks
// Para query params: dd-MM-yyyy (com hífen)
// Para JSON body: dd/MM/yyyy (com barra)
function formatDate(data, useSlash = false) {
  const [ano, mes, dia] = data.split("-");
  const separator = useSlash ? "/" : "-";
  return `${dia}${separator}${mes}${separator}${ano}`;
}

// Função auxiliar para construir query string
function buildQueryString(params) {
  const filtered = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map(v => `${key}=${encodeURIComponent(v)}`).join("&");
      }
      return `${key}=${encodeURIComponent(value)}`;
    })
    .join("&");
  return filtered ? `?${filtered}` : "";
}

// ========== FUNÇÕES DE VALIDAÇÃO ==========

// Validar intervalo de datas (máximo 30 dias)
function validarIntervaloDatas(dataInicio, dataFim) {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);

  const diferencaEmMs = fim - inicio;
  const diferencaEmDias = diferencaEmMs / (1000 * 60 * 60 * 24);

  if (diferencaEmDias < 0) {
    throw new Error("A data inicial não pode ser maior que a data final");
  }

  if (diferencaEmDias > 30) {
    throw new Error("O intervalo entre as datas não pode ser maior que 30 dias (limite da API)");
  }

  return true;
}

// Verificar se as chaves de autenticação estão configuradas
function verificarChavesAutenticacao() {
  const config = getApiConfig();

  if (!config.chaveKey || !config.secretKey) {
    throw new Error(
      "Operação não autorizada: X-Chave-Key e X-Secret-Key devem estar configurados nas variáveis de ambiente " +
      "(QUARKS_CHAVE_KEY e QUARKS_SECRET_KEY) para realizar operações de escrita."
    );
  }

  return true;
}

// Validar formato de hora (HH:mm)
function validarFormatoHora(hora) {
  const regexHora = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

  if (!regexHora.test(hora)) {
    throw new Error(`Formato de hora inválido: "${hora}". Use o formato HH:mm (ex: 14:30, 09:00)`);
  }

  return true;
}

// Validar formato de data (YYYY-MM-DD)
function validarFormatoData(data) {
  const regexData = /^\d{4}-\d{2}-\d{2}$/;

  if (!regexData.test(data)) {
    throw new Error(`Formato de data inválido: "${data}". Use o formato YYYY-MM-DD (ex: 2026-01-15)`);
  }

  // Validar se é uma data válida
  const [ano, mes, dia] = data.split("-").map(Number);
  const dataObj = new Date(ano, mes - 1, dia);

  if (
    dataObj.getFullYear() !== ano ||
    dataObj.getMonth() !== mes - 1 ||
    dataObj.getDate() !== dia
  ) {
    throw new Error(`Data inválida: "${data}"`);
  }

  return true;
}

// Validar telefone com DDD (formato básico)
function validarTelefone(telefone) {
  if (!telefone || telefone.trim() === "") {
    throw new Error("Telefone é obrigatório");
  }

  // Remove caracteres não numéricos
  const apenasNumeros = telefone.replace(/\D/g, '');

  // Telefone deve ter 10 ou 11 dígitos (DDD + número)
  if (apenasNumeros.length < 10 || apenasNumeros.length > 11) {
    throw new Error(
      `Telefone inválido: "${telefone}". Deve conter DDD + número (10 ou 11 dígitos). ` +
      `Ex: 11987654321 ou (11) 98765-4321`
    );
  }

  return true;
}

// Validar array não vazio
function validarArrayNaoVazio(array, nomeCampo) {
  if (!array || !Array.isArray(array) || array.length === 0) {
    throw new Error(`${nomeCampo} não pode ser vazio. É necessário informar ao menos um item.`);
  }

  return true;
}

// Validar string não vazia
function validarStringNaoVazia(texto, nomeCampo) {
  if (!texto || texto.trim() === "") {
    throw new Error(`${nomeCampo} é obrigatório e não pode ser vazio`);
  }

  return true;
}

// Validar se horário está disponível na agenda
async function validarHorarioDisponivel(agendaId, data, hora) {
  try {
    const dataFormatada = formatDate(data);
    const queryString = buildQueryString({ data: dataFormatada });
    const horariosLivres = await apiRequest(`/agendas/${agendaId}/horarios-livres${queryString}`);

    if (!horariosLivres || horariosLivres.length === 0) {
      throw new Error(`Nenhum horário disponível na agenda ${agendaId} para a data ${data}`);
    }

    // A API retorna: [{ data: "08-01-2026", horarios: [{ intervalo: "08:30 - 08:36", status: "LIVRE" }] }]
    // Extrair os horários do primeiro elemento (que contém a data solicitada)
    const diaHorarios = horariosLivres[0];

    if (!diaHorarios || !diaHorarios.horarios || diaHorarios.horarios.length === 0) {
      throw new Error(`Nenhum horário disponível na agenda ${agendaId} para a data ${data}`);
    }

    // Extrair apenas os horários de início de cada intervalo
    const horariosDisponiveis = diaHorarios.horarios
      .filter(h => h.status === 'LIVRE')
      .map(h => {
        // "08:30 - 08:36" -> "08:30"
        const intervalo = h.intervalo || '';
        return intervalo.split(' - ')[0].trim();
      });

    if (!horariosDisponiveis.includes(hora)) {
      throw new Error(
        `Horário ${hora} não está disponível na agenda ${agendaId} para ${data}. ` +
        `Horários disponíveis: ${horariosDisponiveis.join(", ")}`
      );
    }

    return true;
  } catch (error) {
    // Re-lançar o erro para que seja tratado pelo handler
    throw error;
  }
}

// Implementação das ferramentas
export const tools = [
  // ========== AGENDAS ==========
  {
    name: "listar_agendas",
    description: "Retorna todas as agendas cadastradas da organização. Uma agenda representa a disponibilidade de um profissional.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Número da página para paginação (padrão: 1)",
        },
      },
    },
  },
  {
    name: "buscar_agenda",
    description: "Busca uma agenda específica pelo ID. Retorna detalhes completos da agenda incluindo horários de funcionamento.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID da agenda",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "buscar_horarios_livres",
    description: "Retorna os horários livres de uma agenda para uma data específica. Use esta ferramenta para verificar disponibilidade antes de criar um agendamento.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID da agenda",
        },
        data: {
          type: "string",
          description: "Data para consultar horários livres (formato: YYYY-MM-DD, ex: 2024-12-31)",
        },
      },
      required: ["id", "data"],
    },
  },
  {
    name: "buscar_horarios_bloqueados",
    description: "Retorna os horários bloqueados da agenda. Horários bloqueados não podem ser agendados.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID da agenda",
        },
        page: {
          type: "number",
          description: "Número da página para paginação (padrão: 1)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "buscar_horarios_permitidos",
    description: "Retorna os horários permitidos da agenda. Define os intervalos de tempo em que a agenda aceita agendamentos.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID da agenda",
        },
        page: {
          type: "number",
          description: "Número da página para paginação (padrão: 1)",
        },
      },
      required: ["id"],
    },
  },

  // ========== AGENDAMENTOS ==========
  {
    name: "listar_agendamentos",
    description: "Lista todos os agendamentos com filtros avançados. ATENÇÃO: O intervalo entre data_agendamento_inicio e data_agendamento_fim não pode ser maior que 30 dias.",
    inputSchema: {
      type: "object",
      properties: {
        data_agendamento_inicio: {
          type: "string",
          description: "Data inicial do agendamento (formato: YYYY-MM-DD) - OBRIGATÓRIO. Máximo 30 dias de diferença em relação à data_agendamento_fim",
        },
        data_agendamento_fim: {
          type: "string",
          description: "Data final do agendamento (formato: YYYY-MM-DD) - OBRIGATÓRIO",
        },
        data_criacao: {
          type: "string",
          description: "Data de criação do agendamento (formato: YYYY-MM-DD)",
        },
        id_profissional: {
          type: "number",
          description: "ID do profissional para filtrar",
        },
        paciente_id: {
          type: "number",
          description: "ID do paciente para filtrar",
        },
        status: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "LIVRE", "AVALIACAO", "HORARIO_BLOQUEADO", "AGENDADO",
              "CANCELADO", "CANCELADO_VIA_SMS", "CONFIRMADO", "FALTOU",
              "AGUARDANDO_RECEPCAO", "RECEPCAO", "AGUARDANDO_PRE_CONSULTA",
              "PRE_CONSULTA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO",
              "AGUARDANDO_POS_CONSULTA", "POS_CONSULTA", "ATENDIMENTO_COMPLETO",
              "PRE_AGENDAMENTO", "AUSENTE_POS_CONSULTA", "EXCLUIDO",
              "TRANSFERIDO", "REAGENDADO", "PAGAMENTO_AGUARDANDO",
              "PAGAMENTO_INFORMADO"
            ],
          },
          description: "Lista de status para filtrar",
        },
        page: {
          type: "number",
          description: "Número da página para paginação (padrão: 1)",
        },
      },
      required: ["data_agendamento_inicio", "data_agendamento_fim"],
    },
  },
  {
    name: "buscar_agendamento",
    description: "Busca um agendamento específico pelo ID. Retorna todos os detalhes incluindo paciente, profissional, convênio, procedimentos e status.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID do agendamento",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "criar_agendamento",
    description: "Cria um novo agendamento no sistema. Requer X-Chave-Key e X-Secret-Key configurados.",
    inputSchema: {
      type: "object",
      properties: {
        agendaId: {
          type: "number",
          description: "ID da agenda onde será criado o agendamento",
        },
        convenioId: {
          type: "number",
          description: "ID do convênio",
        },
        data: {
          type: "string",
          description: "Data do agendamento (formato: YYYY-MM-DD, ex: 2023-12-31)",
        },
        especialidadeId: {
          type: "number",
          description: "ID da especialidade",
        },
        hora: {
          type: "string",
          description: "Hora do agendamento (formato: HH:mm, ex: 17:30)",
        },
        nomePaciente: {
          type: "string",
          description: "Nome do paciente",
        },
        pacienteId: {
          type: "number",
          description: "ID do paciente",
        },
        procedimentosIds: {
          type: "array",
          items: { type: "number" },
          description: "Array com IDs dos procedimentos",
        },
        telefonePaciente: {
          type: "string",
          description: "Telefone do paciente com DDD",
        },
        telemedicina: {
          type: "boolean",
          description: "Se é atendimento por telemedicina",
        },
        unidadeId: {
          type: "number",
          description: "ID da unidade (padrão: 272616140)",
        },
      },
      required: [
        "agendaId", "convenioId", "data", "especialidadeId", "hora",
        "nomePaciente", "pacienteId", "procedimentosIds", "telefonePaciente",
        "telemedicina",
      ],
    },
  },
  {
    name: "cancelar_agendamento",
    description: "Cancela um agendamento existente. Requer X-Chave-Key e X-Secret-Key.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID do agendamento a ser cancelado",
        },
        motivo: {
          type: "string",
          description: "Motivo do cancelamento (obrigatório)",
        },
      },
      required: ["id", "motivo"],
    },
  },
  {
    name: "confirmar_agendamento",
    description: "Confirma um agendamento existente. Requer X-Chave-Key e X-Secret-Key.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID do agendamento a ser confirmado",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "mudar_status_agendamento",
    description: "Muda o status de um agendamento para qualquer status válido.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID do agendamento",
        },
        novoStatus: {
          type: "string",
          description: "Novo status do agendamento",
          enum: [
            "LIVRE", "AVALIACAO", "HORARIO_BLOQUEADO", "AGENDADO",
            "CANCELADO", "CANCELADO_VIA_SMS", "CONFIRMADO", "FALTOU",
            "AGUARDANDO_RECEPCAO", "RECEPCAO", "AGUARDANDO_PRE_CONSULTA",
            "PRE_CONSULTA", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO",
            "AGUARDANDO_POS_CONSULTA", "POS_CONSULTA", "ATENDIMENTO_COMPLETO",
            "PRE_AGENDAMENTO", "AUSENTE_POS_CONSULTA", "EXCLUIDO",
            "TRANSFERIDO", "REAGENDADO", "PAGAMENTO_AGUARDANDO",
            "PAGAMENTO_INFORMADO"
          ],
        },
        observacao: {
          type: "string",
          description: "Observação sobre a mudança de status",
        },
      },
      required: ["id", "novoStatus"],
    },
  },
  {
    name: "buscar_historico_status",
    description: "Retorna todos os status de alterações de um determinado agendamento.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID do agendamento",
        },
      },
      required: ["id"],
    },
  },

  // ========== CONVÊNIOS ==========
  {
    name: "listar_convenios",
    description: "Lista todos os convênios cadastrados no sistema.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Número da página (padrão: 1)",
        },
      },
    },
  },
  {
    name: "buscar_convenio",
    description: "Busca informações detalhadas de um convênio específico pelo ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID do convênio",
        },
      },
      required: ["id"],
    },
  },

  // ========== PROFISSIONAIS ==========
  {
    name: "listar_profissionais",
    description: "Lista todos os profissionais cadastrados na organização.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Número da página (padrão: 1)",
        },
      },
    },
  },
  {
    name: "buscar_profissional",
    description: "Busca um profissional específico pelo ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "ID do profissional",
        },
      },
      required: ["id"],
    },
  },
];

// Handler das ferramentas
export async function handleToolCall(name, args) {
  switch (name) {
    // ========== AGENDAS ==========
    case "listar_agendas": {
      const queryString = buildQueryString({ page: args.page || 1 });
      return await apiRequest(`/agendas${queryString}`);
    }

    case "buscar_agenda": {
      return await apiRequest(`/agendas/${args.id}`);
    }

    case "buscar_horarios_livres": {
      const dataFormatada = formatDate(args.data);
      const queryString = buildQueryString({ data: dataFormatada });
      return await apiRequest(`/agendas/${args.id}/horarios-livres${queryString}`);
    }

    case "buscar_horarios_bloqueados": {
      const queryString = buildQueryString({ page: args.page || 1 });
      return await apiRequest(`/agendas/${args.id}/horariosBloqueados${queryString}`);
    }

    case "buscar_horarios_permitidos": {
      const queryString = buildQueryString({ page: args.page || 1 });
      return await apiRequest(`/agendas/${args.id}/horariosPermitidos${queryString}`);
    }

    // ========== AGENDAMENTOS ==========
    case "listar_agendamentos": {
      // Validar formatos de data
      validarFormatoData(args.data_agendamento_inicio);
      validarFormatoData(args.data_agendamento_fim);
      if (args.data_criacao) validarFormatoData(args.data_criacao);

      // Validar intervalo de datas (máximo 30 dias)
      validarIntervaloDatas(args.data_agendamento_inicio, args.data_agendamento_fim);

      const params = {};
      params.data_agendamento_fim = formatDate(args.data_agendamento_fim);
      params.data_agendamento_inicio = formatDate(args.data_agendamento_inicio);
      if (args.data_criacao) params.data_criacao = formatDate(args.data_criacao);
      if (args.id_profissional) params.id_profissional = args.id_profissional;
      if (args.paciente_id) params.paciente_id = args.paciente_id;
      if (args.status) params.status = args.status;
      params.page = args.page || 1;
      const queryString = buildQueryString(params);
      return await apiRequest(`/agendamentos${queryString}`);
    }

    case "buscar_agendamento": {
      return await apiRequest(`/agendamentos/${args.id}`);
    }

    case "criar_agendamento": {
      // Validar chaves de autenticação
      verificarChavesAutenticacao();

      // Validar formatos
      validarFormatoData(args.data);
      validarFormatoHora(args.hora);
      validarTelefone(args.telefonePaciente);
      validarArrayNaoVazio(args.procedimentosIds, "procedimentosIds");
      validarStringNaoVazia(args.nomePaciente, "Nome do paciente");

      // NOTA: Validação prévia de horário DESABILITADA para evitar timeouts
      // A API Quarks validará o horário ao tentar criar o agendamento
      // Se o horário não estiver disponível, retornará erro específico
      // Para reabilitar: descomente a linha abaixo
      // await validarHorarioDisponivel(args.agendaId, args.data, args.hora);

      // Formatar data no padrão dd/MM/yyyy (com barras) para JSON body
      const dataFormatada = formatDate(args.data, true);

      const payload = {
        agendaId: args.agendaId,
        convenioId: args.convenioId,
        data: dataFormatada,
        especialidadeId: args.especialidadeId,
        hora: args.hora,
        nomePaciente: args.nomePaciente,
        pacienteId: args.pacienteId,
        procedimentosIds: args.procedimentosIds,
        telefonePaciente: args.telefonePaciente,
        telemedicina: args.telemedicina,
        unidadeId: args.unidadeId || 272616140,  // Valor padrão: 272616140
      };
      return await apiRequest("/agendamentos", "POST", payload);
    }

    case "cancelar_agendamento": {
      // Validar chaves de autenticação
      verificarChavesAutenticacao();

      // Validar motivo não vazio
      validarStringNaoVazia(args.motivo, "Motivo do cancelamento");

      const queryString = buildQueryString({ motivo: args.motivo });
      return await apiRequest(`/agendamentos/${args.id}/cancelar${queryString}`, "PATCH");
    }

    case "confirmar_agendamento": {
      // Validar chaves de autenticação
      verificarChavesAutenticacao();

      return await apiRequest(`/agendamentos/${args.id}/confirmar`, "PATCH");
    }

    case "mudar_status_agendamento": {
      // Validar chaves de autenticação
      verificarChavesAutenticacao();

      const payload = {
        novoStatus: args.novoStatus,
        observacao: args.observacao || "",
      };
      return await apiRequest(`/agendamentos/${args.id}/mudar-status`, "POST", payload);
    }

    case "buscar_historico_status": {
      return await apiRequest(`/agendamentos/${args.id}/status`);
    }

    // ========== CONVÊNIOS ==========
    case "listar_convenios": {
      const queryString = buildQueryString({ page: args.page || 1 });
      return await apiRequest(`/convenios${queryString}`);
    }

    case "buscar_convenio": {
      return await apiRequest(`/convenio/${args.id}`);
    }

    // ========== PROFISSIONAIS ==========
    case "listar_profissionais": {
      const queryString = buildQueryString({ page: args.page || 1 });
      return await apiRequest(`/profissionais${queryString}`);
    }

    case "buscar_profissional": {
      return await apiRequest(`/profissionais/${args.id}`);
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}
