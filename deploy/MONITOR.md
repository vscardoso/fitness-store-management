# Monitor de logs (avisa quando os erros estouram)

`deploy/monitor_logs.py` roda no VPS a cada minuto (cron), lê o `access.log` do nginx e avisa no celular quando algo estoura.
Só usa a biblioteca padrão do Python. Não mexe em nada do sistema: só lê e avisa.

## O que ele vigia (janela de 5 minutos)

| Regra | Dispara quando | Por quê |
|---|---|---|
| Erros do servidor | 5 ou mais respostas 5xx da API | o servidor falhou |
| Usuários sendo deslogados | 20 ou mais 401 em rotas que exigem login | foi assim o incidente de 10/11/2026 |
| Falha ao renovar a sessão | 4 ou mais falhas em `/auth/refresh` (401, 429 ou 5xx) | derruba o login |
| Muitos pedidos barrados | 40 ou mais 429 | o nginx está barrando gente |
| API fora do ar | `/health` falha 2 rodadas seguidas | o sistema caiu |
| Erros dentro do backend | 5 ou mais tracebacks no log do backend | exceções que não viraram 5xx |
| Disco cheio | disco do servidor com 90% ou mais | o disco está em 91% hoje |

Cada regra avisa UMA vez quando começa, lembra a cada 30 minutos enquanto continua (disco: a cada 24 h) e avisa "voltou ao
normal" depois de 10 minutos limpa. Depois de uma publicação (backend reiniciado há menos de 4 minutos) as regras de falha do
servidor ficam quietas, para a troca sem queda não gerar aviso.

## Como avisa

Configurado em `/opt/provador/monitor.env` (modo 600, uma linha `CHAVE=valor` por canal):

- `ALERT_PUSH_EMAILS=conta1@x.com,conta2@y.com`: notificação no celular, pelo app instalado (Web Push, o mesmo dos avisos de
  venda). Vai só para essas contas e só para aparelhos que já ligaram "Notificações no celular". Se o backend caiu, o monitor
  sobe um container descartável da mesma imagem só para mandar o aviso.
- `TELEGRAM_BOT_TOKEN=...` e `TELEGRAM_CHAT_ID=...` (opcionais): também manda no Telegram.
- Limites se quiser mudar: `ERR5XX_MIN`, `SESSION401_MIN`, `REFRESH_FAIL_MIN`, `TOO_MANY_MIN`, `EXCEPTIONS_MIN`, `DISK_PCT`,
  `REMIND_MIN`, `RECOVER_MIN`.

Tudo o que ele envia também fica em `/var/log/provador-monitor.log`.

## Instalar (uma vez, no VPS, como root)

    bash /opt/provador/repo/deploy/instalar_monitor.sh victorscardoso@outlook.com

Instala a tarefa do cron (sem duplicar), o giro do log e manda uma mensagem de teste. Para testar de novo:
`python3 /opt/provador/repo/deploy/monitor_logs.py --teste`. Para ver o que ele faria agora sem enviar nada:
`python3 /opt/provador/repo/deploy/monitor_logs.py --simular`. Para desligar: `crontab -e` e apagar a linha do `monitor_logs.py`.

## Testes

`backend/tests/test_monitor_logs.py` (regras, janela, lembrete e volta ao normal, silêncio depois de publicar, log trocado pelo
logrotate, canais) e `backend/tests/test_enviar_alerta.py` (o push só vai para as contas pedidas e apaga aparelho que sumiu).
