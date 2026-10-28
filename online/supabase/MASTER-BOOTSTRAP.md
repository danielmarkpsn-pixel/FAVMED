# Provisionar o primeiro Master do FAVMED Online

Este procedimento é manual e deve ser realizado apenas por um responsável autorizado no projeto Supabase de **desenvolvimento**. Não existe senha padrão e o Master não pode ser criado pela interface pública.

## Pré-requisitos

1. Revisar `schema-draft.sql` e aplicar o schema apenas depois da aprovação técnica.
2. No Supabase Auth, configurar o provedor de e-mail, SMTP e a URL de redirecionamento de desenvolvimento.
3. Criar manualmente o primeiro usuário em **Authentication → Users** usando o e-mail institucional controlado pelo responsável. Concluir a verificação de e-mail conforme a política configurada.
4. Copiar o UUID exato desse usuário da tela de Authentication.

## Criar o perfil Master

No SQL Editor do projeto de desenvolvimento, executar o comando abaixo substituindo os valores de exemplo. Não colocar senha, token, chave secreta ou dados de pacientes neste SQL.

```sql
insert into public.profiles (id, display_name, role, active)
values (
  'SUBSTITUA-PELO-UUID-REAL-DO-USUARIO'::uuid,
  'Administrador Favmed',
  'master',
  true
);
```

Verifique que o UUID corresponde exatamente ao usuário Auth criado e que existe apenas o Master autorizado. Não execute novamente sem conferir se o perfil já existe.

## Antes de disponibilizar

- Fazer primeiro em projeto de desenvolvimento, nunca diretamente em produção.
- Confirmar que `public.profiles` tem RLS habilitada e que usuário autenticado só consegue ler o próprio perfil.
- Implantar a Edge Function `master-users` e configurar os segredos do lado do servidor: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
- Nunca usar `SUPABASE_SERVICE_ROLE_KEY` em variáveis `VITE_*`, no navegador ou no Git.
- Testar com usuários de cada perfil, e verificar que recepção/profissional/sala recebem HTTP 403 ao chamar operações administrativas.
- Testar que um usuário bloqueado não consegue iniciar nova sessão. Cada módulo de dados futuros também precisa de políticas RLS que verifiquem o estado ativo do usuário; esconder telas no frontend não é autorização.
- Confirmar que o convite de novos usuários chega e o link retorna ao endereço autorizado do app.

**Estado:** instruções para revisão. Nenhuma migração foi aplicada, nenhum usuário foi criado e nenhum projeto Supabase foi conectado nesta etapa.
