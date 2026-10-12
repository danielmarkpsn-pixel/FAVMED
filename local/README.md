# FAVMED Local — Chamador de pacientes para Windows

Aplicativo local para a recepção, com tela de sala de espera acessível por outro computador ou dispositivo na mesma rede Wi-Fi/Ethernet. Não exige Node.js nem instalar programas adicionais; usa o PowerShell que acompanha o Windows.

## Arquivos
- `index.html`: interface do chamador.
- `logo-favmed.png`: logotipo.
- `servidor-favmed.ps1`: servidor local e armazenamento compartilhado da fila.
- `INSTRUCOES-REDE-LOCAL.txt`: passo a passo de configuração, firewall e acesso à tela pública.
- `ABRIR-FAVMED.bat`: abre a versão simples por arquivo, para uso em um computador.
- `INICIAR-SERVIDOR-FAVMED.bat`: inicia o modo de rede local.

## Início rápido
1. Baixe o ZIP do branch `favmed-local-chamador-windows` e extraia tudo para uma pasta permanente no computador da recepção.
2. Leia `INSTRUCOES-REDE-LOCAL.txt` antes do primeiro uso em rede.
3. Dê dois cliques em `INICIAR-SERVIDOR-FAVMED.bat` no computador da recepção. Se o Firewall do Windows perguntar, permita acesso **somente em redes privadas**.
4. No outro computador, tablet ou TV com navegador, abra o endereço IP informado pelo servidor, acrescentando `/?painel=1`. Exemplo: `http://192.168.1.25:8080/?painel=1`.
5. Na recepção, acesse o endereço-base informado pelo servidor (sem `?painel=1`) para cadastrar e chamar pacientes.

## Aparência e recursos
- Interface clara, com branco, cinza-claro e azul-petróleo.
- Cadastro manual, chamada por voz, repetição, busca, status, remoção e exportação CSV.
- Tela pública em letras grandes, com nome do paciente chamado e consultório, atualizada pela rede local.
- Dados da fila compartilhados por um arquivo JSON no computador da recepção.

## Segurança e limitações
- O computador da recepção deve permanecer ligado, com o servidor PowerShell aberto, para a tela de rede funcionar.
- O IP pode mudar quando o roteador reinicia. Se o endereço parar de funcionar, feche e reabra o servidor e use o IP exibido.
- O firewall deve liberar TCP 8080 apenas na rede privada/confiável. Não crie regra para rede pública e não encaminhe a porta no roteador para a internet.
- Qualquer dispositivo com acesso a esse endereço na rede pode ver os nomes chamados. Use somente uma rede interna confiável e mostre apenas os dados mínimos necessários; não insira diagnóstico, CPF ou informações clínicas.
- A fila fica no arquivo `local\fila.json` quando o servidor é iniciado. Faça cópias de segurança manualmente e restrinja o acesso à pasta.
- A versão de rede não é criptografada e não possui login. Não use em Wi-Fi de visitantes nem exponha à internet.
- A versão aberta diretamente como arquivo continua disponível, mas nesse modo a tela secundária funciona apenas no mesmo navegador/computador.

Crédito: Desenvolvido por Daniel Marques via IA.
