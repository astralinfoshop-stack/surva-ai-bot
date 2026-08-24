import express from 'express';
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "mi_token_secreto_surva_social_2026";

app.get('/', (req, res) => res.send('🤖 Surva Social Meta AI Bot Activo'));

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.listen(PORT, () => console.log('Bot activo en puerto ' + PORT));
