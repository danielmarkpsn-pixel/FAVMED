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
- A aplicação direciona cada perfil para seu próprio módulo: `/master` (administração de contas), `/recepcao` (cadastro, fila e configuração de salas) e `/profissional` (fila e status dos atendimentos). As páginas operacionais não são renderizadas dentro do Master.
- O painel público `/sala` não exige login e é somente de leitura. Consulta a view `public_waiting_room_calls`, que retorna apenas nome abreviado, sala e horário de chamada de atendimentos em andamento. O painel atualiza automaticamente e permite ativar anúncio por voz no navegador.
- A criação de novos usuários não oferece mais o perfil de login Sala de espera; a tela pública não deve usar uma conta compartilhada. Perfis antigos de sala não concedem acesso público aos dados pessoais.
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
- `20261029195000_visit_timestamp_integrity.sql`: reforça os campos de auditoria e faz o banco controlar os horários de início/conclusão do atendimento.
- `20261029201000_public_waiting_room.sql`: cria uma view pública somente de leitura para o painel de chamadas, sem CPF, nascimento, empresa ou exames.
- `20261029202000_visit_called_status.sql`: separa o estado de chamada do início do atendimento e alimenta o painel público com o estado `chamado`.
- `20261029203000_reception_workflow_fields.sql`: adiciona convênio, função, prioridade e flags de ASO; um gatilho impede profissionais de alterar prioridade ou status do ASO.
- `20261029204000_patient_documents_storage.sql`: configura bucket privado para PDFs, com limite de 10 MB e políticas de leitura/gravação por perfil.
- `20261029205000_visit_exam_called_status.sql`: habilita chamada por exame individual e publica somente a chamada ativa, com sala e nome abreviado.
- `20261029206000_public_calls_without_exams.sql`: mantém chamadas visíveis mesmo quando um atendimento não possui exames individualizados.

## Segurança e integridade

- O schema operacional usa RLS habilitada e forçada nas cinco tabelas de negócio.
- Pacientes ficam visíveis para Master/recepção e para o profissional associado ao atendimento; usuários de sala não recebem acesso geral aos dados pessoais.
- A view pública da sala de espera expõe apenas nome abreviado, nome da sala e horário do atendimento em andamento; a role `anon` só tem SELECT na view e não recebe acesso de escrita às tabelas operacionais.
- A página `/sala` é um painel de chamadas, não uma tela de administração ou atendimento.
- O banco define `completed_by` e `completed_at` quando um exame passa para `realizado`; o cliente não escolhe esses valores.
- A interface cria paciente, atendimento e exames por chamadas REST separadas, não por uma transação atômica. Se uma etapa falhar, pode ser necessário reconciliar o cadastro incompleto. Esse fluxo deve ser aprimorado antes do uso operacional amplo.
- Não usar dados reais de pacientes até concluir testes de ponta a ponta para todos os perfis e revisar a segurança e privacidade.
- Nunca apagar contas Auth automaticamente para resolver erros de convite; confirme o vínculo com `profiles` antes de qualquer reparo.

Consulte também [MASTER-BOOTSTRAP.md](supabase/MASTER-BOOTSTRAP.md) e [SCHEMA-RECONCILIATION.md](supabase/SCHEMA-RECONCILIATION.md).
