# FAVMED Online

Aplicação online da Clínica Favmed, separada do FAVMED Local. O servidor PowerShell e as páginas locais existentes não são substituídos.

## Executar localmente

1. Copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do projeto.
3. Dentro desta pasta (`online`), execute `npm install` e `npm run dev`.
4. Valide com `npm run check` e `npm run build`.

Nunca coloque chaves secret/service_role no frontend, em variáveis `VITE_*` ou no Git. Variáveis `VITE_*` são incorporadas ao código entregue ao navegador e só podem conter valores públicos.

## Estado atual verificado

- Login por e-mail e senha com Supabase Auth, recuperação de senha, convites e definição de senha inicial.
- Cadastro público não faz parte do fluxo; a criação de contas é restrita ao Master.
- A aplicação exige um registro `profiles` ativo com um dos perfis `master`, `recepcao`, `profissional` ou `sala`.
- A Edge Function `master-users` valida manualmente o token Bearer, exige perfil Master ativo e oferece `create_user`, `list_users` e `set_active` para contas que não são Master.
- A Edge Function não usa CORS curinga. O segredo `FAVMED_ALLOWED_ORIGIN` deve conter a origem exata da aplicação; o padrão local só serve para desenvolvimento.
- A implantação de produção da Vercel foi criada a partir da `main`, commit `0488912da4964f7fa82ebc42d3129117d1a687ab`, e está em estado READY.
- A migração operacional `operational_foundation` foi aplicada ao projeto Supabase `qzjkoyqmjueosevzhxqa` em 2026-10-29. As tabelas `patients`, `professionals`, `rooms`, `patient_visits` e `visit_exams` existem com RLS habilitada e forçada.
- Um teste transacional com dados sintéticos confirmou que a recepção pode inserir e ler um paciente durante a transação; a transação foi revertida e nenhum registro de teste foi mantido.
- Testes transacionais com registros sintéticos e revertidos confirmaram: recepção consegue inserir/ler um paciente; profissional atribuído consegue ler o paciente, atendimento e exame vinculados; perfil de sala vê atendimento/exame da sala atribuída, mas não o registro pessoal do paciente; usuário inativo não consegue ler nem mesmo um paciente sintético.
- Os testes de papéis foram simulados em transações SQL, não por sessões reais de navegador com JWT emitidos para cada perfil. Ainda é necessário validar login real, fluxos completos de cadastro/fila/atendimento/exames e erros de ponta a ponta antes de usar dados reais.

## Migrações

O histórico remoto contém migrações antigas cujos SQLs iniciais não estão todos versionados no repositório. Não apagar nem reconstruir essas migrações por suposição. Consulte [SCHEMA-RECONCILIATION.md](supabase/SCHEMA-RECONCILIATION.md) antes de reconciliar instalações novas ou alterar o histórico.

- `20261028160000_restore_service_role_profiles_privileges.sql`: restaura privilégios de `service_role` em `public.profiles`.
- `20261029150000_operational_foundation.sql`: cria a base operacional, restrições, índices, políticas RLS, grants por coluna e gatilhos para atualização de timestamps e conclusão de exames.

## Segurança e integridade

- O schema operacional usa RLS habilitada e forçada nas cinco tabelas de negócio.
- Pacientes ficam visíveis para Master/recepção e para o profissional associado ao atendimento; usuários de sala não recebem acesso geral aos dados pessoais.
- Usuários de sala veem os atendimentos e exames associados à sala vinculada ao próprio perfil.
- O banco define `completed_by` e `completed_at` quando um exame passa para `realizado`; o cliente não escolhe esses valores.
- A interface cria paciente, atendimento e exames por chamadas REST separadas, não por uma transação atômica. Se uma etapa falhar, pode ser necessário reconciliar o cadastro incompleto. Esse fluxo deve ser aprimorado antes do uso operacional amplo.
- Não usar dados reais de pacientes até concluir testes de ponta a ponta para todos os perfis e revisar a segurança e privacidade.
- Nunca apagar contas Auth automaticamente para resolver erros de convite; confirme o vínculo com `profiles` antes de qualquer reparo.

Consulte também [MASTER-BOOTSTRAP.md](supabase/MASTER-BOOTSTRAP.md) e [SCHEMA-RECONCILIATION.md](supabase/SCHEMA-RECONCILIATION.md).
