import dotenv from 'dotenv';
dotenv.config();

export class AIEngine {
  constructor(config = {}) {
    this.config = config;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
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
  async consultGemini(text, isDM = false) {
    const apiKey = this.config.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const phone = this.getOfficialWhatsapp();
    const address = this.config.businessInfo?.address || 'Av. Velasco Alvarado 718, Villa El Salvador';
    const store = this.config.businessName || 'Remates Villa El Salvador';

    const systemPrompt = `Eres el asistente oficial de ventas en TikTok de la tienda "${store}".
Ubicación física: ${address}.
WhatsApp oficial de ventas: ${phone}.
Reglas de negocio:
- Solo atendemos y vendemos en tienda física en Villa El Salvador. NO hacemos envíos ni delivery.
- Aceptamos tarjeta (con 5% de recargo POS), Yape o transferencia.
- Productos: electrodomésticos nuevos de exhibición y liquidación con garantía probada (lavadoras, frijider, refrigeradoras, secadoras, cocinas, muebles, televisores).

El usuario escribió el siguiente mensaje o comentario en TikTok:
"${text}"

Instrucciones de clasificación y respuesta:
1. Si el comentario es un meme, risas (jajaja, xd, 😂), crítica vacía, broma o NO tiene ninguna intención de compra o consulta sobre productos/tienda, responde ÚNICAMENTE la palabra: SILENCIO
2. Si el usuario tiene intención de compra, consulta de modelos, stock, precios, marcas (incluso con faltas de ortografía o modismos peruanos como "stok", "keda", "frijider", "a cuanto", "disponivle", "hay"):
   - Responde amablemente en 1 o máximo 2 oraciones directas, cordiales y comerciales invitando a escribir al WhatsApp ${phone} para pasarle fotos reales de los modelos disponibles en tienda.
   - En comentarios públicos NUNCA incluyas enlaces web (URLs), solo menciona el WhatsApp ${phone}.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      });

      if (!res.ok) return null;
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!reply || reply.toUpperCase().includes('SILENCIO')) {
        return null;
      }
      return reply;
    } catch (err) {
      console.warn('[Gemini AI]', err.message);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. RESPUESTAS PARA COMENTARIOS PÚBLICOS EN VIDEOS
  // ---------------------------------------------------------------------------
  async generateCommentResponse({ text }) {
    const rawText = (text || '').trim();
    const rules = this.config.rules || {};
    const mode = this.config.replyMode || 'hybrid';

    // 2.1 FILTRO RÁPIDO DE SILENCIO (BROMAS, RISAS, MEMES) -> NO RESPONDER
    if (this.matchesKeywords(rawText, rules.silenceKeywords)) {
      return null;
    }

    // Comentarios casuales ultra-cortos que no preguntan nada
    const lower = rawText.toLowerCase();
    if (/^(hola|buenas|ok|buen video|saludos|genial|gracias|buena|ch[eé]vere|ya|video|si|no)$/i.test(lower)) {
      return null;
    }

    // MODO SOLO IA: Salta las palabras fijas y consulta directamente a Gemini
    if (mode === 'gemini_only') {
      return await this.consultGemini(rawText, false);
    }

    // 2.2 REGLAS DINÁMICAS DIRECTAS DEL CRM (Palabras clave)
    const commentRules = rules.comments || [];
    for (const rule of commentRules) {
      if (this.matchesKeywords(rawText, rule.keywords)) {
        return rule.response;
      }
    }

    // SI EL MODO ES 'rules_only', NO llama a Gemini y guarda silencio si no hay coincidencia
    if (mode === 'rules_only') {
      return null;
    }

    // 2.3 MODO HÍBRIDO (DEFAULT): Si ninguna regla fija coincidió, la IA analiza y rescata
    const geminiReply = await this.consultGemini(rawText, false);
    if (geminiReply) {
      return geminiReply;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // 3. RESPUESTAS PARA MENSAJES DIRECTOS (DMs PRIVADOS)
  // ---------------------------------------------------------------------------
  async generateResponse({ text, username, isDM = false }) {
    if (!isDM) {
      const reply = await this.generateCommentResponse({ text, username });
      return {
        message: reply,
        followUp: null
      };
    }

    const rawText = (text || '').trim();
    const rules = this.config.rules || {};
    const mode = this.config.replyMode || 'hybrid';
    const dmRules = rules.dms || [];

    // MODO SOLO IA EN DMS
    if (mode === 'gemini_only') {
      const geminiReply = await this.consultGemini(rawText, true);
      if (geminiReply) {
        return {
          message: geminiReply,
          followUp: this.getOfficialWhatsapp()
        };
      }
    }

    // 3.1 EVALUAR REGLAS DINÁMICAS DE DM (Palabras clave)
    for (const rule of dmRules) {
      if (this.matchesKeywords(rawText, rule.keywords)) {
        return {
          message: rule.message,
          followUp: rule.sendWhatsappBubble ? this.getOfficialWhatsapp() : null
        };
      }
    }

    // 3.2 SI EL MODO ES HÍBRIDO: Consultar a Gemini si no coincidió con ninguna regla fija
    if (mode === 'hybrid') {
      const geminiReply = await this.consultGemini(rawText, true);
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
