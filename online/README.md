# FAVMED Online — protótipo de autenticação

Este diretório contém a aplicação online, separada do FAVMED Local. O servidor PowerShell e as páginas locais existentes não são substituídos. O produto online é exclusivo da Clínica Favmed.

## Requisitos

- Node.js LTS e npm.
- Projeto Supabase de desenvolvimento autorizado.
- Variáveis locais configuradas com URL do projeto e chave publicável.

## Executar localmente

1. Copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL e a chave publicável do projeto de desenvolvimento.
3. Dentro desta pasta (`online`), execute `npm install` e `npm run dev`.
4. Para verificar o build, execute `npm run build`.

Nunca coloque chaves secret/service_role no frontend, em variáveis `VITE_*` ou no Git. Variáveis `VITE_*` são incorporadas ao código entregue ao navegador e só podem conter valores públicos.

## Implementado e verificado

- Interface responsiva de login por e-mail e senha usando Supabase Auth.
- Cadastro público não faz parte do fluxo da aplicação.
- A aplicação exige um registro `profiles` ativo com um dos perfis `master`, `recepcao`, `profissional` ou `sala`.
- A tabela `public.profiles` foi criada no projeto Supabase de desenvolvimento `qzjkoyqmjueosevzhxqa`, com RLS habilitada e leitura restrita ao próprio perfil.
- O perfil Master foi criado manualmente e está ativo.
- A Edge Function `master-users` está ativa na versão 2. Ela valida o token Bearer por meio do Supabase Auth e exige um perfil Master ativo antes de operações administrativas.
- O CI passou no commit `0e46bbd2f1d702b19bcf425f5f000f4ce89d12cf`.

O CI verifica código/build, mas não substitui o teste real de login, convite e autorização. Esses testes ponta a ponta ainda estão pendentes.

## Função administrativa

A função `supabase/functions/master-users/index.ts` suporta `create_user` (convite por e-mail), `list_users` e `set_active` para contas não-Master. Não permite criar Masters pela interface e impede o Master de bloquear a própria conta.

A função está configurada com `verify_jwt = false` para compatibilidade com as chaves modernas. Isso desativa apenas a validação automática do gateway: o código valida manualmente o token com Supabase Auth e autoriza apenas um perfil Master ativo. As variáveis modernas são `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SECRET_KEYS`; as chaves secretas permanecem apenas no ambiente da função. Há fallback para variáveis legadas do Supabase.

Consulte [MASTER-BOOTSTRAP.md](supabase/MASTER-BOOTSTRAP.md) para detalhes de provisionamento, configuração de autenticação e próximos testes.

## Pendências antes de produção

- Testar login do Master no navegador local.
- Testar listagem, convite, ativação e bloqueio com contas de teste.
- Confirmar que usuários não-Master recebem HTTP 403 ao tentar operações administrativas.
- Validar SMTP e URLs de redirecionamento dos convites.
- Verificar o bloqueio de novas sessões para contas inativas; tokens de acesso já emitidos podem continuar válidos até expirar.
- Implementar políticas RLS que verifiquem o estado ativo em todas as futuras tabelas clínicas.
- Restringir CORS ao domínio oficial quando estiver definido.
- Revisar segurança e privacidade antes de usar dados reais de pacientes.
- Configurar a Vercel somente depois de validar a integração.

O sistema ainda é um protótipo de autenticação: os módulos operacionais de recepção, profissional, sala, fila e pacientes ainda não estão integrados ao banco.
