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

## Próxima etapa

Preparar e revisar a migração SQL de perfis e permissões, com RLS testada. O primeiro Master deverá ser provisionado por um processo administrativo seguro; jamais por uma conta pública que possa atribuir a si própria o perfil Master.
