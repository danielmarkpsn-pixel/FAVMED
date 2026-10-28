# Provisionamento e segurança do FAVMED Online

Este documento descreve o ambiente de desenvolvimento e os controles que ainda precisam ser validados. O sistema online é exclusivo da Clínica Favmed. A gestão de contas deve ser feita pelo Master; não habilitar cadastro público.

## Estado observado em 2026-10-28

- Projeto Supabase de desenvolvimento: `qzjkoyqmjueosevzhxqa`.
- `public.profiles` existe com RLS habilitada e forçada.
- A política `profiles_select_own` permite SELECT apenas quando `auth.uid() = id`.
- A Edge Function `master-users` está ativa na versão 3.
- A função está implantada com `verify_jwt = false` por compatibilidade com chaves modernas. Isso exige que o código continue validando manualmente o token Bearer via Supabase Auth e verificando o perfil Master ativo em cada operação.
- O histórico de migrações do banco lista `favmed_profiles_rls`, `secure_rls_auto_enable_function` e `restore_service_role_profiles_privileges`.
- O repositório versiona somente `20261028160000_restore_service_role_profiles_privileges.sql`; os SQLs históricos não estão todos presentes na pasta de migrações. Não reaplicar nem reconstruir esses SQLs por suposição.
- A auditoria só encontrou `public.profiles`; tabelas operacionais clínicas não existem no schema `public` verificado.
- O Security Advisor reporta `auth_leaked_password_protection`: proteção contra senhas comprometidas desativada.

Consulte [SCHEMA-RECONCILIATION.md](SCHEMA-RECONCILIATION.md) para o relatório e o plano de reconciliação.

## Configuração de autenticação

Em Authentication → Sign In / Providers → Email, confirme no painel:

- Cadastro público desativado.
- Logins anônimos desativados.
- Confirmação de e-mail conforme a política aprovada.
- URLs de redirecionamento limitadas aos ambientes necessários.
- SMTP personalizado configurado e testado, sem compartilhar credenciais.

Ative a proteção contra senhas comprometidas se o recurso estiver disponível no plano/configuração. Confirme a alteração no Security Advisor; não considerar corrigido apenas por ter aberto a configuração.

## Segredos da Edge Function

A função `master-users` aceita as variáveis modernas:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS`: objeto JSON de chaves publicáveis, com a chave padrão em `default`
- `SUPABASE_SECRET_KEYS`: objeto JSON de chaves secretas, com a chave padrão em `default`

Há fallback para `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` legadas, quando fornecidas pelo ambiente. Chaves secretas nunca podem ser colocadas em variáveis `VITE_*`, no navegador ou no Git. Não registrar tokens ou segredos em logs.

## Provisionamento do Master

O Master inicial é provisionado por processo administrativo controlado. Antes de alterar contas, confirme que o UUID do perfil corresponde ao usuário correto em Authentication → Users. Não crie um segundo Master sem revisão explícita.

## Plano de validação antes de liberar módulos

1. Reconciliar o histórico de migrações com SQL confiável e schema real; não modificar migrações históricas já aplicadas.
2. Testar em ambiente isolado que as migrações são reproduzíveis.
3. Testar login do Master, leitura do próprio perfil e logout.
4. Testar listagem, convite, ativação e desativação com contas de teste.
5. Confirmar HTTP 403 para perfis não-Master em operações administrativas.
6. Testar políticas RLS usando sessões de usuários de teste distintos, inclusive tentativas de ler/alterar dados alheios.
7. Testar o comportamento de usuário inativo e o tempo de validade/revogação de sessões existentes.
8. Implementar novas tabelas operacionais em migrações incrementais, com RLS desde o início.
9. Garantir que erros e logs não exponham tokens, segredos ou dados clínicos.
10. Restringir CORS ao domínio oficial quando ele estiver definido.
11. Somente depois de CI e testes de integração aprovados, planejar implantação da aplicação e liberar módulos.

O sistema não está pronto para produção. Não usar dados reais de pacientes nem habilitar recepção, profissional, sala, fila ou atendimentos até que o schema operacional, a autorização e as políticas RLS estejam implantados e testados.
