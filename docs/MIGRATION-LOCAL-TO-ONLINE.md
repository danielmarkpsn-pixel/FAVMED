# FAVMED — auditoria para migração preservando a interface local

Data da auditoria: 2026-10-30

## Referência oficial e proteção

- Repositório: `danielmarkpsn-pixel/FAVMED`.
- Base oficial: `main`, commit `802958ad4cb3e913a3c076235c97f2af0ddddea5`.
- Trabalho isolado: `migration/preserve-local-ui-online`, criada diretamente da `main`.
- A `main`, o projeto Supabase remoto e a implantação de produção não foram alterados nesta etapa.
- A branch anterior `feature/recepcao-layout-chamadas-sala` não é a base desta migração; suas alterações visuais recentes não foram incorporadas.

## Inventário da aplicação local

A versão local não é apenas um protótipo: contém a interface e os fluxos operacionais completos.

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Recepção, cadastro e edição de pacientes, fila, chamadas para Recepção 1/2/3, prioridade, ASO, salas/exames, ficha, exportações, tela pública, áudio/voz e apresentação de mídia |
| `consultorio.html` | Painel do profissional, filtro por sala/serviço, leitura da fila, atualização de estados e exportação |
| `servidor-favmed.ps1` | Servidor HTTP local, persistência JSON, arquivos de mídia e documentos, rotas de recepção, consultório e sala |
| `fila.json` | Persistência local da fila |
| `midia.json`, `midia-sala/`, `chamador.mp3`, `audios/` | Configuração e recursos da sala de espera |
| `logo-favmed.png` | Identidade visual |

### Contratos locais encontrados

- `GET /api/state` e `POST /api/state`: carregam e salvam a fila inteira como array JSON.
- `GET /api/slideshow`, `POST /api/slideshow/upload` e `GET /slideshow/:arquivo`: listagem, upload e entrega de mídia.
- `GET /api/media` e `POST /api/media`: configuração da mídia.
- `POST /api/document` e `GET /documentos/:arquivo`: armazenamento e entrega de PDF.
- `/`, `/sala`, `/sala-espera` e `/consultorio`: páginas da aplicação.

A interface local consulta `/api/state` periodicamente (intervalo aproximado de 1,8 s) e o painel profissional também lê e grava esse mesmo estado. O modo sem servidor usa `localStorage`, portanto não é adequado para sincronização entre dispositivos.

## Estado online encontrado na main

A pasta `online/` contém uma segunda interface, com autenticação Supabase e módulos próprios, além de tabelas relacionais para pacientes, atendimentos, salas e exames. A implementação online tem recursos de autenticação, convites Master, RLS, storage privado para documentos e view pública de chamadas.

A implementação online atual não reaproveita a marcação/estrutura visual das páginas locais: `online/src/main.js` monta uma aplicação independente e suas próprias telas. Assim, as duas interfaces evoluíram separadamente, o que explica diferenças de layout e de comportamento.

## Decisão técnica da migração

Preservar `index.html` e `consultorio.html` como fonte de verdade visual e funcional. Não reescrever os módulos nem substituir a interface por telas equivalentes novas.

A migração deve trocar os adaptadores de persistência e identidade, não os fluxos de trabalho:

1. Extrair o JavaScript e estilos das páginas locais para módulos reutilizáveis sem mudar o HTML renderizado.
2. Criar uma camada de dados com contrato compatível com o formato de paciente usado pela fila local.
3. Implementar o adaptador online com Supabase Auth, PostgreSQL e Storage privado; manter um adaptador local para execução e regressão.
4. Substituir a gravação do array inteiro por operações específicas e seguras (cadastro, edição, chamada, prioridade, ASO, transição de status, exclusão e restauração). Evitar sobrescrever alterações concorrentes de outros dispositivos.
5. Fazer o painel profissional consumir o mesmo repositório de dados online, com permissões próprias e sincronização em tempo real ou atualização incremental.
6. Manter a sala de espera como leitura pública de dados mínimos, usando exclusivamente a view segura, sem CPF, documentos, dados clínicos ou nome completo quando não necessário.
7. Migrar mídia e PDFs para Supabase Storage privado, com limites, validação de tipo/tamanho e URLs assinadas. Não expor o diretório local nem o servidor PowerShell na internet.
8. Manter rotas `/`, `/sala` e `/consultorio` compatíveis com os endereços usados na operação.

## Mapeamento inicial de dados

| Modelo local | Modelo online atual | Trabalho necessário |
|---|---|---|
| Paciente em `fila.json` | `patients` | Preservar CPF, nascimento, convênio, função e documento com isolamento por perfil |
| Estado do atendimento dentro do objeto paciente | `patient_visits` | Mapear status, data, horários, empresa, prioridade, ASO e destino |
| `rooms` / `services` / `serviceStates` | `rooms` + `visit_exams` | Preservar múltiplas salas, serviços e estados independentes por exame |
| `receptionCall` | campos/eventos de chamada da visita | Confirmar persistência e exibição das três recepções |
| PDF local | bucket privado `patient-documents` | Migrar upload/download para Storage e URLs assinadas |
| Mídia da sala | Storage + metadados | Projetar antes de implementar; não armazenar binários em tabelas |
| Configuração de mídia | configuração por clínica/ambiente | Definir escopo e permissões |

## Riscos e lacunas a resolver antes de ativar a nova interface

- A gravação local substitui o array completo; online, essa abordagem causa perda de atualizações concorrentes. A camada online deve gravar operações por registro.
- O esquema atual divide dados entre paciente, visita e exame. A conversão precisa preservar histórico e todos os estados individuais, sem assumir que cada paciente tem apenas uma sala ou exame.
- O README online informa que o cadastro de paciente, visita e exames ocorre em várias chamadas não atômicas. O novo fluxo deve usar RPC/transação ou estratégia compensatória para não deixar cadastros incompletos.
- As permissões e políticas RLS existentes precisam ser testadas com sessões reais de cada perfil antes de habilitar a interface migrada.
- A view pública precisa suportar o contrato da sala local, mas retornar apenas dados mínimos e chamadas ativas.
- O upload de mídia local aceita até 500 MB; não transportar esse limite diretamente para uma requisição Vercel. Definir upload direto ao Storage e limites aprovados por tipo de arquivo.
- O projeto remoto possui histórico de migrações parcialmente não versionado. Não resetar nem reconstruir o histórico por suposição.

## Próximas entregas nesta branch

1. Criar testes de caracterização dos fluxos locais e registrar o formato completo dos objetos da fila.
2. Definir e testar o mapeamento bidirecional entre objeto local e modelo relacional online.
3. Criar a camada de repositório/adaptadores sem alterar o HTML visual.
4. Integrar primeiro a recepção, depois o painel profissional e por último a sala pública/mídia.
5. Executar testes automatizados e regressão funcional com dados sintéticos.
6. Solicitar revisão antes de qualquer merge, migração remota ou publicação.

## Restrições

- Não alterar `main`.
- Não aplicar SQL ao Supabase remoto nem modificar dados/configurações externas.
- Não publicar em produção.
- Não usar dados reais de pacientes nos testes.
- Não expor credenciais administrativas ou arquivos clínicos.


## Incompatibilidade funcional crítica identificada

O painel local do profissional não trabalha apenas com status global da visita ou status por exame. Ele mantém `serviceStates[serviço]` para cada serviço/sala do paciente, com estados próprios `Aguardando`, `Chamado`, `Atendendo` e `Liberado`. O profissional seleciona um serviço (RX, Coleta/laboratório, Audiometria, Exames complementares ou ASO) e altera somente o estado daquele serviço.

Já o esquema online atual possui:
- um único `patient_visits.status` para a visita;
- vários `visit_exams.status` por exame individual;
- `rooms` para cadastro e atribuição.

Não existe atualmente uma tabela que represente o estado independente de cada serviço/sala dentro da mesma visita. Tratar cada exame como se fosse um serviço ou usar somente `patient_visits.status` muda o fluxo original e pode fazer uma chamada/conclusão interferir nas outras salas.

**Decisão necessária antes de implementar a camada de dados:** adicionar, em branch e após revisão, uma entidade de fluxo por sala/serviço (por exemplo `visit_room_workflows`) ligada a `patient_visits` e `rooms`, com estado, rótulo da chamada, timestamps e ordem. Os exames continuam em `visit_exams`, associados à sala correspondente. O status geral da visita será derivado dos fluxos por sala, seguindo exatamente a regra local: só marcar atendido quando todos os serviços estiverem liberados.

A chamada de Recepção 1/2/3 também é um fluxo separado da chamada para sala de exame e precisa de campos/eventos próprios, sem reutilizar indevidamente o status de um exame.

Essa estrutura evita uma conversão superficial que pareça funcionar na recepção, mas altere a operação do painel profissional.


## Implementação realizada na branch (2026-10-30)

- Criada a migração aditiva `20261030150000_local_room_workflow_compatibility.sql`.
- Criada a tabela `visit_room_workflows`, com estado independente por atendimento/sala, timestamps, histórico de chamada e RLS para Master, recepção, profissional e conta de sala.
- Chamadas de Recepção 1/2/3 foram separadas dos estados de exames e salas; a recepção não precisa mais alterar `visit_exams` para chamar um paciente.
- A view pública de chamadas agora agrega chamadas das estações de recepção e dos fluxos por sala, mantendo apenas nome abreviado e destino.
- A política de leitura das salas considera todas as salas selecionadas, não somente a primeira.
- A fila do profissional mantém o comportamento local compartilhado para atendimentos sem profissional atribuído; atendimentos atribuídos a outro profissional permanecem restritos.
- Criada a RPC `create_local_compatible_visit` como `SECURITY INVOKER` para inserir paciente, visita, fluxos e exames em uma única transação, respeitando RLS.
- Criado `online/src/local-compat.js` para conversão nos dois sentidos e testes sintéticos em `online/scripts/local-compat.test.mjs`.
- A tela online passou a criar e atualizar fluxos por sala, atualizar a fila automaticamente a cada 5 segundos e incluir os fluxos no backup JSON.
- O cadastro online agora aceita vários tipos de atendimento e exige CPF, nascimento, convênio, função, sala, tipo de atendimento e ao menos um exame por sala selecionada.

## Verificação desta etapa

- GitHub Actions: execução `41070253090` concluída com sucesso (checagem de sintaxe, testes do adaptador, guardrails de segurança, verificação da Edge Function e build Vite).
- `main` continua no commit `802958ad4cb3e913a3c076235c97f2af0ddddea5`.
- Branch de migração no commit `796e0c25283bedc3082914ffd1c97104eaf7a34b`.
- A integração Vercel automática reportou limite de deploy de preview por 24 horas; não é falha do build do GitHub Actions.
- A migração SQL ainda **não foi aplicada** a nenhum projeto Supabase. Portanto, a validação real de RLS, RPC, Storage e sincronização entre sessões depende de um projeto de teste isolado.

## Ainda não concluído

A interface online ainda contém a aplicação visual própria. A migração fiel do HTML/CSS e dos fluxos completos de `index.html` e `consultorio.html` para a autenticação online é a próxima etapa. Não declarar a migração integral concluída até que essas páginas originais estejam conectadas aos adaptadores e aprovadas em testes funcionais.
