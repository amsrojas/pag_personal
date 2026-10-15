/*
 * BIA · Patrones de color · Port de guepardo.pde (Processing) a JavaScript.
 * Mantiene la malla, el laplaciano de 9 puntos, las condiciones de borde,
 * la semilla aleatoria, los perfiles de k y s y la conversión a pigmentación.
 * La implementación del ruido coherente reproduce la estructura de Perlin
 * de Processing, pero no garantiza el mismo campo píxel a píxel que el original.
 * Optimización móvil: pausa por visibilidad y presupuesto de cómputo adaptativo.
 */
(() => {
  'use strict';

  const W = 320, H = 200, N = W * H;
  const ESCALA = 2, ANCHO = W * ESCALA, ALTO = H * ESCALA;
  const K_AMP = 0.0015, K_VIENTRE = 0.004;
  const S0 = 0.80, S_AMP = 0.35;
  const DORSO = [196, 139, 58];
  const FLANCO = [222, 178, 104];
  const VIENTRE = [242, 232, 210];
  const MELANINA = [28, 22, 18];
  const ORIGINALES = { F: 0.0390, K: 0.0650, DU: 1.0, DV: 0.5, velocidad: 5 };

  const canvas = document.getElementById('patron');
  const ctx = canvas?.getContext('2d', { alpha: false });
  const estado = document.getElementById('estado');
  const indicador = document.getElementById('iteraciones');
  const botonPausa = document.getElementById('pausa');
  const botonReinicio = document.getElementById('reiniciar');
  const botonRestaurar = document.getElementById('restaurar');
  const botonGuardar = document.getElementById('guardar');
  const modo = document.getElementById('visualizacion');
  // Control opcional añadido al HTML: automático, ahorro o rendimiento.
  const selectorConsumo = document.getElementById('consumo');

  if (!ctx) {
    if (estado) estado.textContent = 'Canvas no está disponible en este navegador.';
    return;
  }

  const entradas = {};
  const valores = {};
  for (const id of Object.keys(ORIGINALES)) {
    entradas[id] = document.getElementById(id);
    valores[id] = document.getElementById(`${id}-valor`);
  }
  const params = { ...ORIGINALES };

  let u = new Float32Array(N), v = new Float32Array(N);
  let nu = new Float32Array(N), nv = new Float32Array(N);
  const kOffset = new Float32Array(N);
  const sLoc = new Float32Array(N);
  const xm = new Int16Array(W), xp = new Int16Array(W);
  const ym = new Int16Array(H), yp = new Int16Array(H);

  const umbral = new Float32Array(ANCHO * ALTO);
  const fondoR = new Uint8Array(ALTO);
  const fondoG = new Uint8Array(ALTO);
  const fondoB = new Uint8Array(ALTO);
  const px0 = new Int16Array(ANCHO), px1 = new Int16Array(ANCHO);
  const pfx = new Float32Array(ANCHO);
  const py0 = new Int32Array(ALTO), py1 = new Int32Array(ALTO);
  const pfy = new Float32Array(ALTO);
  const imagen = ctx.createImageData(ANCHO, ALTO);
  const pixeles = new Uint32Array(imagen.data.buffer);

  let t = 0, inicializado = false;
  let pausaUsuario = false, canvasVisible = true;
  let temporizador = null, raf = null, arrastrando = false;
  let pasosAuto = 3, costePromedio = 0, muestras = 0;
  const movimientoReducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const modoConsumo = () => selectorConsumo?.value || 'auto';
  const seedRandom = () => (Math.random() * 0xFFFFFFFF) >>> 0;
  const modulo = (a, k) => ((a % k) + k) % k;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function suave(a, b, x) {
    const z = clamp((x - a) / (b - a), 0, 1);
    return z * z * (3 - 2 * z);
  }
  function mezclar(a, b, t) { return a + t * (b - a); }

  // Ruido coherente de Processing: tabla periódica de 4096 entradas,
  // interpolación cosenoidal y noiseDetail(2, 0.4).
  class RuidoPerlin {
    constructor(semilla) {
      let s = semilla >>> 0;
      function rand() {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      }
      this.tabla = new Float32Array(4096);
      for (let i = 0; i < 4096; i++) this.tabla[i] = rand();
    }
    noise(x, y, z) {
      x = Math.abs(x); y = Math.abs(y); z = Math.abs(z);
      let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      let xf = x - xi, yf = y - yi, zf = z - zi;
      let total = 0, amplitud = 0.5;
      const perlin = this.tabla;
      for (let oct = 0; oct < 2; oct++) {
        let off = xi + (yi << 4) + (zi << 8);
        const rx = 0.5 * (1 - Math.cos(xf * Math.PI));
        const ry = 0.5 * (1 - Math.cos(yf * Math.PI));
        const rz = 0.5 * (1 - Math.cos(zf * Math.PI));
        let n1 = perlin[off & 4095];
        n1 += rx * (perlin[(off + 1) & 4095] - n1);
        let n2 = perlin[(off + 16) & 4095];
        n2 += rx * (perlin[(off + 17) & 4095] - n2);
        n1 += ry * (n2 - n1);
        off += 256;
        n2 = perlin[off & 4095];
        n2 += rx * (perlin[(off + 1) & 4095] - n2);
        let n3 = perlin[(off + 16) & 4095];
        n3 += rx * (perlin[(off + 17) & 4095] - n3);
        n2 += ry * (n3 - n2);
        total += (n1 + rz * (n2 - n1)) * amplitud;
        amplitud *= 0.4;
        xi <<= 1; yi <<= 1; zi <<= 1;
        xf *= 2; yf *= 2; zf *= 2;
        if (xf >= 1) { xi++; xf--; }
        if (yf >= 1) { yi++; yf--; }
        if (zf >= 1) { zi++; zf--; }
      }
      return total;
    }
  }

  // Recorrido circular horizontal: continuidad exacta entre bordes de x.
  function campoPeriodico(w, h, frecuencia, z0, ruido) {
    const campo = new Float32Array(w * h);
    const radio = w * frecuencia / (2 * Math.PI);
    const xs = new Float64Array(w), ys = new Float64Array(w);
    for (let x = 0; x < w; x++) {
      const angulo = 2 * Math.PI * x / w;
      xs[x] = 100 + radio * Math.cos(angulo);
      ys[x] = 100 + radio * Math.sin(angulo);
    }
    let media = 0;
    for (let y = 0; y < h; y++) {
      const z = z0 + y * frecuencia;
      const fila = y * w;
      for (let x = 0; x < w; x++) {
        const dato = ruido.noise(xs[x], ys[x], z);
        campo[fila + x] = dato;
        media += dato;
      }
    }
    media /= w * h;
    let maximo = 1e-6;
    for (let i = 0; i < campo.length; i++) {
      const dif = campo[i] - media;
      campo[i] = dif;
      maximo = Math.max(maximo, Math.abs(dif));
    }
    for (let i = 0; i < campo.length; i++) campo[i] /= maximo;
    return campo;
  }

  function prepararPantalla() {
    for (let x = 0; x < W; x++) { xm[x] = modulo(x - 1, W); xp[x] = modulo(x + 1, W); }
    for (let y = 0; y < H; y++) { ym[y] = y === 0 ? 1 : y - 1; yp[y] = y === H - 1 ? H - 2 : y + 1; }
    for (let Y = 0; Y < ALTO; Y++) {
      const y = Y / (ALTO - 1);
      const a = suave(0, 0.55, y);
      const b = suave(0.60, 0.95, y);
      for (let c = 0; c < 3; c++) {
        const valor = mezclar(mezclar(DORSO[c], FLANCO[c], a), VIENTRE[c], b);
        if (c === 0) fondoR[Y] = valor;
        else if (c === 1) fondoG[Y] = valor;
        else fondoB[Y] = valor;
      }
    }
    for (let X = 0; X < ANCHO; X++) {
      const gx = (X + 0.5) / ESCALA - 0.5;
      const x0 = Math.floor(gx);
      pfx[X] = gx - x0;
      px0[X] = modulo(x0, W);
      px1[X] = modulo(x0 + 1, W);
    }
    for (let Y = 0; Y < ALTO; Y++) {
      const gy = clamp((Y + 0.5) / ESCALA - 0.5, 0, H - 1);
      const y0 = Math.min(Math.floor(gy), H - 2);
      pfy[Y] = gy - y0;
      py0[Y] = y0 * W;
      py1[Y] = (y0 + 1) * W;
    }
  }

  function sembrar(cx, cy, radio = 2) {
    for (let dy = -radio; dy <= radio; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = -radio; dx <= radio; dx++) {
        const i = modulo(cx + dx, W) + y * W;
        u[i] = 0.5;
        v[i] = 0.25;
      }
    }
  }

  function reiniciar(autoiniciar = true) {
    inicializado = false;
    detenerCiclo();
    estado.textContent = 'Preparando campos aleatorios…';
    // Diferente semilla para cada ejecución, como noiseSeed(random(1e6)) en Processing.
    const ruido = new RuidoPerlin(seedRandom());
    const nk = campoPeriodico(W, H, 0.04, 0, ruido);
    const ns = campoPeriodico(W, H, 0.05, 37, ruido);
    for (let y = 0; y < H; y++) {
      const vientre = suave(0.72, 0.97, y / (H - 1));
      for (let x = 0; x < W; x++) {
        const i = x + y * W;
        kOffset[i] = K_AMP * nk[i] + K_VIENTRE * vientre;
        sLoc[i] = S0 + S_AMP * ns[i];
        u[i] = 1;
        v[i] = 0.02 * Math.random();
      }
    }
    for (let i = 0; i < 250; i++) {
      sembrar(Math.floor(Math.random() * W), 3 + Math.floor(Math.random() * (H - 6)), 2);
    }
    const fino = campoPeriodico(ANCHO, ALTO, 0.12, 91, ruido);
    for (let i = 0; i < umbral.length; i++) umbral[i] = 0.10 + 0.04 * fino[i];
    t = 0;
    indicador.textContent = '0';
    pintar();
    inicializado = true;
    pausaUsuario = !autoiniciar;
    pasosAuto = Math.max(1, Math.min(params.velocidad,
      navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 ? 2 : 3));
    costePromedio = 0;
    muestras = 0;
    actualizarCiclo();
  }

  function paso() {
    const F = params.F, K = params.K, DU = params.DU, DV = params.DV;
    for (let y = 0; y < H; y++) {
      const f = y * W, fa = ym[y] * W, fb = yp[y] * W;
      for (let x = 0; x < W; x++) {
        const i = f + x, a = xm[x], b = xp[x];
        const uu = u[i], vv = v[i];
        const lu = -uu + 0.2 * (u[fa + x] + u[fb + x] + u[f + a] + u[f + b])
                       + 0.05 * (u[fa + a] + u[fa + b] + u[fb + a] + u[fb + b]);
        const lv = -vv + 0.2 * (v[fa + x] + v[fb + x] + v[f + a] + v[f + b])
                       + 0.05 * (v[fa + a] + v[fa + b] + v[fb + a] + v[fb + b]);
        const uvv = uu * vv * vv;
        nu[i] = uu + sLoc[i] * DU * lu - uvv + F * (1 - uu);
        nv[i] = vv + sLoc[i] * DV * lv + uvv - (F + K + kOffset[i]) * vv;
      }
    }
    [u, nu] = [nu, u];
    [v, nv] = [nv, v];
  }

  function pintar() {
    const concentracion = modo.value === 'campo';
    for (let Y = 0; Y < ALTO; Y++) {
      const r0 = py0[Y], r1 = py1[Y], fy = pfy[Y];
      const r = fondoR[Y], g = fondoG[Y], b = fondoB[Y];
      const fila = Y * ANCHO;
      for (let X = 0; X < ANCHO; X++) {
        const a = px0[X], c = px1[X], fx = pfx[X];
        const arriba = v[r0 + a] + fx * (v[r0 + c] - v[r0 + a]);
        const abajo = v[r1 + a] + fx * (v[r1 + c] - v[r1 + a]);
        const valor = arriba + fy * (abajo - arriba);
        const j = fila + X;
        let R, G, B;
        if (concentracion) {
          const p = clamp(valor / 0.35, 0, 1);
          R = (247 + p * (30 - 247)) | 0;
          G = (249 + p * (92 - 249)) | 0;
          B = (244 + p * (42 - 244)) | 0;
        } else {
          const p = suave(umbral[j] - 0.03, umbral[j] + 0.03, valor);
          R = (r + p * (MELANINA[0] - r)) | 0;
          G = (g + p * (MELANINA[1] - g)) | 0;
          B = (b + p * (MELANINA[2] - b)) | 0;
        }
        // ImageData tiene orden RGBA. En plataformas little-endian, Uint32 equivale a ABGR.
        pixeles[j] = (0xFF000000 | (B << 16) | (G << 8) | R) >>> 0;
      }
    }
    ctx.putImageData(imagen, 0, 0);
  }

  // El bucle solo existe si la simulación está a la vista y el usuario no la pausó.
  function puedeEjecutar() {
    return inicializado && !pausaUsuario && !document.hidden && canvasVisible;
  }

  function intervaloMs() {
    if (modoConsumo() === 'ahorro') return 120;  // ≈ 8 actualizaciones por segundo.
    if (modoConsumo() === 'rendimiento') return 42;
    // Modo automático: se adapta incluso si un paso resulta costoso.
    if (costePromedio > 50) return 120;
    if (costePromedio > 28) return 85;
    return 50;
  }

  function pasosPorActualizacion() {
    if (modoConsumo() === 'ahorro') return Math.min(params.velocidad, 2);
    if (modoConsumo() === 'rendimiento') return params.velocidad;
    return Math.min(params.velocidad, pasosAuto);
  }

  function detenerCiclo() {
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  function actualizarEstado() {
    if (!inicializado) return;
    botonPausa.textContent = pausaUsuario ? 'Reanudar' : 'Pausar';
    if (pausaUsuario) estado.textContent = 'En pausa';
    else if (document.hidden) estado.textContent = 'Suspendida (pestaña inactiva)';
    else if (!canvasVisible) estado.textContent = 'Suspendida (fuera de pantalla)';
    else estado.textContent = `En ejecución · ${pasosPorActualizacion()} pasos/ciclo`;
  }

  function programarSiguiente() {
    if (!puedeEjecutar() || temporizador !== null || raf !== null) return;
    temporizador = setTimeout(() => {
      temporizador = null;
      if (!puedeEjecutar()) return;
      raf = requestAnimationFrame(avanzar);
    }, intervaloMs());
  }

  function actualizarCiclo() {
    if (!puedeEjecutar()) detenerCiclo();
    else programarSiguiente();
    actualizarEstado();
  }

  function avanzar() {
    raf = null;
    if (!puedeEjecutar()) { actualizarEstado(); return; }
    const antes = performance.now();
    const pasos = pasosPorActualizacion();
    try {
      for (let i = 0; i < pasos; i++) paso();
      t += pasos;
      pintar();
      indicador.textContent = t.toLocaleString('es-CO');
    } catch (error) { mostrarProblema(error); return; }

    if (modoConsumo() === 'auto') {
      const coste = performance.now() - antes;
      costePromedio = muestras === 0 ? coste : 0.8 * costePromedio + 0.2 * coste;
      muestras++;
      if (muestras % 8 === 0) {
        // Reducir trabajo si se supera el presupuesto; aumentarlo gradualmente
        // únicamente cuando existe margen. Nunca modificar W, H ni delta t.
        if (costePromedio > 22) pasosAuto = Math.max(1, pasosAuto - 1);
        else if (costePromedio < 11) pasosAuto = Math.min(params.velocidad, pasosAuto + 1);
        actualizarEstado();
      }
    }
    programarSiguiente();
  }

  function sincronizar() {
    for (const [id, input] of Object.entries(entradas)) {
      const valor = Number(input.value);
      params[id] = valor;
      valores[id].textContent = id === 'velocidad' ? String(valor)
        : (id === 'DU' || id === 'DV' ? valor.toFixed(2) : valor.toFixed(4));
    }
  }

  function mostrarProblema(error) {
    console.error('Error de simulación Gray–Scott:', error);
    detenerCiclo();
    inicializado = false;
    estado.textContent = 'No se pudo iniciar la simulación.';
    botonPausa.textContent = 'Iniciar';
    botonPausa.disabled = true;
  }

  // Eventos de la interfaz.
  for (const input of Object.values(entradas)) {
    input.addEventListener('input', () => {
      sincronizar();
      pasosAuto = Math.min(pasosAuto, params.velocidad);
      actualizarEstado();
    });
  }
  if (selectorConsumo) selectorConsumo.addEventListener('change', () => {
    costePromedio = 0;
    muestras = 0;
    detenerCiclo();
    actualizarCiclo();
  });
  modo.addEventListener('change', pintar);
  botonPausa.addEventListener('click', () => {
    pausaUsuario = !pausaUsuario;
    actualizarCiclo();
  });
  botonReinicio.addEventListener('click', () => {
    try { reiniciar(); } catch (error) { mostrarProblema(error); }
  });
  botonRestaurar.addEventListener('click', () => {
    for (const [id, valor] of Object.entries(ORIGINALES)) entradas[id].value = String(valor);
    modo.value = 'pigmento';
    if (selectorConsumo) selectorConsumo.value = 'auto';
    sincronizar();
    try { reiniciar(); } catch (error) { mostrarProblema(error); }
  });
  botonGuardar.addEventListener('click', () => {
    const enlace = document.createElement('a');
    enlace.download = `bia-gray-scott-t${t}.png`;
    enlace.href = canvas.toDataURL('image/png');
    enlace.click();
  });

  function perturbar(event) {
    const caja = canvas.getBoundingClientRect();
    if (!caja.width || !caja.height) return;
    const x = Math.floor((event.clientX - caja.left) / caja.width * W);
    const y = Math.floor((event.clientY - caja.top) / caja.height * H);
    sembrar(modulo(x, W), clamp(y, 0, H - 1), 2);
    if (!puedeEjecutar()) pintar();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    arrastrando = true;
    canvas.setPointerCapture?.(event.pointerId);
    perturbar(event);
  });
  canvas.addEventListener('pointermove', event => { if (arrastrando) perturbar(event); });
  canvas.addEventListener('pointerup', () => { arrastrando = false; });
  canvas.addEventListener('pointercancel', () => { arrastrando = false; });
  canvas.addEventListener('lostpointercapture', () => { arrastrando = false; });
  canvas.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      perturbar({ clientX: canvas.getBoundingClientRect().left + canvas.clientWidth / 2,
        clientY: canvas.getBoundingClientRect().top + canvas.clientHeight / 2 });
    }
  });

  // Suspensión automática al salir del área visible. No altera pausaUsuario.
  function comprobarVisibilidad() {
    const r = canvas.getBoundingClientRect();
    canvasVisible = r.width > 0 && r.height > 0 &&
      r.bottom > 0 && r.top < window.innerHeight &&
      r.right > 0 && r.left < window.innerWidth;
    actualizarCiclo();
  }
  if ('IntersectionObserver' in window) {
    const observador = new IntersectionObserver(entradas => {
      canvasVisible = entradas[0].isIntersecting;
      actualizarCiclo();
    }, { threshold: 0 });
    observador.observe(canvas);
  } else {
    window.addEventListener('scroll', comprobarVisibilidad, { passive: true });
    window.addEventListener('resize', comprobarVisibilidad, { passive: true });
  }

  document.addEventListener('visibilitychange', actualizarCiclo);
  window.addEventListener('pagehide', detenerCiclo);
  window.addEventListener('pageshow', actualizarCiclo);

  // El tamaño de la malla y la discretización numérica no cambian.
  try {
    prepararPantalla();
    sincronizar();
    comprobarVisibilidad();
    reiniciar(!movimientoReducido);
    for (const boton of [botonPausa, botonReinicio, botonRestaurar, botonGuardar]) {
      boton.disabled = false;
    }
  } catch (error) {
    mostrarProblema(error);
  }
})();
