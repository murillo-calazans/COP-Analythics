# Bot de Pendências — passo a passo

Cobra no grupo **Pendencias** quando Auxiliares (22 98139-2343) ou
Assistentes (22 98137-6625) são marcados num grupo e não respondem.
Primeira cobrança após 5 min, depois a cada 5 min, só no expediente
(7h–18h, seg–sáb). Quando o número responde, avisa "✅ respondido".

## 1. Chip e grupos
1. Chip novo, WhatsApp (pode ser Business) instalado num celular.
2. Peça pros admins adicionarem o número do bot em **todos os grupos**
   onde Auxiliares/Assistentes ficam.
3. Crie o grupo **Pendencias** com você + o bot.

## 2. VPS com a Evolution API
1. Contrate uma VPS Linux (Ubuntu, 2 GB RAM basta) e instale o Docker:
   `curl -fsSL https://get.docker.com | sh`
2. Copie esta pasta pra VPS, edite `docker-compose.yml` (IP da VPS,
   `AUTHENTICATION_API_KEY` e a senha do banco nos 2 lugares) e rode
   `docker compose up -d`.
3. Abra `http://IP_DA_VPS:8080/manager`, entre com a API key, crie a
   instância **bot-pendencias** e leia o QR Code com o celular do bot
   (WhatsApp → Aparelhos conectados).

## 3. Supabase
1. **SQL Editor** → rode o PASSO 1 de `database/patch-13-bot-pendencias.sql`.
2. **Edge Functions → New function** `bot-pendencias` → cole
   `supabase/functions/bot-pendencias/index.ts` → desligue
   **Verify JWT** → Deploy.
3. **Edge Functions → Secrets**:
   - `BOT_TOKEN` = uma senha longa inventada
   - `EVO_URL` = `http://IP_DA_VPS:8080`
   - `EVO_APIKEY` = a `AUTHENTICATION_API_KEY`
   - `EVO_INSTANCIA` = `bot-pendencias`
4. **SQL Editor** → rode o PASSO 2 do patch (descomente e troque o token).

## 4. Ligar o webhook
No manager da Evolution → instância → **Webhook**:
- URL: `https://ldpiitymhvdhemdrntlx.supabase.co/functions/v1/bot-pendencias?token=SEU_BOT_TOKEN`
- Enabled: sim · Webhook by events: não · Base64: não
- Eventos: só **MESSAGES_UPSERT**

## 5. Ativar
No grupo **Pendencias**, mande: `!pendencias`
O bot responde "✅ Este grupo agora recebe as cobranças". Pronto.

## Ajustes (SQL Editor)
```sql
-- horário / dias (0=dom ... 6=sáb) / intervalo
update bot_config set hora_inicio = 7, hora_fim = 18, dias_semana = '{1,2,3,4,5,6}', intervalo_min = 5;
-- nome que aparece no alerta
update bot_monitorados set rotulo = 'AUXILIARES' where numero = '5522981392343';
-- ver pendências abertas
select * from bot_pendencias where respondido_em is null order by mencionado_em;
```
