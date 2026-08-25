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
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "1328789613640536";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let currentQR = '';
let isConnected = false;
let waSock = null;

// Keep-Alive para evitar que Render ponga a dormir el servidor (cada 4 minutos)
setInterval(async () => {
  try {
    await axios.get('https://surva-ai-bot-live.onrender.com/');
  } catch (e) {}
}, 4 * 60 * 1000);

app.get('/', (req, res) => res.send('🤖 Surva Social Multi-Channel AI Bot (WhatsApp Business + Meta API) Activo 24/7'));

// ==========================================
// 1. ENDPOINT PARA CÓDIGO QR (WHATSAPP BUSINESS)
// ==========================================
app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Business Conectado</title>
        <style>body{font-family:sans-serif;background:#0f172a;color:#4ade80;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#1e293b;padding:40px;border-radius:20px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);}</style>
      </head>
      <body>
        <div class="card">
          <h1>✅ WhatsApp Business IA Conectado y Respondiendo 24/7</h1>
          <p style="color:#94a3b8;">Tu bot está listo y atendiendo mensajes en tu celular +1 (813) 326-4182.</p>
        </div>
      </body>
      </html>
    `);
  }

  if (!currentQR) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Generando QR...</title><meta http-equiv="refresh" content="2"><style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}</style></head>
      <body><h2>⏳ Generando Código QR de WhatsApp...</h2></body>
      </html>
    `);
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(currentQR);
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Escanear QR WhatsApp</title>
        <meta http-equiv="refresh" content="10">
        <style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#1e293b;padding:30px;border-radius:20px;text-align:center;} img{border-radius:12px;background:#fff;padding:10px;margin:15px 0;}</style>
      </head>
      <body>
        <div class="card">
          <h2>📲 Vincula tu WhatsApp Business (+1 813-326-4182)</h2>
          <p>Escanea este código QR desde el celular de tu negocio:</p>
          <img src="${qrDataUrl}" width="250" height="250"/>
          <p style="color:#94a3b8;font-size:14px;">WhatsApp -> Ajustes -> Dispositivos vinculados -> Vincular dispositivo</p>
        </div>
      </body>
      </html>
    `);
  } catch (e) {
    return res.send("Error generando QR");
  }
});

// ==========================================
// 2. ENDPOINTS PARA META CLOUD API (WEBHOOKS)
// ==========================================
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado por Meta');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED');
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value && value.messages && value.messages.length > 0) {
            const msg = value.messages[0];
            const fromNumber = msg.from;
            const text = msg.text?.body || msg.caption || '';
            if (fromNumber && text) {
              const aiReply = await generateAIReply(text);
              await sendMetaWhatsAppMessage(fromNumber, aiReply);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error procesando webhook de Meta:', err.message);
  }
});

async function sendMetaWhatsAppMessage(to, message) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN || META_PAGE_ACCESS_TOKEN;
  if (!token || !phoneId) return;
  try {
    await axios.post(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: { body: message }
    }, {
      headers: { "Authorization": `Bearer ${token}` }
    });
  } catch (e) {
    console.error("Error enviando Meta WhatsApp:", e.message);
  }
}

// ==========================================
// 3. MOTOR DE WHATSAPP BUSINESS DIRECTO (BAILEYS)
// ==========================================
function getMessageText(msg) {
  if (!msg || !msg.message) return '';
  const m = msg.message;
  return m.conversation ||
         m.extendedTextMessage?.text ||
         m.imageMessage?.caption ||
         m.videoMessage?.caption ||
         m.ephemeralMessage?.message?.conversation ||
         m.ephemeralMessage?.message?.extendedTextMessage?.text ||
         '';
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

  waSock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async (key) => { return { conversation: 'Surva Social AI' }; }
  });

  waSock.ev.on('creds.update', saveCreds);

  waSock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      currentQR = qr;
      isConnected = false;
    }
    if (connection === 'open') {
      isConnected = true;
      currentQR = '';
      console.log('✅ WhatsApp Business Conectado con Éxito!');
    }
    if (connection === 'close') {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        setTimeout(startBot, 2000);
      }
    }
  });

  waSock.ev.on('messages.upsert', async (m) => {
    try {
      const messagesList = m.messages || [];
      for (const msg of messagesList) {
        if (!msg) continue;

        const from = msg.key.remoteJid;
        if (!from || from.endsWith('@g.us')) continue;

        const userText = getMessageText(msg);
        if (!userText) continue;

        if (!userText.trim().startsWith('🤖')) {
          const replyText = await generateAIReply(userText);
          await waSock.sendMessage(from, { text: replyText });
        }
      }
    } catch (err) {
      console.error(`Error en mensaje: ${err.message}`);
    }
  });
}

// ==========================================
// 4. GENERADOR DE INTELIGENCIA ARTIFICIAL (GEMINI)
// ==========================================
async function generateAIReply(text) {
  if (!GEMINI_API_KEY) {
    return "🤖 ¡Hola! 😊 Gracias por escribir a Surva Social. Te ayudamos a escalar las ventas de tu negocio con Branding, Marketing Digital y Desarrollo Web de alto impacto. ¿En qué podemos ayudarte hoy?📲";
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [{
        parts: [{
          text: `Eres Mila AI, la asesora virtual de la agencia Surva Social. Responde amablemente en español, en 2 párrafos cortos con emojis, promocionando los servicios de Branding, Marketing y Web. Tu respuesta SIEMPRE debe comenzar con el emoji "🤖". El usuario dice: "${text}"`
        }]
      }]
    };
    const response = await axios.post(url, payload);
    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "¡Hola! 😊 En Surva Social te ayudamos a escalar tus ventas con branding y marketing de alto impacto. ¿En qué podemos ayudarte hoy?";
    return reply.startsWith('🤖') ? reply : `🤖 ${reply}`;
  } catch (e) {
    return "🤖 ¡Hola! 😊 Bienvenido a Surva Social. ¿Cómo podemos ayudarte con la estrategia de tu marca hoy?";
  }
}

app.listen(PORT, () => {
  console.log('Servidor Multi-Canal en puerto ' + PORT);
  startBot().catch(err => console.error('Error al iniciar bot:', err));
});
