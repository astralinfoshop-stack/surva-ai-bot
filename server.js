import express from 'express';
import axios from 'axios';
import QRCode from 'qrcode';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "mi_token_secreto_surva_social_2026";
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let currentQR = '';
let isConnected = false;
let waSock = null;
const conversationHistory = {}; // Memoria de chat por usuario

app.get('/', (req, res) => res.send('🤖 Surva Social Omnicanal AI Bot (WhatsApp, Instagram, Facebook) Activo 24/7'));

// Endpoint para verificar estado y QR de WhatsApp
app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp IA Conectado</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #1e293b; padding: 40px; border-radius: 24px; text-align: center; max-width: 480px; width: 100%; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
          h1 { color: #38bdf8; font-size: 26px; margin-bottom: 12px; }
          p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 8px 0; }
          .badge { display: inline-block; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); padding: 6px 16px; border-radius: 9999px; font-weight: 600; font-size: 14px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● SISTEMA WHATSAPP EN VIVO</div>
          <h1>✅ WhatsApp IA Conectado con Éxito</h1>
          <p>Tu robot de Inteligencia Artificial está respondiendo mensajes automáticos las 24 horas del día.</p>
          <p style="color: #e2e8f0; font-weight: 500; margin-top: 20px;">📲 Tu aplicación de WhatsApp Business en tu celular sigue funcionando 100% normal.</p>
        </div>
      </body>
      </html>
    `);
  }

  if (!currentQR) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Generando QR...</title>
        <meta http-equiv="refresh" content="3">
        <style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#1e293b;padding:40px;border-radius:20px;text-align:center;}</style>
      </head>
      <body>
        <div class="card">
          <h2>⏳ Generando Código QR de WhatsApp...</h2>
          <p>Esta página se recargará automáticamente en 3 segundos.</p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(currentQR);
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Escanear QR | Surva Social IA</title>
        <meta http-equiv="refresh" content="15">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #1e293b; padding: 36px; border-radius: 24px; text-align: center; max-width: 440px; width: 100%; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
          h2 { color: #38bdf8; margin-top: 0; font-size: 24px; }
          p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
          img { border-radius: 16px; background: white; padding: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }
          ol { text-align: left; background: #0f172a; padding: 20px 20px 20px 40px; border-radius: 16px; border: 1px solid #334155; font-size: 14px; color: #cbd5e1; margin-top: 24px; line-height: 1.8; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📲 Conectar WhatsApp Business</h2>
          <p>Escanea este código QR desde tu celular para vincular la IA:</p>
          <img src="${qrDataUrl}" width="260" height="260" alt="WhatsApp QR Code"/>
          <ol>
            <li>Abre <b>WhatsApp Business</b> en tu celular.</li>
            <li>Ve a <b>Ajustes / Configuración</b> -> <b>Dispositivos vinculados</b>.</li>
            <li>Toca <b>Vincular un dispositivo</b> y apunta la cámara a este QR.</li>
          </ol>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send("Error generando QR");
  }
});

// Meta Webhook Verification para Instagram / Facebook (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado con éxito por Meta');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta Incoming Notifications para Instagram / Facebook (POST)
app.post('/webhook', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object === 'instagram' || body.object === 'page') {
      for (const entry of body.entry || []) {
        if (entry.messaging) {
          for (const msgEvent of entry.messaging) {
            const senderId = msgEvent.sender?.id;
            const text = msgEvent.message?.text;
            if (senderId && text && !msgEvent.message?.is_echo) {
              console.log(`💬 DM Meta (${senderId}): ${text}`);
              if (!conversationHistory[senderId]) conversationHistory[senderId] = [];
              conversationHistory[senderId].push(`Cliente: ${text}`);

              const aiReply = await getGeminiReply(conversationHistory[senderId].join('\n'), text);
              conversationHistory[senderId].push(`Mila AI: ${aiReply}`);

              await sendMetaDM(senderId, aiReply);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error en webhook de Meta:', err.message);
  }
});

async function sendMetaDM(recipientId, message) {
  if (!META_PAGE_ACCESS_TOKEN) return;
  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${META_PAGE_ACCESS_TOKEN}`;
    await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: message }
    });
    console.log(`✅ DM enviado con éxito a (${recipientId})`);
  } catch (e) {
    console.error("Error enviando Meta DM:", e.response?.data || e.message);
  }
}

async function startWhatsAppBot() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
  
  waSock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    keepAliveIntervalMs: 15000,
    connectTimeoutMs: 30000
  });

  waSock.ev.on('creds.update', saveCreds);

  waSock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      currentQR = qr;
      isConnected = false;
      console.log('📲 Nuevo Código QR listo en /qr');
    }
    if (connection === 'open') {
      isConnected = true;
      currentQR = '';
      console.log('✅ WhatsApp IA Conectado y listo!');
    }
    if (connection === 'close') {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Conexión cerrada (status ${statusCode}), reconectando...`, shouldReconnect);
      if (shouldReconnect) {
        setTimeout(startWhatsAppBot, 3000);
      }
    }
  });

  waSock.ev.on('messages.upsert', async (m) => {
    try {
      const messagesList = m.messages || [];
      for (const msg of messagesList) {
        if (!msg || !msg.message) continue;

        const from = msg.key.remoteJid;
        if (!from || from.endsWith('@g.us')) continue; // Ignorar grupos

        // Extraer texto
        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption ||
                     msg.message.videoMessage?.caption || '';

        if (!text) continue;

        console.log(`💬 WhatsApp [${msg.key.fromMe ? 'fromMe' : 'Cliente'}] de ${from}: ${text}`);

        // Responder a cualquier mensaje entrante que no hayamos enviado nosotros
        if (!msg.key.fromMe) {
          if (!conversationHistory[from]) conversationHistory[from] = [];
          conversationHistory[from].push(`Cliente: ${text}`);
          if (conversationHistory[from].length > 10) conversationHistory[from].shift();

          const aiReply = await getGeminiReply(conversationHistory[from].join('\n'), text);
          conversationHistory[from].push(`Mila AI: ${aiReply}`);

          await new Promise(r => setTimeout(r, 800));

          // Enviar respuesta garantizada
          await waSock.sendMessage(from, { text: aiReply });
          console.log(`✅ IA respondió WhatsApp a ${from}`);
        }
      }
    } catch (err) {
      console.error('Error procesando mensaje WhatsApp:', err.message);
    }
  });
}

async function getGeminiReply(chatHistory, userText) {
  if (!GEMINI_API_KEY) {
    return `¡Hola! 😊 Gracias por escribir a Surva Social. Te ayudamos a escalar las ventas de tu negocio con Branding, Marketing Digital y Desarrollo Web de alto impacto. ¿En qué podemos ayudarte hoy?📲`;
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [{
        parts: [{
          text: `Eres Mila AI, la asesora virtual experta de la agencia Surva Social. Responde amablemente en español, de forma fluida y conversacional en máximo 2 párrafos cortos con emojis. Promociona los servicios de Branding, Marketing y Diseño Web de Surva Social.
Historial del chat:
${chatHistory}

Mensaje más reciente del cliente: "${userText}"`
        }]
      }]
    };
    const response = await axios.post(url, payload);
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "¡Excelente! 😊 En Surva Social diseñamos estrategias de marca que venden. ¿Te gustaría que te enviemos una propuesta personalizada?";
  } catch (e) {
    console.error("Gemini Error:", e.message);
    return "¡Perfecto! 😊 Si deseas podemos coordinar una breve llamada para analizar tu proyecto. ¿Te parece bien?";
  }
}

app.listen(PORT, () => {
  console.log('Servidor activo en puerto ' + PORT);
  startWhatsAppBot().catch(err => console.error('Error iniciando Bot WhatsApp:', err));
});
