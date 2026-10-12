# Configuração local — Clínica Favmed - Medicina Ocupacional

Este guia prepara um computador Windows como servidor da clínica, acessível somente pela rede local. O FAVMED atual é um serviço de integração MCP/API; ele não é, por si só, um sistema de telas de recepção ou prontuário.

## 1. Antes de começar

- Escolha um computador da clínica que permaneça ligado durante o expediente.
- Conecte esse computador e os demais dispositivos à mesma rede interna confiável.
- Combine com o responsável de TI um endereço IP reservado para o servidor (reserva DHCP no roteador).
- Confirme que você tem autorização administrativa para instalar Node.js LTS e configurar o Firewall do Windows.
- Não use uma rede Wi-Fi pública ou rede de convidados para este serviço.

## 2. Instalar e baixar

1. Instale uma versão LTS atual do Node.js, compatível com Node.js 20 ou superior, usando o instalador oficial: https://nodejs.org/
2. Baixe o ZIP da branch `correcao-seguranca-2.1` pelo GitHub ou use Git se já estiver disponível.
3. Extraia o projeto para uma pasta local, por exemplo `C:\Favmed\FAVMED`.
4. Abra o PowerShell nessa pasta e execute:

```powershell
node --version
npm --version
npm install
```

Se a clínica não permitir instalar programas, peça ao responsável de TI que faça essa etapa. Não tente contornar as políticas do computador.

## 3. Criar o arquivo privado .env

1. Copie `.env.example` para um arquivo chamado `.env` na pasta principal do projeto.
2. Gere um token privado forte no PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

3. Coloque o resultado em `MCP_AUTH_TOKEN=` no arquivo `.env`.
4. Deixe as credenciais Quarks vazias até obtê-las do administrador autorizado da conta ou do suporte oficial.
5. Nunca envie o arquivo `.env` pelo chat, e-mail sem proteção ou GitHub. O `.gitignore` já exclui esse arquivo, mas confirme que ele não aparece entre os arquivos preparados para commit.

O token MCP é uma senha de acesso criada pela clínica. Ele **não** substitui as credenciais da API Quarks.

## 4. Obter credenciais da Quarks

As credenciais da API não são necessariamente as mesmas do login normal no QuarkClinic. Solicite acesso de integração à API externa ao administrador da conta ou aos canais de suporte oficiais. A central de ajuda do QuarkClinic informa suporte pelo chat dentro do próprio sistema e WhatsApp; os termos de uso também listam os e-mails `cs@quark.tec.br` e `quarkclinic@quark.tec.br`.

- Central de perguntas frequentes: https://quark.tec.br/clinic/perguntas/
- Base de conhecimento do QuarkClinic: https://quarktec.atlassian.net/wiki/spaces/BCCLINIC/overview
- Site oficial da Quark Tecnologia: https://quark.tec.br/

Peça ao administrador ou suporte:

- confirmação de que a conta possui acesso à API externa de clínica;
- URL/base da API aplicável à conta;
- token de API;
- chave e chave secreta adicionais, se forem exigidas;
- permissões concedidas a cada credencial;
- ambiente de testes, se disponível, e instruções de rotação/revogação.

Solicite credenciais individuais ou de integração com privilégios mínimos, não a senha pessoal de um funcionário. Não envie credenciais aqui e não as coloque em arquivos públicos. Preencha `QUARKS_API_TOKEN`, `QUARKS_CHAVE_KEY` e `QUARKS_SECRET_KEY` apenas no `.env` local, conforme orientação oficial. Se o fornecedor não reconhecer algum desses nomes, confirme com ele o mecanismo de autenticação correto antes de prosseguir.

### Mensagem pronta para enviar ao suporte

> Olá! Somos usuários do QuarkClinic e estamos configurando uma integração interna chamada Clínica Favmed - Medicina Ocupacional. Precisamos confirmar se nossa conta tem acesso autorizado à API externa de clínica e solicitar a documentação atual, URL/base correta, método de autenticação, credenciais de integração e permissões mínimas para consultar agendas e agendamentos. Também gostaríamos de saber se existe ambiente de testes e qual o procedimento de rotação/revogação das chaves. Não precisamos compartilhar a senha de um usuário; queremos credenciais próprias para integração. Obrigado.

## 5. Iniciar e testar no próprio computador

Com o `.env` preenchido com `MCP_AUTH_TOKEN`, execute:

```powershell
npm start
```

Em outro terminal, teste o estado do serviço:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

A rota de saúde apenas indica se o servidor está ativo; ela não prova que a API Quarks está conectada. Não considere a integração pronta até testar uma chamada autorizada com dados fictícios ou de teste.

## 6. Permitir acesso pela rede local

O servidor Express escuta na porta 3000. Antes de liberar a porta:

1. Confirme com TI que o perfil da rede no Windows é **Privada**, apenas se essa for realmente a rede interna confiável da clínica.
2. No Firewall do Windows, crie uma regra de entrada TCP para a porta 3000 limitada ao perfil **Privado** e ao intervalo IP da rede interna da clínica.
3. Não encaminhe a porta 3000 no roteador para a internet.
4. Não permita acesso a partir de redes Wi-Fi de visitantes.
5. Descubra o IPv4 do servidor com `ipconfig`; os outros computadores podem verificar `http://IP-DO-SERVIDOR:3000/health`.

O endereço de saúde é público dentro da rede para facilitar o teste. Todas as rotas `/mcp` exigem `Authorization: Bearer SEU_TOKEN`. Configure o cliente MCP para enviar esse cabeçalho; não coloque o token na URL. Se o cliente MCP não suportar autenticação por cabeçalho, não desative a proteção: confirme uma forma compatível de autenticação antes de usá-lo.

## 7. Operação segura

- Mantenha Windows e Node.js atualizados.
- Use uma conta Windows com permissões limitadas para executar o serviço.
- Proteja a pasta do projeto e o arquivo `.env` com permissões de acesso restritas.
- Não registre nem compartilhe dados de pacientes em logs ou capturas de tela.
- Faça cópias de segurança protegidas e teste a restauração.
- Se um token for exposto, revogue/rotacione-o imediatamente.
- Antes do uso real, teste leitura, criação, alteração e cancelamento de agendamentos com dados de teste e confirme as permissões com a clínica e a Quarks.

## 8. Limitações atuais

- Este repositório fornece o backend MCP, não uma interface gráfica completa para recepção.
- A disponibilidade da API, os campos necessários e as permissões dependem da conta Quarks.
- A autenticação MCP desta versão usa um token compartilhado único. Restrinja a distribuição e planeje rotação do token.
- A configuração descrita não substitui avaliação de segurança, privacidade e conformidade pela clínica.
