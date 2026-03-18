/**
 * Bot WhatsApp — Fitness Store
 * 
 * Usa Baileys (@whiskeysockets/baileys) para conectar ao WhatsApp Web.
 * Para cada mensagem recebida, chama o webhook FastAPI e envia a resposta.
 * 
 * Funcionamento:
 *   1. Na primeira execução: mostra QR code no terminal → escaneie com WhatsApp
 *   2. Autenticação é salva em ./auth_info → QR não precisa ser reescaneado
 *   3. Mensagens recebidas → POST /webhooks/whatsapp → resposta → enviada ao cliente
 * 
 * Como rodar:
 *   cp .env.example .env
 *   npm install
 *   npm start
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import axios from "axios";
import express from "express";
import qrcode from "qrcode-terminal";
import pino from "pino";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuração ────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const BOT_TOKEN   = process.env.BOT_TOKEN   || "";
const AUTH_FOLDER = process.env.AUTH_FOLDER || join(__dirname, "auth_info");
const SEND_PORT   = parseInt(process.env.SEND_PORT || "3000", 10);

// Criar pasta de auth se não existir
if (!existsSync(AUTH_FOLDER)) mkdirSync(AUTH_FOLDER, { recursive: true });

// Logger silencioso (apenas erros no console)
const logger = pino({ level: "silent" });

// Estado de sessão por número (controla o "menu" atual de cada cliente)
// { "5511999999999": "awaiting_product_search" }
const sessionState = new Map();

// ── Chamar backend ───────────────────────────────────────────────────────────
/**
 * Envia mensagem ao webhook FastAPI e retorna a resposta.
 * @returns {{ reply: string, next_state?: string } | null}
 */
async function callWebhook(fromNumber, body, state) {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/webhooks/whatsapp`,
      {
        from_number: fromNumber,
        body,
        message_type: "text",
        session_state: state || null,
      },
      {
        headers: {
          "Content-Type": "application/json",
          ...(BOT_TOKEN ? { "X-Bot-Token": BOT_TOKEN } : {}),
        },
        timeout: 15000,
      }
    );
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    console.error(`[Webhook] Erro ${status}: ${detail || err.message}`);
    return null;
  }
}

// ── Inicializar bot ──────────────────────────────────────────────────────────
async function startBot() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  console.log("\n===========================================");
  console.log("  FITNESS STORE — BOT WHATSAPP");
  console.log(`  Backend: ${BACKEND_URL}`);
  console.log("===========================================\n");

  const sock = makeWASocket({
    version,
    logger,
    auth: authState,
    printQRInTerminal: false, // Vamos imprimir manualmente
    browser: ["Fitness Store Bot", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  // ── QR Code ──────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n(O QR expira em ~60s. Se expirar, aguarde o próximo)\n");
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      if (reason === DisconnectReason.loggedOut) {
        console.error("🚫 Deslogado do WhatsApp. Delete a pasta auth_info e reinicie.");
        process.exit(1);
      }

      if (shouldReconnect) {
        console.log(`🔄 Reconectando em 5s... (motivo: ${reason})`);
        setTimeout(startBot, 5000);
      }
    }

    if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!\n");
      console.log("   Aguardando mensagens...");
      console.log("   Pressione Ctrl+C para encerrar.\n");
    }
  });

  // ── Salvar credenciais ────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ── Processar mensagens ───────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Ignorar mensagens próprias, status e grupos
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;
      if (msg.key.remoteJid.endsWith("@g.us")) continue; // Grupos

      const from = msg.key.remoteJid.replace("@s.whatsapp.net", "");
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      if (!body.trim()) continue;

      console.log(`📩 [${from}] ${body.substring(0, 80)}`);

      // Recuperar estado da sessão
      const currentState = sessionState.get(from) || "idle";

      // Chamar webhook backend
      const response = await callWebhook(from, body, currentState);

      if (!response) {
        // Fallback se backend estiver fora
        await sock.sendMessage(msg.key.remoteJid, {
          text: "😕 Sistema temporariamente indisponível. Tente novamente em breve.",
        });
        continue;
      }

      // Atualizar estado da sessão
      if (response.next_state) {
        sessionState.set(from, response.next_state);
      } else {
        sessionState.delete(from);
      }

      // Enviar resposta
      if (response.reply) {
        await sock.sendMessage(msg.key.remoteJid, { text: response.reply });
        console.log(`📤 [${from}] → ${response.reply.substring(0, 60)}...`);
      }

      // Se transferindo para vendedora, log especial
      if (response.next_state === "transfer") {
        console.log(`\n⚠️  ATENÇÃO: Cliente ${from} quer falar com vendedora!\n`);
      }
    }
  });

  return sock;
}

// ── Servidor HTTP para envio proativo ────────────────────────────────────────
// Expõe POST /send para que o backend possa enviar mensagens ao cliente
// Corpo: { to: "5511999999999", text: "mensagem" }
// Header opcional: X-Bot-Token (mesmo token configurado em BOT_TOKEN)

let activeSock = null;

const httpServer = express();
httpServer.use(express.json());

httpServer.post("/send", async (req, res) => {
  // Validar token (opcional — evita abuso se porta ficar exposta)
  const incomingToken = req.headers["x-bot-token"];
  if (BOT_TOKEN && incomingToken !== BOT_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { to, text } = req.body;
  if (!to || !text) {
    return res.status(400).json({ error: "Campos 'to' e 'text' são obrigatórios" });
  }
  if (!activeSock) {
    return res.status(503).json({ error: "Bot ainda não conectado ao WhatsApp" });
  }

  try {
    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
    await activeSock.sendMessage(jid, { text });
    console.log(`[/send] ✅ Mensagem enviada para ${to}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error(`[/send] ❌ Erro ao enviar para ${to}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

httpServer.get("/health", (_req, res) => {
  res.json({ status: activeSock ? "connected" : "disconnected" });
});

httpServer.listen(SEND_PORT, () => {
  console.log(`[HTTP] Servidor /send rodando na porta ${SEND_PORT}`);
});

// ── Iniciar ──────────────────────────────────────────────────────────────────
startBot()
  .then((sock) => { activeSock = sock; })
  .catch((err) => {
    console.error("Erro fatal:", err);
    process.exit(1);
  });
