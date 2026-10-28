# FAVMED Online — protótipo de autenticação

Este diretório contém a aplicação online, separada do FAVMED Local. O servidor PowerShell e as páginas locais existentes não são substituídos. O produto online é exclusivo da Clínica Favmed.

## Requisitos

- Node.js LTS e npm.
- Projeto Supabase de desenvolvimento autorizado.
- Variáveis locais configuradas com URL do projeto e chave publicável.

## Executar localmente

1. Copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL do projeto e a chave publicável.
3. Dentro desta pasta (`online`), execute `npm install` e `npm run dev`.
4. Para verificar o build, execute `npm run check` e `npm run build`.

Nunca coloque chaves secret/service_role no frontend, em variáveis `VITE_*` ou no Git. Variáveis `VITE_*` são incorporadas ao código entregue ao navegador e só podem conter valores públicos.

## Estado verificado

- Login por e-mail e senha com Supabase Auth e fluxo de convite com definição de senha inicial implementado no frontend.
- Cadastro público não faz parte do fluxo da aplicação.
- A aplicação exige um registro `profiles` ativo com um dos perfis `master`, `recepcao`, `profissional` ou `sala`.
- No projeto de desenvolvimento `qzjkoyqmjueosevzhxqa`, `public.profiles` existe, tem RLS habilitada e forçada, e a política de SELECT permite que o usuário autenticado leia somente seu próprio perfil.
- A Edge Function `master-users` está ativa na versão 3. Ela valida manualmente o token Bearer com Supabase Auth e exige perfil Master ativo antes de operações administrativas.
- A configuração SMTP personalizada foi usada para enviar um convite de teste; isso não comprova, por si só, todos os fluxos de autorização nem a prontidão de produção.
- O Security Advisor reporta proteção contra senhas comprometidas desativada.

## Histórico de migrações

O histórico do banco contém três migrações (`favmed_profiles_rls`, `secure_rls_auto_enable_function` e `restore_service_role_profiles_privileges`), mas a pasta versionada `supabase/migrations` não contém atualmente os SQLs das duas primeiras. Não reaplicar nem reconstruir migrações antigas por suposição. Consulte [SCHEMA-RECONCILIATION.md](supabase/SCHEMA-RECONCILIATION.md) antes de alterar o schema.

A migração versionada `20261028160000_restore_service_role_profiles_privileges.sql` restaura privilégios de `service_role` em `public.profiles`; ela não cria tabelas operacionais.

## Função administrativa

A função `supabase/functions/master-users/index.ts` suporta `create_user` (convite por e-mail), `list_users` e `set_active` para contas não-Master. Não permite criar Masters pela interface e impede o Master de bloquear a própria conta.

A função está configurada com `verify_jwt = false` para compatibilidade com as chaves modernas. Isso desativa a validação automática do gateway: por isso, o código precisa continuar validando manualmente o token e autorizando apenas um perfil Master ativo. As variáveis modernas são `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SECRET_KEYS`; as chaves secretas permanecem apenas no ambiente da função. Há fallback para variáveis legadas do Supabase.

O CORS não usa mais curinga (`*`). Configure o segredo `FAVMED_ALLOWED_ORIGIN` na Edge Function com a origem exata da aplicação, incluindo protocolo e porta quando aplicável (por exemplo, `http://localhost:5173` no desenvolvimento). Antes da produção, substitua pelo domínio oficial; não publique com a origem de desenvolvimento. O código responde com erro claro para limites de envio de convite (HTTP 429) e e-mails já cadastrados (HTTP 409). Não fique repetindo convites após um 429: aguarde a liberação do limite e verifique SMTP/limites do Auth.

Consulte [MASTER-BOOTSTRAP.md](supabase/MASTER-BOOTSTRAP.md) e [SCHEMA-RECONCILIATION.md](supabase/SCHEMA-RECONCILIATION.md).

## Pendências obrigatórias antes de produção

- Reconciliar e tornar reproduzível o histórico de migrações.
- Criar as tabelas operacionais de forma incremental, com constraints, índices e políticas RLS desde o início.
- Testar login, logout, convite, ativação/desativação e acesso negado para perfis não-Master.
- Verificar que usuário inativo não consegue autenticar; não depender apenas da interface ou presumir que tokens emitidos anteriormente são revogados imediatamente.
- Habilitar proteção contra senhas comprometidas, se disponível no projeto, e confirmar no Security Advisor.
- Definir `FAVMED_ALLOWED_ORIGIN` para o domínio oficial na Edge Function e confirmar o preflight CORS antes da publicação.
- Verificar convites com erro 429/409 e revisar manualmente contas Auth sem perfil antes de tentar novamente; não apagar contas automaticamente sem identificar o vínculo e o histórico.
- Revisar segurança e privacidade antes de usar dados reais de pacientes.
- Configurar a Vercel somente depois de validar a integração.

O sistema continua sendo um protótipo de autenticação. O schema verificado contém apenas `public.profiles`; pacientes, fila, atendimentos, profissionais e salas ainda não estão integrados ao banco. Não liberar módulos operacionais nem usar dados reais de pacientes até concluir os testes de segurança.
