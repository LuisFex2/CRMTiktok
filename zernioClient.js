import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'https://zernio.com/api/v1';

export class ZernioClient {
  constructor(apiKey = process.env.ZERNIO_API_KEY) {
    this.apiKey = apiKey;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Obtener cuenta conectada de TikTok
   */
  async getAccounts() {
    const res = await fetch(`${BASE_URL}/accounts`, {
      method: 'GET',
      headers: this.headers
    });
    if (!res.ok) {
      throw new Error(`Zernio API error: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  }

  /**
   * Listar conversaciones de DMs recientes
   */
  async getConversations() {
    const res = await fetch(`${BASE_URL}/inbox/conversations`, {
      headers: this.headers
    });
    if (!res.ok) return { data: [] };
    return await res.json();
  }

  /**
   * Obtener mensajes de un hilo de conversación
   */
  async getConversationMessages(conversationId) {
    const res = await fetch(`${BASE_URL}/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
      headers: this.headers
    });
    if (!res.ok) return { messages: [] };
    return await res.json();
  }

  /**
   * Enviar mensaje directo (DM)
   */
  async sendDirectMessage({ accountId, conversationId, message }) {
    if (!conversationId) throw new Error('conversationId es requerido para DM');
    const res = await fetch(`${BASE_URL}/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ accountId, message })
    });
    return await res.json().catch(() => ({}));
  }

  /**
   * Listar publicaciones / videos con actividad reciente
   */
  async getRecentPosts(limit = 10) {
    const res = await fetch(`${BASE_URL}/inbox/comments?limit=${limit}`, {
      headers: this.headers
    });
    if (!res.ok) return { data: [] };
    return await res.json();
  }

  /**
   * Obtener comentarios en tiempo real de un video específico
   */
  async getPostComments(postId, accountId) {
    const res = await fetch(`${BASE_URL}/inbox/comments/${encodeURIComponent(postId)}?accountId=${accountId}`, {
      headers: this.headers
    });
    if (!res.ok) return { comments: [] };
    return await res.json();
  }

  /**
   * Responder a un comentario público en un video
   */
  async replyToComment({ accountId, postId, commentId, message }) {
    if (!postId) throw new Error('postId es requerido para responder comentario');
    const body = {
      accountId,
      message,
      ...(commentId ? { commentId } : {})
    };
    const res = await fetch(`${BASE_URL}/inbox/comments/${encodeURIComponent(postId)}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body)
    });
    return await res.json().catch(() => ({}));
  }
}
