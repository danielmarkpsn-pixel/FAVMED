# FAVMED Online — Plano de migração segura

## Objetivo

Evoluir o FAVMED Local para uma aplicação web online exclusiva da Clínica Favmed, preservando a versão atual e desenvolvendo tudo nesta branch. A branch `main` não deve ser alterada até revisão, testes e aprovação explícita.

## Estado atual verificado

O sistema atual é composto por páginas HTML/JavaScript e um servidor PowerShell local. O README informa que a versão de rede local não possui autenticação nem criptografia e que a fila é armazenada em arquivo JSON. Essa arquitetura não deve ser exposta diretamente à internet.

## Arquitetura proposta

- **Frontend:** interface web responsiva para Recepção, Profissional e Sala de Espera.
- **Autenticação:** Supabase Auth; não implementar senhas próprias nem armazenar senhas no banco da aplicação.
- **Banco:** Supabase PostgreSQL, com Row Level Security (RLS) habilitada e políticas testadas em todas as tabelas expostas.
- **Administração:** perfil `master` exclusivo da Clínica Favmed, provisionado de forma segura por um administrador do projeto. Não haverá cadastro público de usuários nem escolha de clínica.
- **Perfis iniciais:** `master`, `recepcao`, `profissional` e `sala`; cada perfil terá permissões mínimas necessárias.
- **Sala de espera:** disponibilizar somente nome/identificador de chamada e destino; nunca CPF, nascimento, documentos ou dados clínicos no painel público.
- **Segredos:** chaves administrativas e credenciais nunca serão incluídas no frontend ou no Git. A chave `service_role` jamais pode ser exposta ao navegador.
- **Deploy:** configurar ambiente de preview antes de produção; produção só após testes e aprovação.

## Fases de implementação

1. **Preparação (esta fase):** registrar a arquitetura, regras de segurança e critérios de aceite na branch isolada.
2. **Base de autenticação:** criar a tela de login e o fluxo de sessão usando Supabase Auth, sem cadastro público.
3. **Permissões e administração:** definir perfis, ativação/bloqueio de contas e provisionamento do primeiro Master sem permitir autoelevação.
4. **Dados online:** migrar pacientes e fila para tabelas protegidas, preservando o formato e as regras funcionais depois de documentar os dados existentes.
5. **Integração das telas:** substituir o armazenamento JSON/local por operações autenticadas; adaptar recepção, profissional e sala.
6. **Testes:** validar RLS para usuário anônimo, recepção, profissional, sala e Master; testar acesso cruzado, usuário bloqueado, sessão expirada, sincronização e exportações.
7. **Publicação:** revisar exposição de dados, configurar variáveis de ambiente e deploy de preview; não publicar dados reais no repositório.

## Regras de segurança obrigatórias

- Não copiar `fila.json`, PDFs ou registros reais de pacientes para commits, issues, logs ou artefatos públicos.
- Não expor o servidor PowerShell atual à internet.
- Não criar conta Master com senha padrão embutida no código.
- Não considerar esconder botões no frontend como controle de acesso; validar permissões no banco.
- Não conectar nem alterar projetos ou bancos externos sem autorização específica.
- Não mesclar esta branch na `main` sem validação e aprovação.

## Critérios de aceite

- Usuário sem sessão não acessa dados operacionais.
- Usuário inativo não consegue continuar acessando os módulos.
- Cada função só executa operações autorizadas no backend/banco.
- Sala de espera não recebe CPF, documentos ou dados clínicos.
- Nenhuma credencial administrativa aparece no bundle do frontend ou no Git.
- Testes automatizados e CI passam antes de solicitar merge.
