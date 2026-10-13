const canvas = document.getElementById("canvasBezier");
const ctx = canvas.getContext("2d");

const btnAgregar = document.getElementById("agregarPunto");
const btnReiniciar = document.getElementById("reiniciar");
const btnQuitar = document.getElementById("quitarPunto");
const btnGuardar = document.getElementById("guardarImagen");

canvas.style.touchAction = "none";

let puntos = [];
let puntoSeleccionado = null;
let radioPunto = 9;

const proporcionCanvas = 600 / 900;

// -----------------------------
// RESPONSIVE
// -----------------------------
function ajustarCanvas() {
  const contenedor = canvas.parentElement;

  const anchoAnterior = canvas.width || 900;
  const altoAnterior = canvas.height || 600;

  const anchoNuevo = Math.min(contenedor.clientWidth, 900);
  const altoNuevo = anchoNuevo * proporcionCanvas;

  const escalaX = anchoNuevo / anchoAnterior;
  const escalaY = altoNuevo / altoAnterior;

  canvas.width = anchoNuevo;
  canvas.height = altoNuevo;

  puntos = puntos.map(p => ({
    x: p.x * escalaX,
    y: p.y * escalaY
  }));

  dibujar();
}

// -----------------------------
// INICIO
// -----------------------------
function iniciar() {
  puntos = [
    { x: canvas.width * 0.2, y: canvas.height * 0.7 },
    { x: canvas.width * 0.8, y: canvas.height * 0.3 }
  ];

  puntoSeleccionado = null;
  actualizarBotonQuitar();
  dibujar();
}

// -----------------------------
// CONTROLES
// -----------------------------
function agregarPuntoControl() {
  const n = puntos.length;

  const x = canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3;
  const y = canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.3;

  puntos.splice(n - 1, 0, { x, y });

  actualizarBotonQuitar();
  dibujar();
}

function quitarPuntoControl() {
  if (puntos.length <= 2) return;

  puntos.splice(puntos.length - 2, 1);
  puntoSeleccionado = null;

  actualizarBotonQuitar();
  dibujar();
}

function actualizarBotonQuitar() {
  btnQuitar.disabled = puntos.length <= 2;
}

// -----------------------------
// BEZIER
// -----------------------------
function interpolar(p1, p2, t) {
  return {
    x: (1 - t) * p1.x + t * p2.x,
    y: (1 - t) * p1.y + t * p2.y
  };
}

function deCasteljau(puntosBase, t) {
  let copia = puntosBase.map(p => ({ ...p }));

  while (copia.length > 1) {
    let nuevos = [];

    for (let i = 0; i < copia.length - 1; i++) {
      nuevos.push(interpolar(copia[i], copia[i + 1], t));
    }

    copia = nuevos;
  }

  return copia[0];
}

// -----------------------------
// DIBUJO
// -----------------------------
function dibujarCurvaBezier() {
  if (puntos.length < 2) return;

  ctx.beginPath();

  const inicio = deCasteljau(puntos, 0);
  ctx.moveTo(inicio.x, inicio.y);

  for (let t = 0; t <= 1; t += 0.005) {
    const p = deCasteljau(puntos, t);
    ctx.lineTo(p.x, p.y);
  }

  ctx.strokeStyle = "#d62828";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function dibujarPoligonalControl() {
  ctx.beginPath();

  puntos.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });

  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function dibujarPuntos() {
  puntos.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, radioPunto, 0, Math.PI * 2);

    ctx.fillStyle = (i === 0 || i === puntos.length - 1)
      ? "#003049"
      : "#f77f00";

    ctx.fill();

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#222";
    ctx.font = "14px Arial";
    ctx.fillText(`P${i}`, p.x + 12, p.y - 12);
  });
}

function dibujar() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  dibujarPoligonalControl();
  dibujarCurvaBezier();
  dibujarPuntos();
}

// -----------------------------
// INTERACCIÓN
// -----------------------------
function obtenerPosicion(e) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function buscarPuntoCercano(pos) {
  for (let i = puntos.length - 1; i >= 0; i--) {
    const p = puntos[i];
    const dx = pos.x - p.x;
    const dy = pos.y - p.y;

    if (Math.sqrt(dx * dx + dy * dy) < radioPunto + 6) {
      return i;
    }
  }
  return null;
}

function limitar(pos) {
  return {
    x: Math.max(0, Math.min(canvas.width, pos.x)),
    y: Math.max(0, Math.min(canvas.height, pos.y))
  };
}

// -----------------------------
// POINTER EVENTS (SOLUCIÓN MÓVIL)
// -----------------------------
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();

  const pos = obtenerPosicion(e);
  puntoSeleccionado = buscarPuntoCercano(pos);

  if (puntoSeleccionado !== null) {
    canvas.setPointerCapture(e.pointerId);
  }
}, { passive: false });

canvas.addEventListener("pointermove", (e) => {
  e.preventDefault();

  if (puntoSeleccionado === null) return;

  const pos = limitar(obtenerPosicion(e));

  puntos[puntoSeleccionado].x = pos.x;
  puntos[puntoSeleccionado].y = pos.y;

  dibujar();
}, { passive: false });

canvas.addEventListener("pointerup", (e) => {
  e.preventDefault();
  puntoSeleccionado = null;
}, { passive: false });

canvas.addEventListener("pointercancel", () => {
  puntoSeleccionado = null;
});

canvas.addEventListener("pointerleave", () => {
  puntoSeleccionado = null;
});

// -----------------------------
// GUARDAR IMAGEN
// -----------------------------
function guardarImagen() {
  dibujar();

  const enlace = document.createElement("a");
  enlace.download = "curva-bezier-radix.png";
  enlace.href = canvas.toDataURL("image/png");
  enlace.click();
}

// -----------------------------
// EVENTOS
// -----------------------------
btnAgregar.addEventListener("click", agregarPuntoControl);
btnQuitar.addEventListener("click", quitarPuntoControl);
btnReiniciar.addEventListener("click", iniciar);
btnGuardar.addEventListener("click", guardarImagen);

window.addEventListener("resize", ajustarCanvas);

// -----------------------------
// INIT
// -----------------------------
ajustarCanvas();
iniciar();