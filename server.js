import express from 'express';
import axios from 'axios';
import QRCode from 'qrcode';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let currentQR = '';
let isConnected = false;
let waSock = null;
const recentLogs = [];

function addLog(msg) {
  const time = new Date().toLocaleTimeString('es-US', { timeZone: 'America/New_York' });
  recentLogs.unshift(`[${time}] ${msg}`);
  if (recentLogs.length > 50) recentLogs.pop();
}

app.get('/', (req, res) => res.send('🤖 Surva Social WhatsApp AI Bot Activo 24/7'));

app.get('/logs', (req, res) => {
  res.json({ logs: recentLogs });
});

app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Conectado</title>
        <style>body{font-family:sans-serif;background:#0f172a;color:#4ade80;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} .card{background:#1e293b;padding:40px;border-radius:20px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);}</style>
      </head>
      <body>
        <div class="card">
          <h1>✅ WhatsApp IA Conectado y Respondiendo 24/7</h1>
          <p style="color:#94a3b8;">Tu bot está listo y atendiendo mensajes automáticos en vivo.</p>
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
          <h2>📲 Vincula tu WhatsApp Business</h2>
          <p>Escanea este código QR desde tu celular:</p>
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
    printQRInTerminal: false
  });

  waSock.ev.on('creds.update', saveCreds);

  waSock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      currentQR = qr;
      isConnected = false;
      addLog('📲 Nuevo QR listo para escanear');
    }
    if (connection === 'open') {
      isConnected = true;
      currentQR = '';
      addLog('✅ WhatsApp Conectado y Listo!');
    }
    if (connection === 'close') {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      addLog(`Conexión cerrada status: ${statusCode}`);
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

        addLog(`💬 Entrante de ${from} [fromMe=${msg.key.fromMe}]: "${userText}"`);

        if (!userText) continue;

        // Responder si no empieza con la firma del bot
        if (!userText.trim().startsWith('🤖')) {
          const replyText = await generateAIReply(userText);
          
          // Enviar respuesta al chat principal
          await waSock.sendMessage(from, { text: replyText });
          addLog(`✅ IA respondió con éxito a ${from}`);
        }
      }
    } catch (err) {
      addLog(`Error en mensaje: ${err.message}`);
    }
  });
}

async function generateAIReply(text) {
  if (!GEMINI_API_KEY) {
    return "🤖 ¡Hola! 😊 Gracias por escribir a Surva Social. Te ayudamos a escalar las ventas de tu negocio con Branding, Marketing Digital y Desarrollo Web de alto impacto. ¿En qué podemos ayudarte hoy?📲";
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(url, {
      contents: [{
        parts: [{
          text: `Eres Mila AI, la asesora virtual de la agencia Surva Social. Responde amablemente en español, en 2 párrafos cortos con emojis, promocionando los servicios de Branding, Marketing y Web. Tu respuesta SIEMPRE debe comenzar con el emoji "🤖". El usuario dice: "${text}"`
        }]
      }]
    });
    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "¡Hola! 😊 En Surva Social te ayudamos a escalar tus ventas con branding y marketing de alto impacto. ¿En qué podemos ayudarte hoy?";
    return reply.startsWith('🤖') ? reply : `🤖 ${reply}`;
  } catch (e) {
    return "🤖 ¡Hola! 😊 Bienvenido a Surva Social. ¿Cómo podemos ayudarte con la estrategia de tu marca hoy?";
  }
}

app.listen(PORT, () => {
  console.log('Servidor en puerto ' + PORT);
  startBot().catch(err => console.error('Error al iniciar bot:', err));
});
