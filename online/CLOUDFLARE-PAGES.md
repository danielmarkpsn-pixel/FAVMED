# Teste de hospedagem — Cloudflare Pages

Esta configuração é exclusiva para validar a hospedagem do FAVMED Online. Ela não substitui a Vercel, não altera `main` e não executa migrations no Supabase.

## Configuração do projeto Pages

- Repositório: `danielmarkpsn-pixel/FAVMED`
- Branch de teste: `test/cloudflare-pages`
- Diretório raiz do projeto: `online`
- Comando de build: `npm run build`
- Diretório de saída: `dist`
- Runtime: aplicação estática Vite; o Supabase continua sendo o backend.

## Variáveis de ambiente

Cadastrar no ambiente de Preview/Production do projeto de teste, usando os valores públicos já destinados ao frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Não cadastrar `service_role`, senhas, tokens administrativos ou outros segredos no frontend. Não gravar valores de ambiente neste repositório.

## Rotas e cabeçalhos

O arquivo `public/_redirects` encaminha rotas da aplicação (`/sala`, `/recepcao`, `/profissional`, `/master`) para o shell do Vite, preservando o roteamento client-side. `public/_headers` define cabeçalhos HTTP básicos de segurança.

## Integração com Supabase — etapa manual necessária para teste real

Antes de testar autenticação e operações, adicionar a origem `https://<nome-do-projeto>.pages.dev` à lista de Redirect URLs do Supabase Auth. Manter `https://favmed.vercel.app` e as demais origens atuais. Não trocar o Site URL de produção durante o teste.

A Edge Function `master-users` também valida a origem permitida por `FAVMED_ALLOWED_ORIGIN`. O ambiente atual usa uma origem exata. A aplicação em Pages poderá carregar, mas ações que chamem essa função podem ser bloqueadas até que a função seja ajustada de forma segura para aceitar a origem de teste e a origem atual simultaneamente. Não alterar esse segredo nem redeployar funções como parte deste teste sem autorização específica.

## Critérios de validação

1. Build Vite concluído.
2. Login, logout e recuperação de senha.
3. Acesso de Master, recepção e profissionais conforme perfil.
4. Cadastro nas três recepções e atualização compartilhada.
5. Painel `/sala` sem login, com apenas os dados mínimos de chamada.
6. Chamadas, repetição, início, cancelamento e conclusão nas quatro salas.
7. Áudio de chamada após interação do usuário com a página.
8. Exportação da planilha e limpeza operacional diária, primeiro com dados sintéticos.
9. Conferência de que nenhuma migration ou alteração de dados foi feita no Supabase durante o teste.

## Segurança do teste

Usar somente pacientes fictícios. Não importar dados reais. Não apontar domínio próprio para este ambiente. Manter a Vercel atual ativa até concluir todos os testes e obter aprovação expressa para qualquer troca.
