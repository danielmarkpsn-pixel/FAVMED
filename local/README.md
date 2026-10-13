# FAVMED Local — Chamador de pacientes para Windows

Aplicativo local da Clínica Favmed para recepção, sala de espera e profissionais. Compartilha a fila entre dispositivos da mesma rede local, usando o PowerShell incluído no Windows; não exige Node.js nem instalar programas adicionais.

## Arquivos principais
- `index.html`: recepção e painel público da sala de espera.
- `consultorio.html`: painel do profissional para chamar, iniciar e liberar cada serviço.
- `logo-favmed.png`: logotipo da clínica.
- `servidor-favmed.ps1`: servidor local e armazenamento compartilhado.
- `fila.json`: dados operacionais locais (criado ao iniciar o servidor).
- `INICIAR-SERVIDOR-FAVMED.bat`: inicia o servidor.
- `INSTRUCOES-REDE-LOCAL.txt`: instruções completas de configuração e uso.

## Início rápido
1. Baixe o ZIP da branch `favmed-local-chamador-windows` e extraia em uma pasta permanente.
2. Execute `INICIAR-SERVIDOR-FAVMED.bat) no computador principal.
3. Use os links exibidos na janela do servidor:
   - Recepção: `http://IP:PORTA/`
   - Sala de espera: `http://IP:PORTA/?painel=1`
   - Profissional: `http://IP:PORTA/consultorio`
4. Para acesso remoto, os dispositivos devem estar na mesma rede local. Mantenha o servidor aberto.

## Recursos incorporados do fluxo MARKYS
- Cadastro com múltiplos serviços por paciente e consultório opcional.
- Nome do paciente em letras maiúsculas, edição de nome e serviços, prioridade e busca.
- Painel profissional separado: “Chamar na sala”, “Atender”, “Cancelar chamado” e “Liberar”.
- Status por serviço; o paciente só é concluído quando todos os serviços forem liberados.
- Horário de saída, retenção de atendidos na recepção e opção para reabrir.
- Tela pública com chamada atual e próximos pacientes, sem mostrar atendimentos concluídos.
- Anúncio por voz com seleção automática/manual de voz disponível, teste e repetição.
- Exportação CSV, relatório PDF A4 vertical e backup JSON.
- Atualização automática entre recepção, painel profissional e sala de espera.
- Mantém a identidade visual da Favmed (branco, cinza-claro e azul-petróleo).

## Segurança e limitações
- O computador principal precisa ficar ligado com o servidor PowerShell aberto.
- A versão de rede usa HTTP local, sem login nem criptografia. Use somente rede interna confiável; não use Wi-Fi de visitantes nem exponha a porta à internet.
- A tela pública exibe nomes e atendimentos. Não inclua diagnósticos, CPF ou informações clínicas.
- O arquivo `local\\fila.json` contém registros operacionais; proteja a pasta e faça backups.
- A voz depende das vozes disponibilizadas pelo Chrome/Windows; voz feminina neural não é garantida.

Crédito: Desenvolvido por Daniel Marques via IA.
