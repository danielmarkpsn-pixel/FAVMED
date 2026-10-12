# FAVMED Local — Chamador de pacientes para Windows

Versão local e independente para um único computador. Não exige credenciais Quarks, Node.js, servidor, conta ou instalação de programas.

## Como usar
1. Baixe o ZIP do branch \`favmed-local-chamador-windows\` pelo GitHub.
2. Extraia a pasta em um local do computador.
3. Abra a pasta \`local\` e dê dois cliques em \`index.html\`.
4. Use Microsoft Edge ou Google Chrome atualizado.
5. Cadastre o paciente e o consultório, depois clique em **Chamar** ou **Chamar próximo**.
6. Clique em **Testar voz** para verificar o áudio. O app tenta selecionar uma voz em português do Brasil que pareça feminina, entre as vozes disponibilizadas pelo Windows/navegador. A identificação de gênero pelo nome é apenas uma estimativa; se não houver voz feminina em português instalada, o navegador pode usar outra voz disponível.
7. Para abrir uma tela exclusiva para a sala de espera, clique em **Abrir tela da sala de espera**. Se solicitado, permita a abertura da nova janela. Coloque essa janela na segunda tela/TV e pressione F11 para tela cheia. Ela mostra apenas os pacientes chamados e o consultório, atualizando automaticamente a partir da tela da recepção, no mesmo navegador e computador.

## Recursos
- Fila diária com status aguardando, chamado e atendido.
- Chamada falada em português com nome do paciente e consultório.
- Repetição da última chamada.
- Tela pública adicional para sala de espera, com nome e consultório em letras grandes e atualização automática.
- Busca, remoção, reabertura e exportação CSV.
- Persistência local no armazenamento do navegador.

## Limites importantes
- Esta versão **não se conecta ao Quarks** e não importa agenda automaticamente.
- Os dados ficam no perfil do navegador desse computador; não há sincronização nem backup automático. A tela de sala de espera foi pensada para abrir como segunda janela no mesmo computador e navegador; não é uma tela de rede para outro computador. Use **Exportar CSV** para guardar uma cópia quando necessário.
- O armazenamento do navegador não é criptografado e não deve ser tratado como prontuário. Como se trata de ambiente clínico, restrinja o acesso ao Windows e evite inserir dados clínicos sensíveis.
- Para manter o uso local, não publique a fila de pacientes nem arquivos exportados no GitHub.
- A fala depende do suporte de síntese de voz do navegador e das vozes disponíveis no Windows. Permita áudio e mantenha o volume ligado.

## Privacidade
O aplicativo não envia os dados da fila a um servidor. A informação permanece no armazenamento local do navegador até ser apagada pelo usuário ou pelo próprio navegador. Limpar os dados do navegador pode apagar a fila.
