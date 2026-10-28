# Runbook de segurança pré-liberação — FAVMED Online

Status: pendências operacionais documentadas; este arquivo não altera configurações do Supabase.

## Restrições de liberação

- Não habilitar módulos clínicos nem inserir dados reais de pacientes antes de aprovar os testes de RLS.
- Não aplicar migrações ao projeto remoto de desenvolvimento até reconciliar o histórico e validar a migração em ambiente isolado.
- Não mesclar a branch `feature/favmed-online-master-login` nem alterar `main` sem autorização explícita.
- Não compartilhar chaves `service_role`/secret, senhas, tokens ou credenciais SMTP.
- A proteção nativa contra senhas comprometidas não está disponível no plano Supabase atual. Ela não é um requisito bloqueante deste projeto; não solicitar upgrade nem declarar que foi ativada.

## 1. Configurar a origem permitida da Edge Function

A função `master-users` versão 4 usa a variável `FAVMED_ALLOWED_ORIGIN`; sem ela, o padrão é `http://localhost:5173`.

1. No Supabase Dashboard do projeto FAVMED, abra **Edge Functions → Secrets**.
2. Defina `FAVMED_ALLOWED_ORIGIN` com **uma origem exata** que corresponda ao endereço usado pelo navegador, incluindo protocolo e porta, sem caminho ou barra final. Exemplo: `http://localhost:5173` para teste local ou `https://<dominio-aprovado>` após definir o domínio de produção.
3. Não use `*` e não adicione IPs ou domínios não aprovados.
4. Se a aplicação for acessada por endereços diferentes (localhost, IP da rede e domínio publicado), escolha um endereço canônico para a validação ou implemente uma lista explícita revisada; não relaxe o CORS para resolver erros.
5. Teste no navegador: a origem autorizada deve conseguir chamar a função; uma origem diferente deve receber HTTP 403. Verifique também o preflight OPTIONS.

A configuração não é considerada concluída até que a origem real seja confirmada e o teste seja realizado.

## 2. Limite de envio de convites e SMTP

A função retorna HTTP 429 (`INVITE_RATE_LIMITED`) quando o Supabase Auth limita os envios e HTTP 409 (`INVITE_EMAIL_EXISTS`) quando o e-mail já tem conta.

- Não repetir convites em sequência nem automatizar tentativas de reenvio.
- Confirmar o estado de SMTP, logs de Auth e o período de cooldown no Dashboard antes de tentar novamente.
- Um HTTP 201 significa que o pedido de convite foi aceito, não prova por si só a entrega na caixa de entrada.
- Para testar, usar um endereço controlado e apenas uma tentativa após a liberação do limite.

## 3. Testes de autorização obrigatórios

Usar somente contas e dados sintéticos. Validar cada item por meio de sessão real de cada perfil, não apenas consultas administrativas.

| Cenário | Resultado obrigatório |
|---|---|
| Sem sessão ou token inválido chama `master-users` | HTTP 401 |
| Recepção, profissional ou sala chama ação administrativa | HTTP 403 |
| Master inativo chama ação administrativa | HTTP 403 |
| Origem diferente da permitida chama a função | HTTP 403 |
| E-mail duplicado | HTTP 409, sem criar perfil duplicado |
| Limite de envio de convites | HTTP 429, sem repetição automática |
| Usuário tenta ler ou alterar perfil de outro usuário | Negado por RLS |
| Usuário inativo usa sessão já emitida para acessar dados operacionais | Negado pela autorização no banco/servidor |
| Perfil sala tenta ler CPF, dados clínicos ou prontuário | Negado |
| Usuário de um perfil tenta acessar registros fora de sua atribuição | Negado |

Os últimos cenários dependem da migração operacional e de testes de integração; ainda não podem passar porque as tabelas clínicas não existem.

## 4. Critérios de liberação

Só habilitar os módulos Recepção, Profissional e Sala de espera quando todos os itens forem verdadeiros:

- [ ] Histórico de migrações reconciliado ou baseline explicitamente revisada para instalações novas.
- [ ] Migração operacional validada em projeto de teste isolado.
- [ ] RLS habilitada e forçada em todas as tabelas expostas.
- [ ] Testes positivos e negativos aprovados para todos os perfis, incluindo usuário inativo e sessão antiga.
- [ ] Limitações do plano documentadas; controles disponíveis revisados no Security Advisor, sem exigir recursos não incluídos no plano.
- [ ] Origem CORS exata validada no navegador e em preflight.
- [ ] Convites testados sem exceder limites de Auth.
- [ ] CI aprovado para o commit final.
- [ ] Procedimento de rollback documentado.
- [ ] Nenhum dado real de paciente usado em desenvolvimento.

## Estado conhecido na última auditoria

- O schema `public` contém somente `profiles`; os módulos clínicos permanecem bloqueados.
- A proteção nativa contra senhas comprometidas não está disponível no plano atual e não bloqueia a continuidade.
- A origem CORS é limitada por padrão a `http://localhost:5173`, a menos que `FAVMED_ALLOWED_ORIGIN` seja configurada no projeto.
- A documentação não significa que qualquer configuração do Dashboard tenha sido alterada.
