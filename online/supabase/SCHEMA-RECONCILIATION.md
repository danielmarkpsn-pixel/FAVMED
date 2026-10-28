# Auditoria de schema e reconciliação de migrações — FAVMED Online

Data da verificação: 2026-10-28  
Projeto Supabase de desenvolvimento: `qzjkoyqmjueosevzhxqa`  
Branch de código: `feature/favmed-online-master-login`

## Escopo e segurança

Esta auditoria usou consultas somente de leitura ao projeto Supabase. Nenhuma tabela foi criada, alterada ou apagada e nenhuma migração foi aplicada durante a auditoria. Não usar dados reais de pacientes neste estágio.

## Estado observado no Supabase

- A única tabela encontrada no schema `public` é `public.profiles`.
- `profiles` tem RLS habilitada e forçada.
- Colunas observadas: `id` (UUID, PK e FK para `auth.users.id`), `display_name`, `role`, `active`, `created_at`, `updated_at`.
- Restrição de role: `master`, `recepcao`, `profissional` ou `sala`.
- A única política encontrada é `profiles_select_own`, para SELECT por usuários autenticados, com condição `auth.uid() = id`.
- Não foram encontradas políticas de escrita para clientes em `profiles`.
- A função Edge `master-users` foi implantada e verificada na versão 4. O código ativo não contém CORS curinga; rejeita origens diferentes da origem configurada e diferencia limite de convites (429) de e-mail já existente (409). O padrão sem segredo `FAVMED_ALLOWED_ORIGIN` é `http://localhost:5173`, portanto outros endereços de desenvolvimento e a produção exigem configurar a origem exata.
- Auditoria somente de leitura de `auth.users` versus `public.profiles`: 2 contas Auth, 2 perfis correspondentes e 0 contas Auth sem perfil no momento da consulta.
- Os logs das últimas 24 horas mostraram respostas recentes HTTP 201 (convite criado) e HTTP 200 (operações administrativas), além de respostas HTTP 400/500 anteriores. Os logs agregados não comprovam a entrega de todos os e-mails; o painel de Auth/SMTP ainda é a fonte para investigar limites e entregabilidade.
- O histórico de migrações do banco lista:
  - `20261028134244 / favmed_profiles_rls`
  - `20261028134308 / secure_rls_auto_enable_function`
  - `20261028154747 / restore_service_role_profiles_privileges`
- O repositório contém atualmente apenas `20261028160000_restore_service_role_profiles_privileges.sql` na pasta `online/supabase/migrations`. Portanto, o histórico SQL do banco não é reproduzido integralmente pelo Git.

## Conclusão

O schema atual é somente a base de autenticação/perfis. Não há ainda tabelas de pacientes, fila, atendimentos, profissionais ou salas no schema `public`. Os módulos operacionais não devem ser habilitados.

## Plano seguro de reconciliação

1. Preservar as migrações já registradas no Supabase; não apagar nem editar o histórico remoto.
2. Recuperar o SQL exato das migrações iniciais a partir do histórico confiável do repositório, backups ou definição validada. Não reconstruir migrações históricas por suposição.
3. Comparar o SQL recuperado com o schema real, incluindo grants, RLS, policies e funções.
4. Se o SQL original não puder ser recuperado, criar uma migração de baseline/documentação revisada, explicitamente destinada a novas instalações, sem reaplicá-la sobre o projeto existente.
5. Testar em um projeto de desenvolvimento descartável ou branch de banco antes de qualquer alteração remota.
6. Criar tabelas operacionais em migrações novas e incrementais, com chaves estrangeiras, restrições, índices e RLS desde a primeira implantação.
7. Testar acesso permitido e negado para Master, recepção, profissional, sala e usuário inativo antes de liberar módulos.

## Validações de segurança pendentes

- A proteção nativa contra senhas comprometidas não está disponível no plano Supabase atual. Essa limitação está documentada e **não é requisito bloqueante**; não solicitar upgrade nem afirmar que o recurso foi ativado.
- Confirmar cadastro público e login anônimo desativados.
- Testar que usuários não-Master recebem 403 nas operações administrativas.
- Testar o comportamento de sessão de usuário inativo, incluindo tokens já emitidos.
- Confirmar que segredos administrativos nunca são entregues ao frontend.
- Configurar CORS para o domínio de produção somente quando ele for definido.
- Fazer testes de RLS com usuários de teste distintos; uma consulta administrativa executada com privilégios elevados não substitui esses testes.

## Regra de liberação

Não implantar dados reais de pacientes nem liberar recepção, profissional, sala, fila ou atendimentos até que as migrações sejam reproduzíveis, o conjunto de policies esteja testado e o CI esteja aprovado.
