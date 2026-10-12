# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [2.0.0] - 2024-12-23

### 🎉 Adicionado

#### Novas Ferramentas - Agendas
- `listar_agendas` - Lista todas as agendas cadastradas da organização
- `buscar_agenda` - Busca uma agenda específica pelo ID
- `buscar_horarios_livres` - Retorna os horários livres de uma agenda para uma data específica
- `buscar_horarios_bloqueados` - Retorna os horários bloqueados da agenda
- `buscar_horarios_permitidos` - Retorna os horários permitidos da agenda

#### Novas Ferramentas - Agendamentos
- `mudar_status_agendamento` - Muda o status de um agendamento para qualquer valor válido
- `buscar_historico_status` - Retorna histórico completo de mudanças de status de um agendamento

#### Novas Ferramentas - Profissionais
- `buscar_profissional` - Busca um profissional específico pelo ID com todos os detalhes

#### Suporte a Novos Headers
- Adicionado suporte para `X-Chave-Key` via variável de ambiente `QUARKS_CHAVE_KEY`
- Adicionado suporte para `X-Secret-Key` via variável de ambiente `QUARKS_SECRET_KEY`
- Headers são adicionados automaticamente quando as variáveis de ambiente estão configuradas

### 🔧 Corrigido

#### Headers da API
- **BREAKING CHANGE**: Mudou de `Authorization: Bearer` para `Auth-token`
- Agora usa o formato correto de autenticação da API Quarks

#### Base URL
- **BREAKING CHANGE**: Atualizada de `/clinic/ext` para `/clinic/ext/v1`
- Agora aponta para a versão correta da API

#### Formato de Data
- **BREAKING CHANGE**: Mudou de `dd/MM/yyyy` para `dd-MM-yyyy` (hífen ao invés de barra)
- Função `formatDate()` corrigida para converter corretamente `YYYY-MM-DD` → `dd-MM-yyyy`

#### Paginação
- **BREAKING CHANGE**: Início de página mudou de `0` para `1`
- Agora segue o padrão correto da API Quarks

### 🔄 Modificado

#### listar_agendamentos
- Adicionado filtro `data_agendamento_fim` (formato: YYYY-MM-DD)
- Adicionado filtro `data_agendamento_inicio` (formato: YYYY-MM-DD)
- Adicionado filtro `data_criacao` (formato: YYYY-MM-DD)
- Campo `status` agora aceita array de valores
- Filtros `dataInicio` e `dataFim` substituídos pelos novos campos
- Todos os 24 status possíveis agora documentados no enum

#### criar_agendamento
- **BREAKING CHANGE**: Campos completamente revisados conforme documentação
- Novos campos obrigatórios:
  - `agendaId` (era `profissionalId`)
  - `especialidadeId`
  - `nomePaciente`
  - `procedimentosIds` (array)
  - `telefonePaciente`
  - `telemedicina` (boolean)
  - `unidadeId`
- Removidos campos antigos: `tipoAgendamento`, `observacao`
- Agora requer `X-Chave-Key` e `X-Secret-Key` configurados

#### cancelar_agendamento
- **BREAKING CHANGE**: Mudou de PUT para PATCH
- Motivo agora é enviado via query string ao invés de body
- Campo `motivo` agora é obrigatório
- Requer `X-Chave-Key` e `X-Secret-Key` configurados

#### confirmar_agendamento
- **BREAKING CHANGE**: Mudou de PUT para PATCH
- Requer `X-Chave-Key` e `X-Secret-Key` configurados

#### listar_convenios
- Endpoint mudou de `/convenio` para `/convenios`
- Paginação agora inicia em 1

#### listar_profissionais
- Removido filtro `convenioId` (não existe na API)
- Paginação agora inicia em 1

### 📚 Documentação

- Adicionado [README.md](README.md) completo com:
  - Guia de migração da v1.0.0 para v2.0.0
  - Lista completa de todas as 17 ferramentas
  - Exemplos de uso para cada categoria
  - Documentação de todos os 24 status possíveis
  - Guia de configuração de variáveis de ambiente

- Adicionado `.env.example` com template de configuração
- Adicionado este CHANGELOG.md

### ⚠️ Breaking Changes

Esta é uma atualização **BREAKING CHANGE** que não é retrocompatível com a v1.0.0.

**Migrações necessárias:**

1. **Headers**: Configure as novas variáveis de ambiente `QUARKS_CHAVE_KEY` e `QUARKS_SECRET_KEY` para usar as ferramentas de modificação

2. **criar_agendamento**: Atualize chamadas para usar os novos campos obrigatórios:
   ```javascript
   // Antigo (v1.0.0)
   criar_agendamento({
     pacienteId: 123,
     profissionalId: 456,
     convenioId: 789,
     data: "2024-12-31",
     hora: "14:30"
   })

   // Novo (v2.0.0)
   criar_agendamento({
     agendaId: 123,
     convenioId: 789,
     data: "2024-12-31",
     especialidadeId: 456,
     hora: "14:30",
     nomePaciente: "João Silva",
     pacienteId: 123,
     procedimentosIds: [0],
     telefonePaciente: "(11) 99999-9999",
     telemedicina: false,
     unidadeId: 1
   })
   ```

3. **listar_agendamentos**: Atualize filtros de data:
   ```javascript
   // Antigo (v1.0.0)
   listar_agendamentos({
     dataInicio: "01/12/2024",
     dataFim: "31/12/2024"
   })

   // Novo (v2.0.0)
   listar_agendamentos({
     data_agendamento_inicio: "2024-12-01",
     data_agendamento_fim: "2024-12-31"
   })
   ```

## [1.0.0] - 2024-XX-XX

### Adicionado
- Primeira versão do MCP Server para Quarks
- 9 ferramentas básicas:
  - listar_agendamentos
  - buscar_agendamento
  - criar_agendamento
  - atualizar_agendamento
  - cancelar_agendamento
  - confirmar_agendamento
  - listar_convenios
  - buscar_convenio
  - listar_profissionais

### Problemas Conhecidos (corrigidos na v2.0.0)
- Headers incorretos (usava Authorization: Bearer)
- Base URL sem versão (/clinic/ext)
- Formato de data incorreto (dd/MM/yyyy ao invés de dd-MM-yyyy)
- Paginação começando em 0
- criar_agendamento com campos incompletos
- Faltando várias ferramentas da API
