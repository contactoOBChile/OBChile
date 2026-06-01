fetch(API_URL)
  .then(res => res.json())
  .then(cfg => {
    contenedor.innerHTML = "";
    let contador = 1;

    if(cfg.mostrarVisualizacion === "on"){
      // Solo mostrar Visualización
      if(cfg.producto3 && cfg.producto3.trim() !== ""){
        contenedor.innerHTML += `
          <div class="producto">
            <label>
              <input type="radio" name="opcion" value="producto3"> 
              <span>${contador}.- ${cfg.producto3}</span>
            </label>
          </div>`;
      }
    } else {
      // Mostrar producto1 y producto2 normalmente
      if(cfg.producto1 && cfg.producto1.trim() !== ""){
        contenedor.innerHTML += `
          <div class="producto">
            <label>
              <input type="radio" name="opcion" value="producto1"> 
              <span>${contador}.- ${cfg.producto1} por ${cfg.monto1 ? formatoCLP(cfg.monto1) : ""}</span>
            </label>
          </div>`;
        contador++;
      }

      if(cfg.producto2 && cfg.producto2.trim() !== ""){
        contenedor.innerHTML += `
          <div class="producto">
            <label>
              <input type="radio" name="opcion" value="producto2"> 
              <span>${contador}.- ${cfg.producto2} por ${cfg.monto2 ? formatoCLP(cfg.monto2) : ""}</span>
            </label>
          </div>`;
        contador++;
      }
    }

    tipoAutorizacion = cfg.tipoAutorizacion || "coordenadas";
  });
