document.getElementById("loginForm").addEventListener("submit", function(e){
  e.preventDefault();
  const rut = document.getElementById("rut").value;
  const passwd = document.getElementById("passwd").value;

  // Validación demostrativa
  if(rut === "12345678-9" && passwd === "clave123"){
    document.getElementById("resultado").innerText = "✅ Acceso concedido";
  } else {
    document.getElementById("resultado").innerText = "❌ Acceso denegado";
  }
});
