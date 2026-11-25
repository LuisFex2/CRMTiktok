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
  // 1. RESPUESTAS PARA COMENTARIOS PÚBLICOS EN VIDEOS
  // ---------------------------------------------------------------------------
  generateCommentResponse({ text }) {
    const rawText = (text || '').trim();
    const rules = this.config.rules || {};

    // 1.1 FILTRO DE SILENCIO (BROMAS, RISAS, MEMES) -> NO RESPONDER
    if (this.matchesKeywords(rawText, rules.silenceKeywords)) {
      return null;
    }

    // Comentarios casuales ultra-cortos que no preguntan nada
    const lower = rawText.toLowerCase();
    if (/^(hola|buenas|ok|buen video|saludos|genial|gracias|buena|ch[eé]vere|ya|video|si|no)$/i.test(lower)) {
      return null;
    }

    // 1.2 REGLAS DINÁMICAS DE COMENTARIOS
    const commentRules = rules.comments || [];
    for (const rule of commentRules) {
      if (this.matchesKeywords(rawText, rule.keywords)) {
        return rule.response;
      }
    }

    // Si no coincide con ninguna intención comercial -> Silencio total
    return null;
  }

  // ---------------------------------------------------------------------------
  // 2. RESPUESTAS PARA MENSAJES DIRECTOS (DMs PRIVADOS)
  // ---------------------------------------------------------------------------
  async generateResponse({ text, username, isDM = false }) {
    if (!isDM) {
      const reply = this.generateCommentResponse({ text, username });
      return {
        message: reply,
        followUp: null
      };
    }

    const rawText = (text || '').trim();
    const rules = this.config.rules || {};
    const dmRules = rules.dms || [];

    // 2.1 EVALUAR REGLAS DINÁMICAS DE DM
    for (const rule of dmRules) {
      if (this.matchesKeywords(rawText, rule.keywords)) {
        return {
          message: rule.message,
          followUp: rule.sendWhatsappBubble ? this.getOfficialWhatsapp() : null
        };
      }
    }

    // 2.2 FALLBACK DE CIERRE DIRECTO A WHATSAPP
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
