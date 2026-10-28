# Provisionamento e segurança do FAVMED Online

Este documento descreve o estado atual do ambiente de desenvolvimento. O sistema online é exclusivo da Clínica Favmed. Não crie usuários públicos: a gestão de contas deve ser feita pelo Master.

## Estado atual verificado

- Projeto Supabase de desenvolvimento: `qzjkoyqmjueosevzhxqa`.
- A tabela `public.profiles` existe com RLS habilitada e acesso de leitura restrito ao próprio perfil.
- O perfil Master foi criado manualmente e está ativo.
- A Edge Function `master-users` está ativa na versão 2.
- A função está implantada com `verify_jwt = false` porque o gateway JWT legado não valida automaticamente as chaves modernas. Isso **não** significa que os pedidos são aceitos sem autenticação: o código da função valida o token Bearer com Supabase Auth e exige um perfil Master ativo antes das operações administrativas.
- O CI do GitHub passou no commit `0e46bbd2f1d702b19bcf425f5f000f4ce89d12cf`. O teste de integração real com login e convite ainda precisa ser executado.

## Configuração de autenticação

No Supabase, em Authentication → Sign In / Providers → Email:

- Manter o cadastro público desativado.
- Manter logins anônimos desativados.
- Manter vinculação manual desativada, salvo necessidade futura aprovada.
- A confirmação de e-mail deve seguir a política definida para o ambiente e o fluxo de convite deve ser testado.

O Security Advisor atualmente alerta que a proteção contra senhas comprometidas está desativada. Consulte a [documentação de segurança de senhas do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) e verifique a disponibilidade do recurso no plano do projeto. Não considere essa proteção ativa até que o painel e o Advisor confirmem.

## Segredos da Edge Function

A função `master-users` aceita as variáveis modernas do Supabase:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS`: objeto JSON de chaves publicáveis, com a chave padrão em `default`
- `SUPABASE_SECRET_KEYS`: objeto JSON de chaves secretas, com a chave padrão em `default`

Há fallback para `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` legadas, quando fornecidas pelo ambiente. Preferir as variáveis modernas. Chaves secretas nunca podem ser colocadas em variáveis `VITE_*`, no navegador ou no Git. A chave publicável pode ser usada no frontend; a autorização continua dependendo das políticas RLS e da validação no servidor.

## Provisionamento inicial

O primeiro Master é provisionado manualmente por uma pessoa autorizada no Supabase de desenvolvimento. Nunca coloque senha, token ou chave secreta em SQL, código ou commits. Confirme que o UUID do perfil corresponde ao usuário correto em Authentication → Users e não crie um segundo Master sem revisão explícita.

## Antes de disponibilizar o sistema

1. Configurar localmente `online/.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Não versionar esse arquivo.
2. Executar o frontend localmente e testar login do Master, leitura do próprio perfil e logout.
3. Testar a função `master-users`: listar usuários, convidar um usuário de teste e ativar/desativar esse usuário.
4. Confirmar que perfis `recepcao`, `profissional` e `sala` recebem HTTP 403 ao tentar operações administrativas.
5. Verificar logs da função e garantir que erros não exponham tokens, segredos ou dados clínicos.
6. Confirmar que usuário inativo não consegue autenticar e que futuras tabelas clínicas terão políticas RLS apropriadas. Não depender apenas de controles visuais no frontend.
7. Restringir CORS ao domínio oficial do aplicativo quando ele estiver definido.
8. Só depois da validação, configurar o projeto Vercel e seus ambientes.

O sistema ainda não está pronto para produção: os módulos operacionais clínicos e os testes de integração ponta a ponta permanecem pendentes.
