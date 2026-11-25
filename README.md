# TikTok AI CRM & Automation Platform 🚀

Sistema inteligente de automatización conversacional y CRM para **TikTok**, diseñado para la cuenta `@rematesvillaelsalvador` (Remates Villa El Salvador / Grupo Rhinn SAC).

---

## 🌟 Capacidades del Sistema

1. **Sincronización en Tiempo Real:**
   - **Mensajes Directos (DMs Privados):** Clasificación de intención con regla estricta de entrega:
     - **1 Bloque:** Saludos iniciales, agradecimientos ("Gracias", "Listo"), horarios, ubicación exacta, medios de pago y política de envíos.
     - **2 Bloques:** Consultas de catálogo, stock, modelos, precios o solicitud de contacto. El Bloque 1 contiene el mensaje comercial y el Bloque 2 entrega la burbuja limpia con el WhatsApp (`994516143`) para fácil copiado en celular.
   - **Comentarios en Videos:** Respuesta pública rápida etiquetando al usuario (`@usuario`) con llamada a la acción hacia WhatsApp.

2. **Bandeja Unificada de Conversión (TikTok Smart Inbox):**
   - Panel web responsive inspirado en plataformas SaaS (ManyChat / Kommo).
   - Filtros por: *Todos*, *DMs Privados*, *Comentarios en Videos*.
   - Botones de respuesta rápida en 1 clic (*Ubicación, Stock, Agotado, Tarjeta, Envíos, Catálogo*).
   - Limpieza y eliminación individual de registros.

3. **Simulador de Flujos IA:**
   - Prueba de respuestas y validación de reglas de negocio en milisegundos.

---

## 📁 Estructura del Proyecto

```text
CRMTiktok/
├── config.json          # Datos de tienda, horarios, plantillas y WhatsApp
├── aiEngine.js          # Motor de clasificación de intenciones y generación de respuestas
├── zernioClient.js      # Cliente SDK modular para la API
├── db.js                # Gestor de base de datos local JSON
├── server.js            # Servidor Express y bucles de sincronización
├── data/
│   ├── db.json          # Registro histórico de interacciones
│   └── processed.json   # Deduplicación de mensajes procesados
├── public/
│   ├── index.html       # Dashboard web
│   ├── styles.css       # Estilos CSS dark theme enterprise
│   └── app.js           # Lógica del cliente web
├── .env                 # API Key y puerto
└── README.md            # Documentación técnica
```

---

## 🚀 Cómo Iniciar en tu Computadora (Windows / Mac / Linux)

1. **Instalar dependencias (solo la primera vez):**
   ```bash
   npm install
   ```
2. **Iniciar la plataforma:**
   ```bash
   npm start
   ```
3. **Abrir el CRM:**
   Ingresa en tu navegador a:
   👉 `http://localhost:3000`

---

## 📱 Cómo Ejecutar 24/7 en un Celular Android (Termux)

Si no deseas tener tu computadora encendida todo el día, puedes correrlo directamente en un celular con Termux:

1. **Instalar Termux:**
   Descárgalo desde **F-Droid** (o el GitHub oficial de Termux). *No uses la versión de Google Play Store.*

2. **Instalar Node.js y Git:**
   Abre Termux y escribe:
   ```bash
   pkg update -y && pkg install nodejs git -y
   ```

3. **Clonar el proyecto y entrar a la carpeta:**
   ```bash
   git clone https://github.com/LuisFex2/CRMTiktok.git
   cd CRMTiktok
   npm install
   ```

4. **Crear archivo de configuración:**
   ```bash
   cat << 'EOF' > .env
   ZERNIO_API_KEY=sk_65c7b23d3c7810d72fd8cf51377e553086af620ae49ecd7b5f03cb5a00779b79
   PORT=3000
   EOF
   ```

5. **Evitar que Android duerma el proceso:**
   ```bash
   termux-wake-lock
   ```

6. **Iniciar el servidor:**
   ```bash
   npm start
   ```

7. **Abrir el CRM en tu móvil:**
   Abre Chrome en tu celular y entra a:
   👉 `http://localhost:3000`
