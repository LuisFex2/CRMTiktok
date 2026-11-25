import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ZernioClient } from './zernioClient.js';
import { AIEngine } from './aiEngine.js';
import { DB } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'config.json');
const PROCESSED_FILE = path.join(__dirname, 'data', 'processed.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cargar o inicializar configuración
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {
      businessName: 'Remates Villa El Salvador',
      accountId: '6b045c6eb9e97da7ab40d8a7',
      autoReplyEnabled: true,
      businessInfo: {}
    };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

// Persistencia de IDs procesados para evitar respuestas duplicadas
function loadProcessedKeys() {
  try {
    if (fs.existsSync(PROCESSED_FILE)) {
      const arr = JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'));
      return new Set(arr);
    }
  } catch {}
  return new Set();
}

function saveProcessedKeys(set) {
  try {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...set]), 'utf-8');
  } catch {}
}

const processedKeys = loadProcessedKeys();
let config = loadConfig();
const zernio = new ZernioClient(process.env.ZERNIO_API_KEY);
const ai = new AIEngine(config);

// -----------------------------------------------------------------------------
// ENDPOINTS DE LA API DEL CRM
// -----------------------------------------------------------------------------

app.get('/api/status', async (req, res) => {
  try {
    const data = DB.read();
    res.json({
      ok: true,
      connected: true,
      account: {
        username: 'rematesvillaelsalvador',
        displayName: 'RematesVillaElSalvador',
        id: config.accountId || '6b045c6eb9e97da7ab40d8a7',
        followersCount: 16975
      },
      autoReplyEnabled: config.autoReplyEnabled,
      stats: data.stats
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/comments', (req, res) => {
  const data = DB.read();
  res.json({
    ok: true,
    comments: data.comments,
    stats: data.stats,
    logs: data.logs.slice(0, 20)
  });
});

app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  if (process.env.GEMINI_API_KEY) {
    cfg.geminiApiKey = process.env.GEMINI_API_KEY;
  }
  res.json(cfg);
});

app.get('/api/rules', (req, res) => {
  res.json({ ok: true, rules: config.rules || {} });
});

app.post('/api/rules', (req, res) => {
  try {
    config.rules = req.body;
    saveConfig(config);
    ai.updateConfig(config);
    console.log('[Reglas Actualizadas] El usuario modificó las palabras clave y respuestas desde el CRM.');
    res.json({ ok: true, rules: config.rules });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const { geminiApiKey, ...rest } = req.body;
    if (typeof geminiApiKey === 'string') {
      process.env.GEMINI_API_KEY = geminiApiKey.trim();
      // Guardar también en .env local para persistencia segura
      try {
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        if (envContent.includes('GEMINI_API_KEY=')) {
          envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${geminiApiKey.trim()}`);
        } else {
          envContent += `\nGEMINI_API_KEY=${geminiApiKey.trim()}`;
        }
        fs.writeFileSync(envPath, envContent, 'utf-8');
      } catch {}
    }

    config = { ...config, ...rest };
    saveConfig(config);
    ai.updateConfig({ ...config, geminiApiKey: process.env.GEMINI_API_KEY });
    res.json({ ok: true, config: { ...config, geminiApiKey: process.env.GEMINI_API_KEY } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/comments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = DB.read();
    data.comments = data.comments.filter(c => c.id !== id && c.conversationId !== id);
    DB.write(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/clear-history', (req, res) => {
  try {
    const fresh = {
      comments: [],
      logs: [],
      stats: {
        totalComments: 0,
        totalReplies: 0,
        aiReplies: 0,
        manualReplies: 0
      }
    };
    DB.write(fresh);
    processedKeys.clear();
    saveProcessedKeys(processedKeys);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function isBotEnabled() {
  return config.aiAgentEnabled !== false || config.rulesEnabled !== false;
}

function buildDbHistory(conversationId, excludeId = null) {
  if (!conversationId) return [];
  const data = DB.read();
  const thread = (data.comments || [])
    .filter(c => c.conversationId === conversationId && c.id !== excludeId)
    .slice(0, 4)
    .reverse();
  const history = [];
  for (const item of thread) {
    if (item.text) history.push({ role: 'user', text: item.text });
    if (item.replyText) {
      const cleanReply = item.replyText.replace(/\s*\n?\[\+\s*Bloque 2:[^\]]*\]/g, '').trim();
      if (cleanReply) history.push({ role: 'model', text: cleanReply });
    }
  }
  return history;
}

app.post('/api/reply', async (req, res) => {
  try {
    const { id, text, username = 'usuario', postId, conversationId } = req.body;
    const isDM = !!conversationId || postId === 'dm_thread' || (id && id.startsWith('dm_'));
    const history = isDM ? buildDbHistory(conversationId, id) : [];
    const aiResult = await ai.generateResponse({ text, username, isDM, history });
    const firstMsg = typeof aiResult === 'object' ? aiResult.message : aiResult;
    const followUp = typeof aiResult === 'object' ? aiResult.followUp : null;

    if (!firstMsg) {
      return res.json({ ok: false, error: 'Sin respuesta (sin intención comercial o filtro de silencio)' });
    }

    const fullReply = firstMsg + (followUp ? ` \n[+ Bloque 2: ${followUp}]` : '');

    if (isDM && conversationId) {
      const sendRes = await zernio.sendDirectMessage({
        accountId: config.accountId,
        conversationId,
        message: firstMsg
      });
      if (sendRes.success && followUp) {
        await new Promise(r => setTimeout(r, 600));
        await zernio.sendDirectMessage({
          accountId: config.accountId,
          conversationId,
          message: followUp
        });
      }
    } else if (postId && postId !== 'dm_thread') {
      const commentId = (id || '').replace(/^cm_/, '');
      await zernio.replyToComment({
        accountId: config.accountId,
        postId,
        commentId,
        message: firstMsg
      });
    }

    DB.updateCommentReply(id, fullReply, 'ai');
    res.json({ ok: true, replyText: fullReply });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/send-template', async (req, res) => {
  try {
    const { conversationId, category } = req.body;
    const templates = config.templates || {};
    const list = templates[category] || [];
    if (list.length === 0) {
      return res.status(400).json({ ok: false, error: 'Categoría no encontrada' });
    }

    const message = list[Math.floor(Math.random() * list.length)];
    const accountId = config.accountId || '6b045c6eb9e97da7ab40d8a7';

    const sendData = await zernio.sendDirectMessage({ accountId, conversationId, message });
    if (sendData.success) {
      DB.updateCommentReply('dm_' + conversationId, message, 'manual');
    }
    res.json({ ok: true, message, sendData });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/simulate-comment', async (req, res) => {
  try {
    const { username = 'usuario_test', text = '', isDM = false } = req.body;
    const aiResult = await ai.generateResponse({ text, username, isDM });
    const replyText = typeof aiResult === 'object' ? aiResult.message : aiResult;
    const followUp = typeof aiResult === 'object' ? aiResult.followUp : null;

    res.json({
      ok: true,
      simulated: true,
      originalText: text,
      replyText: replyText ? (replyText + (followUp ? `\n[Bloque 2: ${followUp}]` : '')) : '(Silencio - Sin intención de compra)',
      followUp
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/webhook', async (req, res) => {
  res.status(200).json({ received: true });
});

// -----------------------------------------------------------------------------
// SINCRONIZACIÓN EN TIEMPO REAL: MENSAJES DIRECTOS (DMs)
// -----------------------------------------------------------------------------
let isPollingDMs = false;
const lastConversationTimes = new Map();
const convAiReplyCount = new Map(); // Contador de respuestas para no atrapar al cliente en un diálogo extenso

async function syncDirectMessages() {
  if (isPollingDMs) return;
  isPollingDMs = true;

  try {
    const convData = await zernio.getConversations();
    const conversations = convData.data || [];

    for (const conv of conversations) {
      const convId = conv.id || conv._id;
      if (!convId) continue;

      const lastTime = conv.updatedTime || conv.updatedAt || '';
      const previousTime = lastConversationTimes.get(convId);

      if (previousTime && previousTime === lastTime) {
        continue;
      }
      lastConversationTimes.set(convId, lastTime);

      const msgData = await zernio.getConversationMessages(convId);
      const messages = msgData.messages || [];
      if (messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];
      if (lastMsg.direction !== 'incoming') continue;
      if (processedKeys.has(lastMsg.id)) continue;

      const username = conv.participantUsername || conv.participantName || lastMsg.senderName || 'usuario_tiktok';
      const text = lastMsg.message || '';

      // Control de diálogo: Si ya se respondieron 2 veces en esta conversación, cerrar bot para no confundir al cliente
      const currentReplies = convAiReplyCount.get(convId) || 0;
      if (currentReplies >= 2) {
        console.log(`[TikTok DM] Límite de 2 respuestas alcanzado en conv ${convId} (@${username}). Bot en silencio para que pase a WhatsApp.`);
        processedKeys.add(lastMsg.id);
        saveProcessedKeys(processedKeys);
        continue;
      }

      console.log(`[TikTok DM] De: @${username} | "${text}" (Respuesta ${currentReplies + 1}/2)`);

      const incoming = {
        id: 'dm_' + lastMsg.id,
        postId: 'dm_thread',
        conversationId: convId,
        username,
        text,
        timestamp: lastMsg.createdAt || new Date().toISOString(),
        status: 'pending',
        replyText: null
      };

      DB.addComment(incoming);

      if (isBotEnabled()) {
        const history = messages
          .slice(-7, -1)
          .map(m => ({
            role: m.direction === 'incoming' ? 'user' : 'model',
            text: (m.message || '').trim()
          }))
          .filter(h => h.text);
        let aiResult;
        try {
          aiResult = await ai.generateResponse({ text, username, isDM: true, history });
        } catch (aiErr) {
          console.error(`[TikTok DM] ❌ Error Gemini para @${username}: ${aiErr.message}`);
          processedKeys.add(lastMsg.id);
          saveProcessedKeys(processedKeys);
          continue;
        }
        const firstMsg = typeof aiResult === 'object' ? aiResult.message : aiResult;
        const followUp = typeof aiResult === 'object' ? aiResult.followUp : null;

        if (!firstMsg) {
          console.log(`[TikTok DM] ⏭️ Sin respuesta (silencio/filtro) para @${username}`);
          processedKeys.add(lastMsg.id);
          saveProcessedKeys(processedKeys);
          continue;
        }

        const sendData = await zernio.sendDirectMessage({
          accountId: config.accountId,
          conversationId: convId,
          message: firstMsg
        });

        if (sendData.success) {
          convAiReplyCount.set(convId, currentReplies + 1);
          processedKeys.add(lastMsg.id);
          saveProcessedKeys(processedKeys);
          DB.updateCommentReply(incoming.id, firstMsg + (followUp ? ` \n[+ Bloque 2: ${followUp}]` : ''), 'ai');
          console.log(`[TikTok DM] ✅ Entregado a @${username}`);

          if (followUp) {
            await new Promise(r => setTimeout(r, 700));
            await zernio.sendDirectMessage({
              accountId: config.accountId,
              conversationId: convId,
              message: followUp
            });
            console.log(`[TikTok DM] ✅ Bloque 2 (WhatsApp) entregado a @${username}`);
          }
        } else {
          console.error(`[TikTok DM] ❌ Zernio falló al enviar a @${username}:`, JSON.stringify(sendData));
        }
      }
    }
  } catch (err) {
    console.error(`[Sync DM] ❌ Error general:`, err.message);
  } finally {
    isPollingDMs = false;
  }
}

// -----------------------------------------------------------------------------
// SINCRONIZACIÓN EN TIEMPO REAL: COMENTARIOS EN VIDEOS
// -----------------------------------------------------------------------------
let isPollingComments = false;
let activePostIds = [
  '7711801983979506965',
  '7711423085152439573',
  '7708817054815603989',
  '7705953085117517076',
  '7705597512568098068',
  '7704734291187584277'
];

async function updateActivePostsList() {
  try {
    const listData = await zernio.getRecentPosts(15);
    const posts = listData.data || [];
    if (posts.length > 0) {
      activePostIds = posts.slice(0, 10).map(p => p.id);
    }
  } catch {}
}
setInterval(updateActivePostsList, 180000);

async function syncVideoComments() {
  if (isPollingComments || !isBotEnabled()) return;
  isPollingComments = true;

  try {
    for (const postId of activePostIds) {
      const commentsData = await zernio.getPostComments(postId, config.accountId);
      const commentItems = commentsData.comments || [];

      for (const cm of commentItems) {
        const commentId = cm.id;
        const key = 'cm_' + commentId;

        if (processedKeys.has(key)) continue;
        if (cm.from?.isOwner === true) continue;

        const alreadyAnswered = (cm.replies || []).some(r => r.from?.isOwner === true);
        if (alreadyAnswered) {
          processedKeys.add(key);
          saveProcessedKeys(processedKeys);
          continue;
        }

        const username = cm.from?.username || cm.from?.name || 'usuario';
        const commentText = cm.message || '';

        // 1. REGLA HUMANA + IA: Clasificación de intención.
        // Si es broma, meme, risas o no es consulta comercial -> Se ignora y NO se responde.
        const replyText = await ai.generateCommentResponse({ text: commentText, username });
        if (!replyText) {
          console.log(`[TikTok Comentario Ignorado - Sin Intención Comercial] @${username}: "${commentText}"`);
          processedKeys.add(key);
          saveProcessedKeys(processedKeys);
          continue;
        }

        // 2. REGLA ANTISPAM POR USUARIO:
        // No responderle al mismo usuario más de una vez en el mismo video para no acosarlo ni repetirle el WhatsApp.
        const userPostKey = `user_${username}_${postId}`;
        if (processedKeys.has(userPostKey)) {
          console.log(`[TikTok Comentario Omitido - Usuario ya atendido en este video] @${username}`);
          processedKeys.add(key);
          saveProcessedKeys(processedKeys);
          continue;
        }

        console.log(`[TikTok Comentario Calificado] Video ${postId} | @${username}: "${commentText}"`);

        const replyData = await zernio.replyToComment({
          accountId: config.accountId,
          postId,
          commentId,
          message: replyText
        });

        if (replyData.success || replyData.commentId || replyData.id) {
          processedKeys.add(key);
          processedKeys.add(userPostKey);
          saveProcessedKeys(processedKeys);
          console.log(`[TikTok Comentario] Respuesta humana publicada con éxito para @${username}`);

          DB.addComment({
            id: key,
            postId,
            username,
            text: commentText,
            timestamp: cm.createdTime || new Date().toISOString(),
            status: 'replied',
            replyText,
            repliedAt: new Date().toISOString(),
            replySource: 'ai'
          });
        }
      }
    }
  } catch (err) {
    console.error(`[Sync Comentarios] ❌ Error general:`, err.message);
  } finally {
    isPollingComments = false;
  }
}

// Iniciar motores de sincronización
setInterval(syncDirectMessages, 10000); // DMs cada 10s
setInterval(syncVideoComments, 15000); // Comentarios cada 15s

app.listen(PORT, () => {
  console.log(`🚀 TikTok AI CRM Enterprise activo en: http://localhost:${PORT}`);
  console.log(`⚡ Sincronización en tiempo real activa`);
});
