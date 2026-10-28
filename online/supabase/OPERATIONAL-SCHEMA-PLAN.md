# Plano do schema operacional — FAVMED Online

Status: proposta de arquitetura; **não é uma migração executável**. Não aplicar este documento como SQL nem criar tabelas remotas com base nele sem revisão e testes.

## Objetivo

Preparar a implementação dos módulos de recepção, profissionais, salas, fila e atendimentos para a Clínica Favmed, mantendo dados clínicos privados e autorização no servidor/banco. A branch de trabalho é `feature/favmed-online-master-login`; `main` permanece intocada.

## Pré-condições obrigatórias

1. Reconciliar o histórico de migrações registrado no Supabase com arquivos versionados. Não reconstruir SQL histórico por suposição.
2. Criar um projeto Supabase de teste isolado para validar migrações, grants, RLS e testes de integração.
3. Definir e testar autorização por função. Não confiar em role enviada pelo navegador.
4. Garantir que usuários inativos não consigam executar novas operações; definir e testar o tratamento de sessões já emitidas.
5. Documentar limitações do plano Supabase. A proteção nativa contra senhas comprometidas não está disponível no plano atual e não será requisito bloqueante; não solicitar upgrade.
6. Não usar dados reais de pacientes durante desenvolvimento e testes.

## Entidades propostas

As tabelas abaixo são um mapa conceitual para revisão. Tipos, restrições e relacionamentos finais devem ser definidos na migração depois da reconciliação.

- `profiles`: identidade e papel da conta; vinculada a `auth.users`. Escrita administrativa somente via Edge Function confiável.
- `professionals`: dados de cadastro profissional e estado ativo, sem armazenar segredos de autenticação.
- `rooms`: salas configuradas e estado operacional.
- `patients`: cadastro mínimo necessário do paciente; CPF e outros identificadores devem ter acesso restrito.
- `visits`: episódio de atendimento, paciente, data, tipo e estado; separar de dados clínicos detalhados quando possível.
- `queue_entries`: posição/estado da fila vinculados a visita e sala; preservar histórico de chamadas e transições.
- `audit_events`: trilha de auditoria de ações relevantes, com ator, ação, entidade, horário e metadados mínimos. Nunca registrar senhas, tokens ou conteúdo clínico desnecessário.

## Matriz inicial de autorização

| Papel | Perfis | Pacientes | Fila/salas | Atendimentos |
|---|---|---|---|---|
| Master | Gerencia contas via Edge Function; não recebe acesso clínico irrestrito automaticamente | Acesso administrativo só se aprovado explicitamente | Configuração administrativa | Acesso conforme política clínica aprovada |
| Recepção | Lê o próprio perfil | Criar/atualizar cadastro mínimo | Criar entradas e acompanhar fila | Dados operacionais mínimos |
| Profissional | Lê o próprio perfil | Somente pacientes relacionados aos atendimentos autorizados | Consultar chamadas/salas relevantes | Registrar e consultar atendimentos autorizados |
| Sala | Lê o próprio perfil | Sem acesso ao cadastro clínico completo | Ver somente chamadas e dados mínimos para identificação operacional | Sem acesso a anamnese/prontuário |

Esta matriz é uma proposta conservadora, não uma política já implantada. Validar com o fluxo real da clínica antes de escrever policies.

## Regras técnicas para a migração futura

- RLS habilitada e forçada em toda tabela acessível pelo cliente.
- Negar por padrão; políticas explícitas por papel e relação de atendimento.
- Não conceder acesso geral a `authenticated` sem política restritiva.
- Chaves estrangeiras, `NOT NULL`, checks de estados e índices para relações e consultas frequentes.
- Evitar expor colunas sensíveis em views e respostas de sala.
- Operações privilegiadas no servidor/Edge Function, com validação do Bearer token e perfil ativo.
- Auditoria sem conteúdo sensível e sem segredos.
- Testes positivos e negativos para cada papel, incluindo tentativa de acessar registros de outro paciente.
- Migrações incrementais, revisáveis e reproduzíveis; nunca editar migrações que já foram aplicadas em ambiente compartilhado.

## Critérios de liberação

Os módulos só podem ser habilitados quando:
- a migração for reproduzível em ambiente isolado;
- todos os testes de RLS/autorização passarem;
- usuário inativo e sessão antiga tiverem comportamento validado;
- CI estiver verde;
- limitações do plano estiverem documentadas e os controles de segurança disponíveis estiverem revisados;
- a implantação e o rollback estiverem documentados.

## Estado atual confirmado em 2026-10-28

A auditoria do projeto `qzjkoyqmjueosevzhxqa` encontrou apenas `public.profiles` no schema `public`; as tabelas operacionais ainda não existem. Nenhuma alteração foi aplicada ao banco remoto durante a auditoria. Consulte `SCHEMA-RECONCILIATION.md` e `MASTER-BOOTSTRAP.md`.
