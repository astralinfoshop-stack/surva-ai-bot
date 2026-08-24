import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "mi_token_secreto_surva_social_2026";
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "1122495394284383";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get('/', (req, res) => res.send('🤖 Surva Social Meta AI Bot Activo 24/7'));

// Meta Webhook Verification (GET)
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

// Meta Incoming Notifications (POST)
app.post('/webhook', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED'); // Responder 200 a Meta inmediatamente

  try {
    const body = req.body;
    console.log('📥 Notificación entrante de Meta:', JSON.stringify(body));

    // 1. Manejo de Mensajes de WhatsApp
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const messages = change.value?.messages;
          if (messages && messages.length > 0) {
            const msg = messages[0];
            const fromNumber = msg.from;
            const text = msg.text?.body;
            if (fromNumber && text) {
              console.log(`💬 WhatsApp de ${fromNumber}: ${text}`);
              const aiReply = await getGeminiReply(text);
              await sendWhatsAppMessage(fromNumber, aiReply);
            }
          }
        }
      }
    }

    // 2. Manejo de Instagram DMs y Comentarios / Facebook
    if (body.object === 'instagram' || body.object === 'page') {
      for (const entry of body.entry || []) {
        if (entry.messaging) {
          for (const msgEvent of entry.messaging) {
            const senderId = msgEvent.sender?.id;
            const text = msgEvent.message?.text;
            if (senderId && text && !msgEvent.message?.is_echo) {
              console.log(`💬 DM de ${senderId}: ${text}`);
              const aiReply = await getGeminiReply(text);
              await sendMetaDM(senderId, aiReply);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error procesando webhook:', err.message);
  }
});

// Asistente Gemini AI
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

// Enviar Mensaje de WhatsApp mediante Meta Graph API
async function sendWhatsAppMessage(to, message) {
  if (!META_PAGE_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log("Falta META_PAGE_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID");
    return;
  }
  try {
    const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: { body: message }
    }, {
      headers: { "Authorization": `Bearer ${META_PAGE_ACCESS_TOKEN}` }
    });
    console.log(`✅ Respuesta enviada con éxito a WhatsApp ${to}`);
  } catch (e) {
    console.error("Error enviando WhatsApp:", e.response?.data || e.message);
  }
}

// Enviar DM Meta (Instagram / Messenger)
async function sendMetaDM(recipientId, message) {
  if (!META_PAGE_ACCESS_TOKEN) return;
  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${META_PAGE_ACCESS_TOKEN}`;
    await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: message }
    });
    console.log(`✅ DM enviado con éxito a ${recipientId}`);
  } catch (e) {
    console.error("Error enviando Meta DM:", e.response?.data || e.message);
  }
}

app.listen(PORT, () => console.log('Bot de IA activo en puerto ' + PORT));
