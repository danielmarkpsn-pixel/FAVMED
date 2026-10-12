# MCP Quarks Agendamentos

Model Context Protocol (MCP) Server para integração com a API Quarks Clinic.

## Versão 2.0.0

Esta versão inclui todas as ferramentas de agendamento disponíveis na API Quarks, com correções importantes de headers e formatos de data.

## Alterações da v1.0.0 para v2.0.0

### Correções Implementadas

1. **Headers Corrigidos**:
   - Mudou de `Authorization: Bearer` para `Auth-token`
   - Adicionado suporte para `X-Chave-Key` e `X-Secret-Key`

2. **Base URL Atualizada**:
   - De `/clinic/ext` para `/clinic/ext/v1`

3. **Formato de Data Corrigido**:
   - De `dd/MM/yyyy` para `dd-MM-yyyy` (com hífen)

4. **Paginação Corrigida**:
   - Início padrão mudou de `0` para `1`

### Novas Ferramentas Adicionadas

#### Gestão de Agendas (5 novas ferramentas)
- `listar_agendas` - Lista todas as agendas cadastradas
- `buscar_agenda` - Busca uma agenda específica por ID
- `buscar_horarios_livres` - Verifica horários disponíveis em uma agenda
- `buscar_horarios_bloqueados` - Lista horários bloqueados de uma agenda
- `buscar_horarios_permitidos` - Lista horários permitidos de uma agenda

#### Gestão de Agendamentos (3 novas ferramentas)
- `mudar_status_agendamento` - Muda o status de um agendamento para qualquer valor válido
- `buscar_historico_status` - Retorna histórico completo de mudanças de status

#### Gestão de Profissionais (1 nova ferramenta)
- `buscar_profissional` - Busca detalhes completos de um profissional

### Ferramentas Atualizadas

- `listar_agendamentos` - Adicionados novos filtros (data_criacao, status como array)
- `criar_agendamento` - Atualizado com todos os campos obrigatórios da API
- `cancelar_agendamento` - Agora usa PATCH com query string para o motivo
- `confirmar_agendamento` - Agora usa PATCH conforme documentação

## Configuração

### Variáveis de Ambiente

```bash
# Obrigatório
export QUARKS_API_TOKEN="seu-token-aqui"

# Opcional (mas recomendado para operações de criação/modificação)
export QUARKS_CHAVE_KEY="sua-chave-aqui"
export QUARKS_SECRET_KEY="seu-secret-aqui"

# Opcional - URL customizada da API
export QUARKS_API_URL="https://api.quark.tec.br/clinic/ext/v1"
```

### Instalação

```bash
npm install
```

### Execução

```bash
npm start
```

## Ferramentas Disponíveis

### 📅 Agendas (5 ferramentas)

1. **listar_agendas** - Lista todas as agendas
2. **buscar_agenda** - Busca agenda por ID
3. **buscar_horarios_livres** - Verifica disponibilidade
4. **buscar_horarios_bloqueados** - Lista bloqueios
5. **buscar_horarios_permitidos** - Lista horários permitidos

### 📋 Agendamentos (8 ferramentas)

1. **listar_agendamentos** - Lista com filtros avançados
2. **buscar_agendamento** - Busca por ID
3. **criar_agendamento** - Cria novo agendamento ⚠️ Requer X-Chave-Key e X-Secret-Key
4. **cancelar_agendamento** - Cancela agendamento ⚠️ Requer X-Chave-Key e X-Secret-Key
5. **confirmar_agendamento** - Confirma agendamento ⚠️ Requer X-Chave-Key e X-Secret-Key
6. **mudar_status_agendamento** - Muda status
7. **buscar_historico_status** - Histórico de alterações

### 🏥 Convênios (2 ferramentas)

1. **listar_convenios** - Lista todos os convênios
2. **buscar_convenio** - Busca por ID

### 👨‍⚕️ Profissionais (2 ferramentas)

1. **listar_profissionais** - Lista todos os profissionais
2. **buscar_profissional** - Busca por ID

## Status Disponíveis para Agendamentos

A API Quarks suporta os seguintes status:

- `LIVRE` - Horário livre
- `AVALIACAO` - Em avaliação
- `HORARIO_BLOQUEADO` - Horário bloqueado
- `AGENDADO` - Agendado
- `CANCELADO` - Cancelado
- `CANCELADO_VIA_SMS` - Cancelado via SMS
- `CONFIRMADO` - Confirmado
- `FALTOU` - Paciente faltou
- `AGUARDANDO_RECEPCAO` - Aguardando recepção
- `RECEPCAO` - Na recepção
- `AGUARDANDO_PRE_CONSULTA` - Aguardando pré-consulta
- `PRE_CONSULTA` - Em pré-consulta
- `AGUARDANDO_ATENDIMENTO` - Aguardando atendimento
- `EM_ATENDIMENTO` - Em atendimento
- `AGUARDANDO_POS_CONSULTA` - Aguardando pós-consulta
- `POS_CONSULTA` - Em pós-consulta
- `ATENDIMENTO_COMPLETO` - Atendimento completo
- `PRE_AGENDAMENTO` - Pré-agendamento
- `AUSENTE_POS_CONSULTA` - Ausente pós-consulta
- `EXCLUIDO` - Excluído
- `TRANSFERIDO` - Transferido
- `REAGENDADO` - Reagendado
- `PAGAMENTO_AGUARDANDO` - Aguardando pagamento
- `PAGAMENTO_INFORMADO` - Pagamento informado

## Exemplos de Uso

### Verificar Horários Livres

```javascript
// Primeiro, liste as agendas disponíveis
listar_agendas({ page: 1 })

// Depois, busque os horários livres de uma agenda específica
buscar_horarios_livres({
  id: 123,
  data: "2024-12-25"
})
```

### Criar um Agendamento

```javascript
criar_agendamento({
  agendaId: 123,
  convenioId: 456,
  data: "2024-12-25",
  especialidadeId: 789,
  hora: "14:30",
  nomePaciente: "João Silva",
  pacienteId: 1011,
  procedimentosIds: [0],
  telefonePaciente: "(11) 99999-9999",
  telemedicina: false,
  unidadeId: 1
})
```

### Buscar Agendamentos por Período

```javascript
listar_agendamentos({
  data_agendamento_inicio: "2024-12-01",
  data_agendamento_fim: "2024-12-31",
  status: ["AGENDADO", "CONFIRMADO"],
  page: 1
})
```

### Histórico de um Agendamento

```javascript
// Ver todas as mudanças de status
buscar_historico_status({ id: 12345 })
```

## Formato de Datas

Todas as datas devem ser fornecidas no formato `YYYY-MM-DD` (ex: `2024-12-31`). O MCP converte automaticamente para o formato esperado pela API (`dd-MM-yyyy`).

## Formato de Horários

Horários devem ser no formato `HH:mm` (ex: `14:30`, `09:00`).

## Formato de Telefone

Telefones devem incluir DDD com parênteses: `(99) 99999-9999`

## Observações Importantes

1. **Operações que modificam dados** (criar, cancelar, confirmar) requerem `X-Chave-Key` e `X-Secret-Key` configurados
2. **Paginação** começa em `1` (não em `0`)
3. **Arrays de status** podem ser usados para filtrar múltiplos status simultaneamente
4. **Todas as respostas** retornam o formato padrão da API Quarks: `{ status, response, errorDetail }`

## Documentação da API

Base URL: `https://api.quark.tec.br/clinic/ext/v1`

Para mais informações sobre a API Quarks, consulte a documentação oficial.

## Licença

MIT
