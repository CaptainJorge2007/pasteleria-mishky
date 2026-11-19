const RUTA_DATOS = "data/productos.json";
const TODAS = "Todas";

const contControles = document.querySelector("#controles");
const contFiltros = document.querySelector("#filtros");
const grilla = document.querySelector("#grilla");
const estado = document.querySelector("#estado");
const aviso = document.querySelector("#aviso");
const plantilla = document.querySelector("#tpl-producto");
const dialogo = document.querySelector("#detalle");

let productos = [];
let categoriaActiva = TODAS;
let tarjetaAbierta = null;
const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

async function cargarProductos() {
  let respuesta;
  try {
    respuesta = await fetch(RUTA_DATOS);
  } catch {
    const e = new Error("Fallo de red");
    e.tipo = "red";
    throw e;
  }
  if (!respuesta.ok) {
    const e = new Error(`HTTP ${respuesta.status}`);
    e.tipo = "http";
    e.status = respuesta.status;
    throw e;
  }
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    const e = new Error("JSON inválido");
    e.tipo = "json";
    throw e;
  }
  if (!Array.isArray(datos)) {
    const e = new Error("El JSON debe ser un arreglo");
    e.tipo = "json";
    throw e;
  }
  return datos;
}

function validarProductos(lista) {
  const validos = [];
  const descartados = [];
  const idsVistos = new Set();
  const extensionesValidas = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

  lista.forEach((p, i) => {
    const motivos = [];
    if (typeof p !== "object" || p === null) {
      motivos.push("no es un objeto");
    } else {
      if (typeof p.id !== "number" || !Number.isFinite(p.id)) motivos.push("id no numérico");
      else if (idsVistos.has(p.id)) motivos.push("id repetido");
      if (typeof p.precio !== "number" || !(p.precio > 0)) motivos.push("precio no válido");
      if (!Number.isInteger(p.stock) || p.stock < 0) motivos.push("stock no válido");
      if (typeof p.categoria !== "string" || p.categoria.trim() === "") motivos.push("categoría vacía");
      if (typeof p.imagen !== "string" || !extensionesValidas.some(ext => p.imagen.toLowerCase().endsWith(ext))) motivos.push("imagen sin extensión válida");
      if (motivos.length === 0) idsVistos.add(p.id);
    }
    if (motivos.length > 0) descartados.push({ posicion: i, id: p?.id ?? "N/A", motivos });
    else validos.push(p);
  });

  if (descartados.length > 0) {
    console.warn(`Se descartaron ${descartados.length} producto(s):`);
    console.table(descartados);
    aviso.textContent = `Se descartaron ${descartados.length} producto(s) por datos inválidos.`;
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }
  return validos;
}

function obtenerCategorias(lista) {
  return [TODAS, ...new Set(lista.map((p) => p.categoria))];
}

function renderizarFiltros(categorias) {
  const fragmento = document.createDocumentFragment();
  categorias.forEach((cat) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "filtro";
    boton.dataset.categoria = cat;
    boton.setAttribute("aria-pressed", String(cat === categoriaActiva));
    fragmento.append(boton);
  });
  contFiltros.replaceChildren(fragmento);
}

function leerControles() {
  return {
    texto: document.querySelector("#buscador").value.trim().toLowerCase(),
    orden: document.querySelector("#orden").value,
    soloDisponibles: document.querySelector("#solo-disponibles").checked,
  };
}

function coincide(p, ctl) {
  const porCategoria = categoriaActiva === TODAS || p.categoria === categoriaActiva;
  const porTexto = p.nombre.toLowerCase().includes(ctl.texto);
  const porStock = !ctl.soloDisponibles || p.stock > 0;
  return porCategoria && porTexto && porStock;
}

function ordenar(lista, criterio) {
  const copia = [...lista];
  if (criterio === "precio-asc") copia.sort((a, b) => a.precio - b.precio);
  else if (criterio === "precio-desc") copia.sort((a, b) => b.precio - a.precio);
  else if (criterio === "nombre") copia.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return copia;
}

function crearTarjeta(p) {
  const nodo = plantilla.content.cloneNode(true);
  const tarjeta = nodo.querySelector(".tarjeta");
  const img = nodo.querySelector("img");
  const etiqueta = nodo.querySelector(".etiqueta");

  tarjeta.dataset.id = p.id;
  tarjeta.tabIndex = 0;

  img.alt = p.nombre;
  img.sizes = "(max-width: 600px) calc(100vw - 2rem), (max-width: 900px) 45vw, 280px";
  img.srcset = `${p.imagen} 300w, ${p.imagen} 600w, ${p.imagen} 900w`;
  img.src = p.imagen;

  img.addEventListener("load", () => tarjeta.classList.add("foto-cargada"));
  if (img.complete && img.naturalWidth > 0) tarjeta.classList.add("foto-cargada");

  img.onerror = () => {
    img.onerror = null;
    img.srcset = "";
    img.src = "img/sin-imagen.jpg";
    tarjeta.classList.add("foto-cargada");
  };

  nodo.querySelector(".tarjeta__categoria").textContent = p.categoria;
  nodo.querySelector(".tarjeta__nombre").textContent = p.nombre;
  nodo.querySelector(".tarjeta__descripcion").textContent = p.descripcion;
  nodo.querySelector(".tarjeta__precio").textContent = soles.format(p.precio);
  nodo.querySelector(".tarjeta__porciones").textContent = p.porciones > 1 ? `${p.porciones} porciones` : "1 unidad";

  if (p.stock === 0) {
    etiqueta.textContent = "Agotado";
    etiqueta.classList.add("etiqueta--agotado");
    etiqueta.hidden = false;
    tarjeta.classList.add("tarjeta--agotado");
  } else if (p.destacado) {
    etiqueta.textContent = "Favorito";
    etiqueta.hidden = false;
  }
  return nodo;
}

function actualizarContadores() {
  const ctl = leerControles();
  contFiltros.querySelectorAll(".filtro").forEach((boton) => {
    const cat = boton.dataset.categoria;
    const total = productos.filter((p) => (cat === TODAS || p.categoria === cat) && coincide(p, ctl)).length;
    boton.textContent = `${cat} (${total})`;
  });
}

function refrescar() {
  const ctl = leerControles();
  let lista = productos.filter((p) => coincide(p, ctl));
  lista = ordenar(lista, ctl.orden);

  if (lista.length === 0) {
    grilla.replaceChildren();
    estado.textContent = "No hay productos que coincidan con su búsqueda.";
  } else {
    const fragmento = document.createDocumentFragment();
    lista.forEach((p) => fragmento.append(crearTarjeta(p)));
    grilla.replaceChildren(fragmento);
    
    let msg = `Mostrando ${lista.length} productos`;
    if (categoriaActiva !== TODAS) msg += ` en «${categoriaActiva}»`;
    if (ctl.texto) msg += ` con «${ctl.texto}» en el nombre`;
    if (ctl.soloDisponibles) msg += " (solo disponibles)";
    estado.textContent = msg + ".";
  }
  actualizarContadores();
}

function mostrarFantasmas() {
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < 8; i++) {
    const li = document.createElement("li");
    li.className = "tarjeta tarjeta--fantasma";
    li.setAttribute("aria-hidden", "true");
    fragmento.append(li);
  }
  grilla.replaceChildren(fragmento);
}

function mensajeError(error) {
  if (error.tipo === "http" && error.status === 404) return "No se encontró el archivo de productos (404).";
  if (error.tipo === "json") return "El archivo tiene un formato incorrecto (JSON inválido).";
  return "No se pudo cargar el catálogo. Verifique su conexión o Live Server.";
}

function mostrarError(error) {
  grilla.replaceChildren();
  estado.classList.add("estado--error");
  estado.innerHTML = `${mensajeError(error)} <button id="btn-reintentar" class="btn-reintentar">Reintentar</button>`;
  document.querySelector("#btn-reintentar").focus();
  document.querySelector("#btn-reintentar").addEventListener("click", iniciar);
}

contFiltros.addEventListener("click", (evento) => {
  const boton = evento.target.closest(".filtro");
  if (!boton || boton.dataset.categoria === categoriaActiva) return;
  categoriaActiva = boton.dataset.categoria;
  contFiltros.querySelectorAll(".filtro").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.categoria === categoriaActiva)));
  history.replaceState(null, "", categoriaActiva === TODAS ? "" : "#" + encodeURIComponent(categoriaActiva));
  refrescar();
});

contControles.addEventListener("input", (evento) => {
  if (evento.target.matches("#buscador")) refrescar();
});

contControles.addEventListener("change", (evento) => {
  if (evento.target.matches("#orden, #solo-disponibles")) refrescar();
});

grilla.addEventListener("click", (evento) => {
  const tarjeta = evento.target.closest(".tarjeta[data-id]");
  if (tarjeta) abrirDetalle(tarjeta);
});

grilla.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" || evento.key === " ") {
    const tarjeta = evento.target.closest(".tarjeta[data-id]");
    if (tarjeta) {
      evento.preventDefault();
      abrirDetalle(tarjeta);
    }
  }
});

function abrirDetalle(tarjeta) {
  const id = Number(tarjeta.dataset.id);
  const p = productos.find((prod) => prod.id === id);
  if (!p) return;

  tarjetaAbierta = tarjeta;
  dialogo.querySelector(".detalle__img").src = p.imagen;
  dialogo.querySelector(".detalle__img").alt = p.nombre;
  dialogo.querySelector(".detalle__categoria").textContent = p.categoria;
  dialogo.querySelector(".detalle__nombre").textContent = p.nombre;
  dialogo.querySelector(".detalle__descripcion").textContent = p.descripcion;
  dialogo.querySelector(".detalle__precio").textContent = soles.format(p.precio);
  dialogo.querySelector(".detalle__stock").textContent = p.stock > 0 ? `Stock: ${p.stock} unidades` : "Agotado";

  dialogo.showModal();
}

dialogo.addEventListener("close", () => {
  if (tarjetaAbierta) {
    tarjetaAbierta.focus();
    tarjetaAbierta = null;
  }
});

dialogo.querySelector(".detalle__cerrar").addEventListener("click", () => {
  dialogo.close();
});

window.addEventListener("hashchange", () => {
  const categorias = obtenerCategorias(productos);
  const cat = categoriaDesdeHash(categorias);
  if (cat !== categoriaActiva) {
    categoriaActiva = cat;
    contFiltros.querySelectorAll(".filtro").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.categoria === cat)));
    refrescar();
  }
});

function categoriaDesdeHash(categorias) {
  const crudo = location.hash.slice(1);
  if (crudo === "") return TODAS;
  let cat;
  try {
    cat = decodeURIComponent(crudo);
  } catch {
    return TODAS;
  }
  return categorias.includes(cat) ? cat : TODAS;
}

async function iniciar() {
  estado.textContent = "Cargando productos...";
  estado.classList.remove("estado--error");
  grilla.setAttribute("aria-busy", "true");
  mostrarFantasmas();
  try {
    const datos = await cargarProductos();
    productos = validarProductos(datos);
    const categorias = obtenerCategorias(productos);
    categoriaActiva = categoriaDesdeHash(categorias);
    if (categoriaActiva !== TODAS) {
      history.replaceState(null, "", "#" + encodeURIComponent(categoriaActiva));
    }
    renderizarFiltros(categorias);
    contFiltros.querySelectorAll(".filtro").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.categoria === categoriaActiva)));
    refrescar();
  } catch (error) {
    console.error(error);
    mostrarError(error);
  } finally {
    grilla.setAttribute("aria-busy", "false");
  }
}

iniciar();