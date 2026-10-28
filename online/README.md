# FAVMED Online — protótipo de autenticação

Este diretório é uma aplicação separada do FAVMED Local. O servidor PowerShell e as páginas locais existentes não são substituídos.

## Requisitos

- Node.js LTS e npm.
- Projeto Supabase de **desenvolvimento**, autorizado pelo responsável.
- Variáveis locais configuradas com URL do projeto e chave publishable/anon.

## Executar

1. Copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores do projeto de desenvolvimento.
3. Dentro desta pasta, execute `npm install` e `npm run dev`.
4. Para verificar o build, execute `npm run build`.

Nunca coloque chaves secret/service_role no frontend, no arquivo `.env` do Vite ou no Git. Variáveis com prefixo `VITE_` são incorporadas ao código entregue ao navegador; só podem conter valores públicos.

## O que está implementado

- Interface responsiva de login por e-mail e senha usando Supabase Auth.
- Não existe cadastro público.
- Após autenticar, a aplicação exige um registro `profiles` ativo com um dos perfis `master`, `recepcao`, `profissional` ou `sala`.
- Se o perfil não existir, estiver inativo ou houver erro ao consultar o perfil, a sessão é encerrada.
- A página não exibe dados de pacientes.

## O que ainda NÃO está pronto

- O banco ainda não tem, por esta entrega, migrações para `profiles`, usuários, fila ou pacientes.
- Não há tela de criação/bloqueio de contas Master.
- A consulta do perfil no frontend é apenas um gate de interface; não substitui RLS ou validação no servidor.
- Não há módulos da recepção, profissional ou sala integrados ao banco.
- Não foi conectado nem modificado nenhum projeto Supabase externo.

## Rascunho de banco

O arquivo `supabase/schema-draft.sql` é apenas uma proposta para revisão. Ele cria a tabela `profiles` com RLS habilitada e permite que cada usuário autenticado leia somente o próprio perfil. Clientes do navegador não recebem permissões de inserir, alterar ou excluir perfis. **Não execute esse SQL em produção sem revisão e testes.** Ele ainda não é uma migração oficial aplicada e não foi executado em nenhum projeto Supabase.

## Função administrativa em desenvolvimento

Consulte `supabase/MASTER-BOOTSTRAP.md` para o procedimento manual e controlado de provisionamento do primeiro Master. Foi adicionada a função `supabase/functions/master-users/index.ts`. Ela valida o token com Supabase Auth e confere no banco se o chamador tem perfil `master` ativo antes de convidar um usuário por e-mail (`create_user`), listar contas (`list_users`) ou ativar/bloquear um perfil comum (`set_active`). Ao bloquear, também aplica banimento de longa duração no Supabase Auth para impedir novos logins e renovação de sessão; ao reativar, remove esse banimento. Ela não permite criar novos Masters pela interface e impede o Master de bloquear a própria conta. A chave `SUPABASE_SERVICE_ROLE_KEY` é usada somente no ambiente da Edge Function.

**A função ainda não foi implantada nem testada contra um projeto Supabase.** O rascunho SQL também não foi aplicado. Antes de usar, revisar o código, adicionar testes de autorização e abuso, configurar os segredos e o SMTP/redirecionamento de convites no ambiente de desenvolvimento e validar com contas de teste. O banimento do Auth não invalida instantaneamente JWTs de acesso já emitidos: as futuras tabelas operacionais devem validar `profiles.active` em todas as políticas RLS, e operações sensíveis no servidor devem revalidar a autorização. O primeiro Master deverá ser provisionado por um processo administrativo seguro; jamais por uma conta pública que possa atribuir a si própria o perfil Master.
