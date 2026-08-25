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

app.get('/', (req, res) => res.send('🤖 Surva Social WhatsApp AI Bot (QR Engine) Activo 24/7. Entra a /qr para conectar tu WhatsApp.'));

// Endpoint para mostrar el Código QR en vivo
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
          <div class="badge">● SISTEMA OPERATIVO Y EN VIVO</div>
          <h1>✅ WhatsApp IA Conectado con Éxito</h1>
          <p>Tu bot de Inteligencia Artificial está respondiendo mensajes automáticos las 24 horas del día.</p>
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 40px; border-radius: 20px; text-align: center; border: 1px solid #334155; }
          h2 { color: #38bdf8; margin-bottom: 10px; }
          p { color: #94a3b8; }
        </style>
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
          li b { color: #f8fafc; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📲 Conectar WhatsApp Business</h2>
          <p>Escanea este código QR desde tu celular para vincular la IA:</p>

          <img src="${qrDataUrl}" width="260" height="260" alt="WhatsApp QR Code"/>

          <ol>
            <li>Abre <b>WhatsApp Business</b> en tu celular.</li>
            <li>Ve a <b>Configuración / Ajustes</b> -> <b>Dispositivos vinculados</b>.</li>
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

async function startWhatsAppBot() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
  
  const waSock = makeWASocket({
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
      console.log('📲 Nuevo Código QR listo en /qr');
    }
    if (connection === 'open') {
      isConnected = true;
      currentQR = '';
      console.log('✅ WhatsApp IA Conectado con éxito via QR!');
    }
    if (connection === 'close') {
      isConnected = false;
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log('Reconectando canal...', shouldReconnect);
      if (shouldReconnect) {
        startWhatsAppBot();
      }
    }
  });

  waSock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || msg.key.fromMe || !msg.message) return;

      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

      if (!text || from.endsWith('@g.us')) return; // Ignorar grupos

      console.log(`💬 Mensaje recibido de ${from}: ${text}`);

      // Respuesta inteligente con Gemini AI
      const aiReply = await getGeminiReply(text);

      // Responder directamente al usuario por WhatsApp
      await waSock.sendMessage(from, { text: aiReply });
      console.log(`✅ IA respondió con éxito a ${from}`);
    } catch (err) {
      console.error('Error en respuesta automática:', err.message);
    }
  });
}

async function getGeminiReply(userText) {
  if (!GEMINI_API_KEY) {
    return `¡Hola! 😊 Gracias por comunicarte con Surva Social. Ofrecemos servicios de Branding, Marketing Digital, Diseño y Pautas Publicitarias para escalar tu negocio. ¿En qué podemos ayudarte hoy?📲`;
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [{
        parts: [{
          text: `Eres Mila AI, la asesora experta de la agencia Surva Social. Responde amablemente en español, máximo 2 párrafos cortos con emojis. Promociona los servicios de Branding, Ads y Desarrollo Web de Surva Social. El usuario pregunta: "${userText}"`
        }]
      }]
    };
    const response = await axios.post(url, payload);
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "¡Hola! 😊 En Surva Social te ayudamos a escalar tus ventas con branding y marketing de alto impacto. ¿En qué podemos ayudarte hoy?";
  } catch (e) {
    console.error("Gemini Error:", e.message);
    return "¡Hola! 😊 Bienvenido a Surva Social. ¿Cómo podemos ayudarte con la estrategia de tu marca hoy?";
  }
}

app.listen(PORT, () => {
  console.log('Servidor activo en puerto ' + PORT);
  startWhatsAppBot().catch(err => console.error('Error iniciando Bot WhatsApp:', err));
});
