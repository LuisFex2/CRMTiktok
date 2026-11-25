import dotenv from 'dotenv';
dotenv.config();

export class AIEngine {
  constructor(config = {}) {
    this.config = config;
    this.keyIndex = 0;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  getApiKeys() {
    const raw = this.config.geminiApiKey || process.env.GEMINI_API_KEY || '';
    return String(raw)
      .split(/[\n,;]+/)
      .map(k => k.trim())
      .filter(Boolean);
  }

  getOfficialWhatsapp() {
    const raw = this.config.businessInfo?.whatsapp || '994516143';
    const clean = String(raw).replace(/\D/g, '');
    return clean || '994516143';
  }

  /**
   * Comprueba si el texto contiene alguna de las palabras clave (con límites de palabra para evitar falsos positivos)
   */
  matchesKeywords(text, keywordsString) {
    if (!keywordsString || !text) return false;
    const lowerText = text.toLowerCase();
    const list = keywordsString.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    return list.some(k => {
      const escaped = k.replace(/[.*+?^()|[\]\\]/g, '\\$&');
      const regex = new RegExp('(^|[^a-záéíóúñ0-9])' + escaped + '([^a-záéíóúñ0-9]|$)', 'i');
      return regex.test(lowerText);
    });
  }

  // ---------------------------------------------------------------------------
  // 1. EVALUACIÓN INTELIGENTE CON GOOGLE GEMINI (COMPRENDE ERRORES Y SLANG)
  // ---------------------------------------------------------------------------
  async consultGemini(text, isDM = false, history = []) {
    if (this.config.aiAgentEnabled === false) return null;
    const keys = this.getApiKeys();
    if (keys.length === 0) return null;

    const phone = this.getOfficialWhatsapp();
    const address = this.config.businessInfo?.address || 'Av. Velasco Alvarado 718, Villa El Salvador';
    const hours = this.config.businessInfo?.openingHours || 'Lunes a Sábado de 9:00 am a 8:00 pm';
    const payments = this.config.businessInfo?.cardPayment || 'Tarjeta con 5% recargo POS, Yape o transferencia';
    const delivery = this.config.businessInfo?.delivery || 'Solo tienda física, no hacemos envíos';
    const store = this.config.businessName || 'Remates Villa El Salvador';

    const defaultPrompt = `Eres el asistente oficial de ventas en TikTok de la tienda "{businessName}".
Ubicación física: {address}.
Horario de atención: {hours}.
WhatsApp oficial de ventas: {whatsapp}.
Métodos de pago: {payments}.
Entregas: {delivery}.
Reglas de negocio:
- Solo atendemos y vendemos en tienda física. NO hacemos envíos ni delivery.
- Aceptamos tarjeta (con 5% de recargo POS), Yape o transferencia.
- Productos: electrodomésticos nuevos de exhibición y liquidación con garantía probada.

El usuario escribió el siguiente mensaje o comentario en TikTok:
"{text}"

Instrucciones de clasificación y respuesta:
1. Si el comentario es un meme, risas (jajaja, xd, 😂), crítica vacía, broma o NO tiene ninguna intención de compra o consulta sobre productos/tienda, responde ÚNICAMENTE la palabra: SILENCIO
2. Si el usuario pregunta horario, ubicación, formas de pago o envíos, respóndele directamente con la información que tienes arriba. No lo mandes al WhatsApp si ya puedes resolver su duda con los datos que tienes.
3. Si el usuario tiene intención de compra, consulta de modelos, stock, precios, marcas (incluso con faltas de ortografía o modismos como "stok", "keda", "frijider", "a cuanto"):
   - Responde amablemente en 1 o máximo 2 oraciones directas, cordiales y comerciales invitando a escribir al WhatsApp {whatsapp} para pasarle fotos reales de los modelos disponibles.
   - En comentarios públicos NUNCA incluyas enlaces web (URLs), solo menciona el WhatsApp {whatsapp}.`;

    const template = this.config.aiSystemPrompt || defaultPrompt;
    let systemPrompt = template
      .replace(/{businessName}/g, store)
      .replace(/{address}/g, address)
      .replace(/{hours}/g, hours)
      .replace(/{whatsapp}/g, phone)
      .replace(/{payments}/g, payments)
      .replace(/{delivery}/g, delivery)
      .replace(/{text}/g, text);

    if (Array.isArray(history) && history.length > 0) {
      const historyLines = history
        .map(h => `${h.role === 'user' ? 'Cliente' : 'Tú (asistente)'}: ${h.text}`)
        .join('\n');
      systemPrompt += `\n\nHistorial reciente de esta conversación (úsalo para mantener el contexto y no repetir lo que ya dijiste):\n${historyLines}`;
    }

    const startIndex = this.keyIndex % keys.length;
    this.keyIndex = (startIndex + 1) % keys.length;

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const apiKey = keys[(startIndex + attempt) % keys.length];
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }]
          })
        });

        if (!res.ok) {
          console.warn(`[Gemini AI] Token #${((startIndex + attempt) % keys.length) + 1} devolvió HTTP ${res.status}, probando siguiente...`);
          continue;
        }
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!reply) return null;
        if (reply.toUpperCase().includes('SILENCIO')) {
          return '__SILENCE__';
        }
        return reply;
      } catch (err) {
        console.warn('[Gemini AI]', err.message);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 2. RESPUESTAS PARA COMENTARIOS PÚBLICOS EN VIDEOS
  // ---------------------------------------------------------------------------
  async generateCommentResponse({ text }) {
    const rawText = (text || '').trim();
    const rules = this.config.rules || {};
    const aiEnabled = this.config.aiAgentEnabled !== false;

    // 2.1 FILTRO RÁPIDO DE SILENCIO (BROMAS, RISAS, MEMES) -> NO RESPONDER
    if (this.matchesKeywords(rawText, rules.silenceKeywords)) {
      return null;
    }

    // Comentarios casuales ultra-cortos que no preguntan nada
    const lower = rawText.toLowerCase();
    if (/^(hola|buenas|ok|buen video|saludos|genial|gracias|buena|ch[eé]vere|ya|video|si|no)$/i.test(lower)) {
      return null;
    }

    // 2.2 REGLAS DINÁMICAS DIRECTAS DEL CRM (Palabras clave fijas de Automatizaciones)
    // 2.2 REGLAS DINAMICAS DEL CRM (solo si rulesEnabled !== false)
    if (this.config.rulesEnabled !== false) {
      const commentRules = rules.comments || [];
      for (const rule of commentRules) {
        if (this.matchesKeywords(rawText, rule.keywords)) {
          return rule.response;
        }
      }
    }
    // 2.3 AGENTE DE IA: Solo si el switch de Agente IA está encendido
    if (aiEnabled) {
      const geminiReply = await this.consultGemini(rawText, false);
      if (geminiReply && geminiReply !== '__SILENCE__') {
        return geminiReply;
      }
    }

    // Si la IA está apagada o no encontró intención comercial -> Silencio total
    return null;
  }

  // ---------------------------------------------------------------------------
  // 3. RESPUESTAS PARA MENSAJES DIRECTOS (DMs PRIVADOS)
  // ---------------------------------------------------------------------------
  async generateResponse({ text, username, isDM = false, history = [] }) {
    if (!isDM) {
      const reply = await this.generateCommentResponse({ text, username });
      return {
        message: reply,
        followUp: null
      };
    }

    const rawText = (text || '').trim();
    const rules = this.config.rules || {};
    const aiEnabled = this.config.aiAgentEnabled !== false;

    const dmRules = rules.dms || [];

    // 3.1 EVALUAR REGLAS DINAMICAS DE DM (solo si rulesEnabled !== false)
    if (this.config.rulesEnabled !== false) {
      for (const rule of dmRules) {
        if (this.matchesKeywords(rawText, rule.keywords)) {
          return {
            message: rule.message,
            followUp: rule.sendWhatsappBubble ? this.getOfficialWhatsapp() : null
          };
        }
      }
    }
    // 3.2 CONSULTAR AL AGENTE DE IA (Solo si está encendido)
    if (aiEnabled) {
      const geminiReply = await this.consultGemini(rawText, true, history);
      if (geminiReply === '__SILENCE__') {
        return { message: null, followUp: null };
      }
      if (geminiReply) {
        return {
          message: geminiReply,
          followUp: this.getOfficialWhatsapp()
        };
      }
    }

    // 3.3 FALLBACK DE CIERRE DIRECTO A WHATSAPP
    const fallback = rules.fallback || {
      message: "Para una atención personalizada y pasarte fotos y precios exactos, por favor escríbenos al WhatsApp o llámanos 🙌",
      sendWhatsappBubble: true
    };

    return {
      message: fallback.message,
      followUp: fallback.sendWhatsappBubble ? this.getOfficialWhatsapp() : null
    };
  }
}
