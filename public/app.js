// Estado global
let comments = [];
let currentFilter = 'all';

// Elementos DOM
const commentsList = document.getElementById('commentsList');
const autoReplyToggle = document.getElementById('autoReplyToggle');
const toggleStatusText = document.getElementById('toggleStatusText');

const statTotalComments = document.getElementById('statTotalComments');
const statAiReplies = document.getElementById('statAiReplies');
const statManualReplies = document.getElementById('statManualReplies');
const statRate = document.getElementById('statRate');

// 1. Cargar Estado Inicial y Status de Conexión
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.ok) {
      if (data.account) {
        document.getElementById('accUsername').textContent = `@${data.account.username || 'rematesvillaelsalvador'}`;
        document.getElementById('accFollowers').textContent = `${((data.account.followersCount || 16975) / 1000).toFixed(1)}K seguidores • Conectado`;
      }
      autoReplyToggle.checked = !!data.autoReplyEnabled;
      updateToggleLabel(data.autoReplyEnabled);
    }
  } catch (err) {
    console.warn('Error al cargar status:', err);
  }
}

// 2. Cargar Interacciones y Métricas
async function loadComments() {
  try {
    const res = await fetch('/api/comments');
    const data = await res.json();
    if (data.ok) {
      comments = data.comments || [];
      renderStats(data.stats);
      renderComments();
    }
  } catch (err) {
    console.warn('Error al cargar comentarios:', err);
  }
}

function renderStats(stats) {
  if (!stats) return;
  statTotalComments.textContent = stats.totalComments || 0;
  statAiReplies.textContent = stats.aiReplies || 0;
  statManualReplies.textContent = stats.manualReplies || 0;

  const total = stats.totalComments || 0;
  const replied = stats.totalReplies || 0;
  const rate = total > 0 ? Math.round((replied / total) * 100) : 100;
  statRate.textContent = `${rate}%`;
}

function renderComments() {
  let filtered = comments;
  if (currentFilter === 'dms') {
    filtered = comments.filter(c => c.conversationId || c.postId === 'dm_thread');
  } else if (currentFilter === 'comments') {
    filtered = comments.filter(c => !c.conversationId && c.postId !== 'dm_thread');
  } else if (currentFilter === 'replied') {
    filtered = comments.filter(c => c.status === 'replied');
  } else if (currentFilter === 'pending') {
    filtered = comments.filter(c => c.status === 'pending');
  }

  if (filtered.length === 0) {
    commentsList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📥</span>
        <p>${currentFilter === 'all' ? 'Bandeja al día' : 'No hay elementos en este filtro'}</p>
        <small>Las nuevas interacciones de TikTok se sincronizan en tiempo real.</small>
      </div>
    `;
    return;
  }

  commentsList.innerHTML = filtered.map(c => {
    const timeFormatted = new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isReplied = c.status === 'replied';
    const isDM = !!(c.conversationId || c.postId === 'dm_thread');

    return `
      <div class="comment-card" id="card-${c.id}">
        <div class="comment-top">
          <div class="user-tag">
            <span>${isDM ? '💬' : '🎬'}</span>
            <span>@${c.username}</span>
            <small style="color:var(--text-dim); font-size:0.7rem;">(${isDM ? 'DM Privado' : 'Comentario en Video'})</small>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="${isReplied ? 'badge-replied' : 'badge-pending'}">
              ${isReplied ? (c.replySource === 'ai' ? '⚡ Automatización IA' : '👤 Respuesta Manual') : '⏳ Pendiente'}
            </span>
            <span class="comment-time">${timeFormatted}</span>
            <button onclick="deleteComment('${c.id}')" style="background:none; border:none; cursor:pointer; font-size:0.85rem; opacity:0.6;" title="Eliminar del registro">🗑️</button>
          </div>
        </div>

        <div class="comment-body">
          "${escapeHtml(c.text)}"
        </div>

        ${isReplied ? `
          <div class="reply-bubble">
            <div class="reply-header">
              <span>${c.replySource === 'ai' ? '⚡ Automatización IA' : '👤 Atención Manual'}</span>
              <span>Entregado a TikTok</span>
            </div>
            <div class="reply-text">${escapeHtml(c.replyText || '')}</div>
          </div>
        ` : `
          <div style="margin-top:0.6rem; display:flex; gap:0.5rem;">
            <button class="btn-chip" onclick="quickAiReply('${c.id}', '${encodeURIComponent(c.text)}', '${c.username}', '${c.postId}')">⚡ Responder con IA</button>
          </div>
        `}

        ${c.conversationId ? `
          <div style="margin-top:0.75rem; border-top:1px solid rgba(255,255,255,0.06); padding-top:0.6rem;">
            <span style="font-size:0.7rem; color:var(--text-dim); display:block; margin-bottom:0.35rem; font-weight:600;">⚡ Plantillas de respuesta rápida:</span>
            <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
              <button class="btn-chip" onclick="sendQuickTemplate('${c.conversationId}', 'Ubicación')">📍 Ubicación</button>
              <button class="btn-chip" onclick="sendQuickTemplate('${c.conversationId}', 'Disponible')">📦 Disponible</button>
              <button class="btn-chip" onclick="sendQuickTemplate('${c.conversationId}', 'Agotado')">🚫 Agotado</button>
              <button class="btn-chip" onclick="sendQuickTemplate('${c.conversationId}', 'Tarjeta')">💳 Tarjeta</button>
              <button class="btn-chip" onclick="sendQuickTemplate('${c.conversationId}', 'Envíos')">🏬 Envíos</button>
              <button class="btn-chip" onclick="sendQuickTemplate('${c.conversationId}', 'Catalogo')">📖 Catálogo</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 3. Toggle de Automatización IA
autoReplyToggle.addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  updateToggleLabel(enabled);

  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReplyEnabled: enabled })
    });
  } catch (err) {
    console.error('Error al actualizar autoReply:', err);
  }
});

function updateToggleLabel(enabled) {
  if (enabled) {
    toggleStatusText.textContent = 'ACTIVADA';
    toggleStatusText.style.color = '#10b981';
  } else {
    toggleStatusText.textContent = 'PAUSADA';
    toggleStatusText.style.color = '#ef4444';
  }
}

// 4. Filtrado de Inbox
document.querySelectorAll('.filter-btn').forEach(btn => {
  if (btn.getAttribute('data-filter')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderComments();
    });
  }
});

// 5. Enviar Plantilla Rápida
async function sendQuickTemplate(conversationId, category) {
  try {
    const res = await fetch('/api/send-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, category })
    });
    const data = await res.json();
    if (data.ok) {
      loadComments();
    }
  } catch (err) {
    alert('Error al enviar plantilla: ' + err.message);
  }
}

// 6. Respuesta Instantánea con IA para elemento pendiente
async function quickAiReply(id, encodedText, username, postId, conversationId) {
  const text = decodeURIComponent(encodedText);
  try {
    const res = await fetch('/api/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, text, username, postId, conversationId })
    });
    const data = await res.json();
    if (data.ok) {
      loadComments();
    } else {
      alert(data.error || 'No se pudo generar respuesta');
    }
  } catch (err) {
    alert('Error al responder: ' + err.message);
  }
}

// 7. Eliminar Elemento Individual
async function deleteComment(id) {
  try {
    const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.ok) {
      comments = comments.filter(c => c.id !== id && c.conversationId !== id);
      renderComments();
    }
  } catch (err) {
    console.error('Error al eliminar:', err);
  }
}

// 8. Limpiar Historial Completo
async function clearHistory() {
  if (!confirm('¿Deseas vaciar la vista de la bandeja de mensajes?')) return;
  try {
    const res = await fetch('/api/clear-history', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      comments = [];
      renderStats({ totalComments: 0, totalReplies: 0, aiReplies: 0, manualReplies: 0 });
      renderComments();
    }
  } catch (err) {
    console.error('Error al limpiar historial:', err);
  }
}

// 9. Simulador de Flujos
const simulatorForm = document.getElementById('simulatorForm');
const simResult = document.getElementById('simResult');
const simResultText = document.getElementById('simResultText');

simulatorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('simUser').value.trim();
  const text = document.getElementById('simText').value.trim();
  const btn = document.getElementById('btnSimulate');

  btn.disabled = true;
  btn.textContent = '⚡ Procesando respuesta...';

  try {
    const res = await fetch('/api/simulate-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, text, isDM: true })
    });
    const data = await res.json();
    if (data.ok) {
      simResult.style.display = 'block';
      simResultText.textContent = data.replyText;
      loadComments();
    }
  } catch (err) {
    alert('Error en simulación: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Probar Respuesta Automática';
  }
});

function setQuickSim(txt) {
  document.getElementById('simText').value = txt;
}

// 10. Configuración de Negocio
async function loadBusinessConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.businessInfo) {
      document.getElementById('cfgBusinessName').value = data.businessName || '';
      document.getElementById('cfgWhatsapp').value = data.businessInfo.whatsapp || '';
      document.getElementById('cfgAddress').value = data.businessInfo.address || '';
      document.getElementById('cfgHours').value = data.businessInfo.openingHours || '';
      document.getElementById('cfgDelivery').value = data.businessInfo.delivery || '';
      document.getElementById('cfgPayments').value = data.businessInfo.cardPayment || '';
    }
    const replyModeSelect = document.getElementById('cfgReplyMode');
    if (replyModeSelect) {
      replyModeSelect.value = data.replyMode || 'hybrid';
    }
    const geminiKeyInput = document.getElementById('cfgGeminiKey');
    if (geminiKeyInput) {
      geminiKeyInput.value = data.geminiApiKey || '';
    }
  } catch (err) {
    console.warn('Error al cargar config:', err);
  }
}

const configForm = document.getElementById('configForm');
if (configForm) {
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveNotice = document.getElementById('saveNotice');
    saveNotice.textContent = 'Guardando...';

    const payload = {
      businessName: document.getElementById('cfgBusinessName').value,
      businessInfo: {
        whatsapp: document.getElementById('cfgWhatsapp').value,
        address: document.getElementById('cfgAddress').value,
        openingHours: document.getElementById('cfgHours').value,
        delivery: document.getElementById('cfgDelivery').value,
        cardPayment: document.getElementById('cfgPayments').value
      }
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        saveNotice.textContent = '✅ Datos de tienda guardados con éxito';
        setTimeout(() => { saveNotice.textContent = ''; }, 3000);
      }
    } catch (err) {
      saveNotice.textContent = '❌ Error al guardar';
    }
  });
}

// 11. Formulario de Integración API & Tokens
const apiSettingsForm = document.getElementById('apiSettingsForm');
if (apiSettingsForm) {
  apiSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const notice = document.getElementById('apiSaveNotice');
    if (notice) {
      notice.textContent = 'Guardando...';
      notice.style.color = '#F59E0B';
    }

    const payload = {
      replyMode: document.getElementById('cfgReplyMode')?.value || 'hybrid',
      geminiApiKey: document.getElementById('cfgGeminiKey')?.value.trim() || ''
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        if (notice) {
          notice.textContent = '✅ Token y Modo de IA guardados con éxito';
          notice.style.color = '#10B981';
          setTimeout(() => { notice.textContent = ''; }, 3500);
        }
      }
    } catch (err) {
      if (notice) {
        notice.textContent = '❌ Error al guardar';
        notice.style.color = '#EF4444';
      }
    }
  });
}

function copyWebhookUrl() {
  const copyText = document.getElementById('webhookUrlInput');
  copyText.select();
  navigator.clipboard.writeText(copyText.value);
  alert('URL copiada al portapapeles');
}

// Inicialización
loadStatus();
loadComments();
loadBusinessConfig();

// Polling de la interfaz cada 5s para refrescar métricas e inbox
setInterval(loadComments, 5000);

// -------------------------------------------------------------
// 11. EDITOR DINÁMICO DE REGLAS Y PALABRAS CLAVE (ESTILO MANYCHAT)
// -------------------------------------------------------------
let currentRules = { comments: [], dms: [], silenceKeywords: '', fallback: {} };

async function loadRules() {
  try {
    const res = await fetch('/api/rules');
    const data = await res.json();
    if (data.ok && data.rules) {
      currentRules = data.rules;
      renderRulesEditor();
    }
  } catch (err) {
    console.warn('Error al cargar reglas:', err);
  }
}

function renderRulesEditor() {
  // 1. Filtro de silencio
  const silenceInput = document.getElementById('rulesSilenceKeywords');
  if (silenceInput) {
    silenceInput.value = currentRules.silenceKeywords || '';
  }

  // 2. Reglas para Comentarios
  const commentsContainer = document.getElementById('commentsRulesList');
  if (commentsContainer) {
    const cmList = currentRules.comments || [];
    commentsContainer.innerHTML = cmList.map((rule, idx) => `
      <div class="rule-box" id="rule-cm-${idx}">
        <div class="rule-box-header">
          <span class="rule-title">${escapeHtml(rule.title || 'Regla ' + (idx + 1))}</span>
          <span class="rule-pill">Comentario en Video</span>
        </div>
        <label class="rule-label">Palabras clave / Frases (separadas por coma):</label>
        <input type="text" class="rule-input" id="cm-kw-${idx}" value="${escapeHtml(rule.keywords || '')}">
        <label class="rule-label">Respuesta que publicará el bot:</label>
        <textarea class="rule-textarea" rows="2" id="cm-resp-${idx}">${escapeHtml(rule.response || '')}</textarea>
      </div>
    `).join('');
  }

  // 3. Reglas para DMs
  const dmsContainer = document.getElementById('dmsRulesList');
  if (dmsContainer) {
    const dmList = currentRules.dms || [];
    dmsContainer.innerHTML = dmList.map((rule, idx) => `
      <div class="rule-box" id="rule-dm-${idx}">
        <div class="rule-box-header">
          <span class="rule-title">${escapeHtml(rule.title || 'Regla DM ' + (idx + 1))}</span>
          <span class="rule-pill ${rule.sendWhatsappBubble ? 'pill-wa' : ''}">
            ${rule.sendWhatsappBubble ? '2 Bloques (+ WhatsApp)' : '1 Bloque (Sin Número)'}
          </span>
        </div>
        <label class="rule-label">Palabras clave / Frases (separadas por coma):</label>
        <input type="text" class="rule-input" id="dm-kw-${idx}" value="${escapeHtml(rule.keywords || '')}">
        <label class="rule-label">Mensaje en el chat:</label>
        <textarea class="rule-textarea" rows="2" id="dm-msg-${idx}">${escapeHtml(rule.message || '')}</textarea>
        <label class="checkbox-row">
          <input type="checkbox" id="dm-wa-${idx}" ${rule.sendWhatsappBubble ? 'checked' : ''}>
          <span>Enviar número de WhatsApp en 2º bloque limpio (994516143)</span>
        </label>
      </div>
    `).join('');
  }

  // 4. Fallback de cierre
  const fallbackInput = document.getElementById('rulesFallbackMessage');
  if (fallbackInput && currentRules.fallback) {
    fallbackInput.value = currentRules.fallback.message || '';
  }
}

async function saveAllRules() {
  const notice = document.getElementById('rulesSaveNotice');
  if (notice) notice.textContent = 'Guardando...';

  // Recolectar silencio
  const silenceKeywords = document.getElementById('rulesSilenceKeywords')?.value || '';

  // Recolectar comentarios
  const updatedComments = (currentRules.comments || []).map((rule, idx) => {
    const kw = document.getElementById(`cm-kw-${idx}`)?.value || '';
    const resp = document.getElementById(`cm-resp-${idx}`)?.value || '';
    return { ...rule, keywords: kw, response: resp };
  });

  // Recolectar DMs
  const updatedDms = (currentRules.dms || []).map((rule, idx) => {
    const kw = document.getElementById(`dm-kw-${idx}`)?.value || '';
    const msg = document.getElementById(`dm-msg-${idx}`)?.value || '';
    const wa = document.getElementById(`dm-wa-${idx}`)?.checked ?? false;
    return { ...rule, keywords: kw, message: msg, sendWhatsappBubble: wa };
  });

  // Recolectar Fallback
  const fallbackMsg = document.getElementById('rulesFallbackMessage')?.value || '';
  const updatedFallback = {
    message: fallbackMsg,
    sendWhatsappBubble: true
  };

  const payload = {
    silenceKeywords,
    comments: updatedComments,
    dms: updatedDms,
    fallback: updatedFallback
  };

  try {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      currentRules = data.rules;
      if (notice) {
        notice.textContent = '✅ ¡Reglas y palabras clave guardadas al instante!';
        notice.style.color = '#10B981';
        setTimeout(() => { notice.textContent = ''; }, 3500);
      }
    } else {
      throw new Error(data.error || 'Error al guardar');
    }
  } catch (err) {
    if (notice) {
      notice.textContent = '❌ Error al guardar reglas';
      notice.style.color = '#EF4444';
    }
  }
}

// Cargar reglas al inicio
loadRules();

// -------------------------------------------------------------
// 12. MENÚ HAMBURGUESA & NAVEGACIÓN MÓVIL POR VISTAS DIRECTAS
// -------------------------------------------------------------
const menuToggle = document.getElementById('menuToggle');
const mobileDrawer = document.getElementById('mobileDrawer');
const drawerClose = document.getElementById('drawerClose');
const drawerBackdrop = document.getElementById('drawerBackdrop');

function openDrawer() {
  if (mobileDrawer) mobileDrawer.classList.add('open');
  if (drawerBackdrop) drawerBackdrop.classList.add('open');
}

function closeDrawer() {
  if (mobileDrawer) mobileDrawer.classList.remove('open');
  if (drawerBackdrop) drawerBackdrop.classList.remove('open');
}

if (menuToggle) menuToggle.addEventListener('click', openDrawer);
if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

// Función universal de cambio de vista (Pantalla completa en PC y Celular)
function switchView(viewName) {
  closeDrawer();

  // Actualizar botones de vista activa
  document.querySelectorAll('.drawer-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });
  document.querySelectorAll('.m-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  const tabMapping = {
    'inbox': null,
    'rules': 'rulesEditorTab',
    'simulator': 'simulatorTab',
    'config': 'configTab',
    'api': 'webhookTab'
  };

  if (viewName === 'inbox') {
    document.body.classList.remove('view-section', 'mobile-view-section');
    document.body.classList.add('view-inbox', 'mobile-view-inbox');
  } else {
    document.body.classList.remove('view-inbox', 'mobile-view-inbox');
    document.body.classList.add('view-section', 'mobile-view-section');

    const targetTabId = tabMapping[viewName];
    if (targetTabId) {
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === targetTabId);
      });
    }
  }

  // Scroll instantáneo al tope para no obligar a bajar
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Eventos en los items del Menú Hamburguesa
document.querySelectorAll('.drawer-item').forEach(item => {
  item.addEventListener('click', () => {
    switchView(item.dataset.view);
  });
});

// Eventos en los botones de cápsula de la barra superior
document.querySelectorAll('.m-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
  });
});
