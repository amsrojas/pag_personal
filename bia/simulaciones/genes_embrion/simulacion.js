/*
 * BIA · Morfogénesis celular 2D · Adaptación de MorfogenesisBIA_Multifocos.pde
 * Processing 4 -> JavaScript / Canvas.
 * Conserva las reglas, los valores numéricos, la rejilla vecinal, la lógica
 * de incorporación de focos y las restricciones mecánicas del original.
 * Modelo conceptual, NO simulación anatómica validada.
 */
(() => {
  'use strict';

  const W = 1280, H = 800, MAX_CELULAS = 1750, N_INICIAL = 300;
  const RADIO_CELULA = 5.4, SEPARACION_INICIAL = 12.15;
  const RADIO_CONTACTO = 28, CELDA_ESPACIAL = 30;
  const D_SENAL = 0.19, DECA_SENAL = 0.009, FUENTE_SENAL = 0.15;
  const UMBRAL_RELEVO = 0.16, CRECE_MEMORIA = 0.013;
  const MEMORIA_PROGENITORA = 0.43, MEMORIA_DIFERENCIADA = 1.85;
  const EDAD_MIN_DIVISION = 46, EMISORAS_POR_FOCO = 9, MAX_FOCOS = 12;
  const RADIO_CLIC_TEJIDO = 58, SEPARACION_MIN_FOCOS = 48;
  const K_REPULSION = 0.24, K_ADHESION = 0.029, K_ANCLAJE = 0.006;
  const FRICCION = 0.76, INERCIA_FUERZA = 0.17;
  const CENTRO_INICIAL_X = 320, CENTRO_INICIAL_Y = 410;
  const OBJETIVO_FOCO_X = 472, OBJETIVO_FOCO_Y = 410;
  const COLUMNAS = Math.ceil(W / CELDA_ESPACIAL);
  const FILAS = Math.ceil(H / CELDA_ESPACIAL);
  const MAX_REGISTROS = 3000;
  const COLORES = ['#8c9caf', '#fbcc66', '#55d0c8', '#a68be6', '#f77268'];

  const $ = id => document.getElementById(id);
  const canvas = $('tejido');
  const ctx = canvas?.getContext('2d', { alpha: false });
  if (!ctx) {
    if ($('estado')) $('estado').textContent = 'Canvas no disponible en este navegador.';
    return;
  }

  // Rejilla de vecinos y arreglos auxiliares preasignados: memoria acotada.
  const primera = new Int32Array(COLUMNAS * FILAS);
  const siguiente = new Int32Array(MAX_CELULAS);
  const fuerzaX = new Float32Array(MAX_CELULAS);
  const fuerzaY = new Float32Array(MAX_CELULAS);
  const nuevaA = new Float32Array(MAX_CELULAS);
  const proximas = new Int16Array(MAX_CELULAS);
  const vecinas = new Int16Array(MAX_CELULAS);
  const sumaA = new Float32Array(MAX_CELULAS);
  const mejorVecino = new Int16Array(MAX_CELULAS);
  const mejorSenal = new Float32Array(MAX_CELULAS);
  const conteoEstados = new Int32Array(5);

  // PRNG con la misma LCG de java.util.Random: reproducibilidad al reiniciar.
  // Los resultados pueden diferir ligeramente por precisión/orden numérico.
  class JavaRandom {
    constructor(semilla) { this.estado = (BigInt(semilla) ^ 0x5DEECE66Dn) & ((1n << 48n) - 1n); }
    nextFloat() {
      this.estado = (this.estado * 0x5DEECE66Dn + 0xBn) & ((1n << 48n) - 1n);
      return Number(this.estado >> 24n) / 16777216;
    }
    entre(min, max) { return min + (max - min) * this.nextFloat(); }
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sq = x => x * x;
  const formato = n => n.toLocaleString('es-CO');

  let azar = new JavaRandom(2026);
  let celulas = [], focos = [], relevos = [], registros = [];
  let t = 0, transmisiones = 0, nacimientos = 0;
  let extremoDerecho = 0, centroideX = 0, centroideY = 0;
  let tasaDivision = 0.054;
  let reglas = { relevos: true, proliferacion: true, adhesion: true, diferenciacion: true, trazas: true };
  let pausaUsuario = false, paginaVisible = !document.hidden, lienzoVisible = true;
  let temporizador = null, listo = false, duracionAuto = 47, aviso = '';
  let camara = { x: 0, y: 0, escala: 1 };

  const estadosUI = {
    estado: $('estado'), aviso: $('aviso'), paso: $('paso'), celulas: $('celulas'),
    focos: $('focos'), nacimientos: $('nacimientos'), transmisiones: $('transmisiones'),
    diferenciadas: $('diferenciadas'), tasa: $('tasa-valor'),
    pausa: $('pausa'), reiniciar: $('reiniciar'), imagen: $('imagen'),
    datos: $('datos'), focoAuto: $('foco-auto'), consumo: $('consumo')
  };

  function nuevaCelula(x, y) {
    return {
      x, y, vx: 0, vy: 0, A: 0, memoria: 0,
      sensibilidad: azar.entre(0.80, 1.20),
      adhesion: azar.entre(0.78, 1.22),
      anclaX: 0, anclaY: 0,
      estado: 0, edad: Math.floor(azar.entre(0, EDAD_MIN_DIVISION)),
      organizadora: false, anclada: false, focoId: 0
    };
  }

  function avisoUsuario(mensaje) {
    aviso = mensaje;
    estadosUI.aviso.textContent = mensaje;
  }

  function crearFoco(x, y, inicial = false) {
    if (focos.length >= MAX_FOCOS) {
      avisoUsuario(`Se alcanzó el máximo de ${MAX_FOCOS} focos.`);
      return false;
    }
    if (!inicial && focos.some(f => Math.hypot(x - f.x, y - f.y) < SEPARACION_MIN_FOCOS)) {
      avisoUsuario('Demasiado cerca de otro foco. Elige otra región.');
      return false;
    }
    const radio2 = RADIO_CLIC_TEJIDO * RADIO_CLIC_TEJIDO;
    const candidatas = celulas.filter(c => !c.organizadora &&
      (inicial || sq(c.x - x) + sq(c.y - y) <= radio2));
    candidatas.sort((a, b) => (sq(a.x - x) + sq(a.y - y)) -
      (sq(b.x - x) + sq(b.y - y)));
    const cantidad = Math.min(EMISORAS_POR_FOCO, candidatas.length);
    if (cantidad < 3) {
      avisoUsuario('No hay suficientes células próximas: pulsa sobre el tejido.');
      return false;
    }
    const id = focos.length + 1;
    let sx = 0, sy = 0;
    for (let i = 0; i < cantidad; i++) {
      const c = candidatas[i];
      c.organizadora = true;
      c.focoId = id;
      c.A = 1;
      c.estado = 4;
      sx += c.x;
      sy += c.y;
    }
    const f = { id, x: sx / cantidad, y: sy / cantidad, instante: t, emisoras: cantidad };
    focos.push(f);
    if (!inicial) avisoUsuario(`Foco ${id} añadido en el paso ${t}. Los anteriores continúan activos.`);
    actualizarEstadisticas();
    if (!inicial && registros.length) registrarMedicion();
    dibujar();
    return true;
  }

  function reiniciar() {
    detenerTemporizador();
    azar = new JavaRandom(2026);
    celulas = []; focos = []; relevos = []; registros = [];
    t = 0; transmisiones = 0; nacimientos = 0;
    const candidatos = [];
    for (let fila = -24; fila <= 24; fila++) {
      const dy = fila * SEPARACION_INICIAL * 0.8660254;
      for (let col = -24; col <= 24; col++) {
        const dx = (col + (fila % 2 === 0 ? 0 : 0.5)) * SEPARACION_INICIAL;
        const r2 = sq(dx / 169) + sq(dy / 137);
        if (r2 < 1) candidatos.push({ dx, dy, r2 });
      }
    }
    candidatos.sort((a, b) => a.r2 - b.r2);
    for (let i = 0; i < Math.min(N_INICIAL, candidatos.length); i++) {
      const p = candidatos[i];
      const c = nuevaCelula(
        CENTRO_INICIAL_X + p.dx + azar.entre(-0.38, 0.38),
        CENTRO_INICIAL_Y + p.dy + azar.entre(-0.38, 0.38)
      );
      c.anclaX = c.x; c.anclaY = c.y;
      c.anclada = c.x < CENTRO_INICIAL_X - 91;
      celulas.push(c);
    }
    crearFoco(OBJETIVO_FOCO_X, OBJETIVO_FOCO_Y, true);
    actualizarEstadisticas();
    registrarMedicion();
    avisoUsuario('Inicio con un foco. Pulsa en otro sector del tejido para añadir otro.');
    pausaUsuario = false;
    duracionAuto = 47;
    listo = true;
    dibujar();
    actualizarEjecucion();
  }

  function construirIndiceEspacial() {
    primera.fill(-1);
    for (let i = 0; i < celulas.length; i++) {
      const c = celulas[i];
      const ix = clamp(Math.trunc(c.x / CELDA_ESPACIAL), 0, COLUMNAS - 1);
      const iy = clamp(Math.trunc(c.y / CELDA_ESPACIAL), 0, FILAS - 1);
      const k = iy * COLUMNAS + ix;
      siguiente[i] = primera[k];
      primera[k] = i;
    }
  }

  function actualizar() {
    t++;
    construirIndiceEspacial();
    const n = celulas.length;
    fuerzaX.fill(0, 0, n); fuerzaY.fill(0, 0, n);
    proximas.fill(0, 0, n); vecinas.fill(0, 0, n);
    sumaA.fill(0, 0, n); mejorVecino.fill(-1, 0, n);
    mejorSenal.fill(0, 0, n);

    // Pares próximos: señalización + repulsión + adhesión, una sola vez por par.
    for (let i = 0; i < n; i++) {
      const a = celulas[i];
      const ix = clamp(Math.trunc(a.x / CELDA_ESPACIAL), 0, COLUMNAS - 1);
      const iy = clamp(Math.trunc(a.y / CELDA_ESPACIAL), 0, FILAS - 1);
      for (let yy = Math.max(0, iy - 1); yy <= Math.min(FILAS - 1, iy + 1); yy++) {
        for (let xx = Math.max(0, ix - 1); xx <= Math.min(COLUMNAS - 1, ix + 1); xx++) {
          let j = primera[yy * COLUMNAS + xx];
          while (j >= 0) {
            if (j > i) {
              const b = celulas[j];
              const dx = a.x - b.x, dy = a.y - b.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < RADIO_CONTACTO * RADIO_CONTACTO) {
                const d = Math.sqrt(Math.max(0.0001, d2));
                const ux = dx / d, uy = dy / d;
                vecinas[i]++; vecinas[j]++;
                sumaA[i] += b.A; sumaA[j] += a.A;
                if (b.A > mejorSenal[i]) { mejorSenal[i] = b.A; mejorVecino[i] = j; }
                if (a.A > mejorSenal[j]) { mejorSenal[j] = a.A; mejorVecino[j] = i; }
                const separacion = 2 * RADIO_CELULA;
                if (d < separacion) {
                  const f = K_REPULSION * (separacion - d);
                  fuerzaX[i] += f * ux; fuerzaY[i] += f * uy;
                  fuerzaX[j] -= f * ux; fuerzaY[j] -= f * uy;
                } else if (reglas.adhesion && d < 2.6 * RADIO_CELULA) {
                  const parecidas = (a.estado === b.estado) ? 1.28 : 0.72;
                  const f = K_ADHESION * (d - separacion)
                    * 0.5 * (a.adhesion + b.adhesion) * parecidas;
                  fuerzaX[i] -= f * ux; fuerzaY[i] -= f * uy;
                  fuerzaX[j] += f * ux; fuerzaY[j] += f * uy;
                }
                if (d < 2.45 * RADIO_CELULA) { proximas[i]++; proximas[j]++; }
              }
            }
            j = siguiente[j];
          }
        }
      }
    }

    // Señal A: promedio local, degradación y emisión persistente.
    for (let i = 0; i < n; i++) {
      const c = celulas[i];
      const promedio = vecinas[i] > 0 ? sumaA[i] / vecinas[i] : 0;
      const difusion = reglas.relevos ? D_SENAL * (promedio - c.A) : 0;
      const fuente = c.organizadora ? FUENTE_SENAL * (1 - c.A) : 0;
      nuevaA[i] = clamp(c.A + difusion - DECA_SENAL * c.A + fuente, 0, 1);
    }
    for (let i = 0; i < n; i++) {
      const c = celulas[i];
      const antes = c.A;
      c.A = nuevaA[i];
      if (reglas.relevos && antes < UMBRAL_RELEVO && c.A >= UMBRAL_RELEVO && mejorVecino[i] >= 0) {
        if (reglas.trazas && relevos.length < 500) {
          const e = celulas[mejorVecino[i]];
          relevos.push({ x1: e.x, y1: e.y, x2: c.x, y2: c.y, instante: t });
        }
        transmisiones++;
      }
      c.memoria += CRECE_MEMORIA * c.sensibilidad * Math.max(0, c.A - 0.18);
      if (!reglas.diferenciacion) {
        c.estado = c.organizadora ? 4 : (c.A >= 0.16 ? 2 : 0);
      } else if (c.organizadora) c.estado = 4;
      else if (c.memoria > MEMORIA_DIFERENCIADA) c.estado = 3;
      else if (c.memoria > MEMORIA_PROGENITORA && c.A > 0.19) c.estado = 2;
      else if (c.A > 0.16) c.estado = 1;
      else c.estado = 0;
    }

    // Movimiento: repulsión, adhesión, anclaje, inercia y fricción.
    for (let i = 0; i < n; i++) {
      const c = celulas[i];
      if (c.anclada) {
        fuerzaX[i] += K_ANCLAJE * (c.anclaX - c.x);
        fuerzaY[i] += K_ANCLAJE * (c.anclaY - c.y);
      }
      c.vx = FRICCION * c.vx + INERCIA_FUERZA * fuerzaX[i];
      c.vy = FRICCION * c.vy + INERCIA_FUERZA * fuerzaY[i];
      c.x = clamp(c.x + clamp(c.vx, -1.9, 1.9), 28 + RADIO_CELULA, W - 28 - RADIO_CELULA);
      c.y = clamp(c.y + clamp(c.vy, -1.9, 1.9), 100 + RADIO_CELULA, H - 40 - RADIO_CELULA);
      c.edad++;
    }

    // Hijas próximas a madres progenitoras: mismas reglas que en Processing.
    if (reglas.proliferacion && n < MAX_CELULAS) {
      const hijas = [];
      for (let i = 0; i < n && n + hijas.length < MAX_CELULAS; i++) {
        const c = celulas[i];
        if (c.estado !== 2 || c.edad < EDAD_MIN_DIVISION) continue;
        const api = proximas[i] >= 8 ? 0.22 : 1;
        const respuesta = clamp((c.A - 0.19) * 1.7, 0, 1);
        const prob = tasaDivision * respuesta * api * c.sensibilidad;
        if (azar.nextFloat() < prob) {
          const angulo = azar.entre(0, 2 * Math.PI);
          const d = 1.35 * RADIO_CELULA;
          const hija = nuevaCelula(c.x + d * Math.cos(angulo), c.y + d * Math.sin(angulo));
          hija.A = 0.82 * c.A;
          hija.memoria = 0.72 * c.memoria;
          hija.estado = 1;
          hija.edad = 0;
          hijas.push(hija);
          c.edad = 0;
          nacimientos++;
        }
      }
      celulas.push(...hijas);
    }
    actualizarEstadisticas();
    // Guardamos series acotadas: un registro por paso, hasta 3000 pasos recientes.
    registrarMedicion();
    if (relevos.length) relevos = relevos.filter(r => t - r.instante <= 32);
  }

  function actualizarEstadisticas() {
    conteoEstados.fill(0);
    centroideX = 0; centroideY = 0; extremoDerecho = -1e9;
    for (const c of celulas) {
      conteoEstados[c.estado]++;
      centroideX += c.x; centroideY += c.y;
      extremoDerecho = Math.max(extremoDerecho, c.x + RADIO_CELULA);
    }
    if (celulas.length) { centroideX /= celulas.length; centroideY /= celulas.length; }
    estadosUI.paso.textContent = formato(t);
    estadosUI.celulas.textContent = formato(celulas.length);
    estadosUI.focos.textContent = formato(focos.length);
    estadosUI.nacimientos.textContent = formato(nacimientos);
    estadosUI.transmisiones.textContent = formato(transmisiones);
    estadosUI.diferenciadas.textContent = formato(conteoEstados[3]);
  }

  function registrarMedicion() {
    const fila = [t, celulas.length, ...conteoEstados, focos.length,
      nacimientos, transmisiones, centroideX, centroideY, extremoDerecho - CENTRO_INICIAL_X];
    if (registros.length && registros[registros.length - 1][0] === t) registros[registros.length - 1] = fila;
    else registros.push(fila);
    if (registros.length > MAX_REGISTROS) registros.shift();
  }

  function calcularCamara() {
    if ($('vista').value === 'completa' || celulas.length === 0) {
      camara = { x: 0, y: 0, escala: 1 };
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of celulas) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    // Solo modifica el encuadre, no la posición ni las reglas de las células.
    const escala = Math.min(2.75, W / Math.max(230, maxX - minX + 130),
      H / Math.max(180, maxY - minY + 110));
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    camara = { x: mx - W / (2 * escala), y: my - H / (2 * escala), escala };
  }

  function dibujar() {
    calcularCamara();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1725';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(camara.escala, 0, 0, camara.escala,
      -camara.x * camara.escala, -camara.y * camara.escala);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(210,226,248,.047)';
    ctx.beginPath();
    for (let x = 0; x < W; x += 45) { ctx.moveTo(x, 85); ctx.lineTo(x, H); }
    for (let y = 85; y < H; y += 45) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.fillStyle = 'rgba(60,121,142,.08)';
    ctx.fillRect(0, 89, 174, H - 90);
    ctx.strokeStyle = 'rgba(120,185,202,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(174, 99); ctx.lineTo(174, H - 32); ctx.stroke();

    // Halo de señales: halo suave alrededor de células activadas.
    ctx.fillStyle = 'rgba(243,196,86,.065)';
    for (const c of celulas) {
      if (c.A > 0.14) {
        ctx.globalAlpha = c.A;
        ctx.beginPath(); ctx.arc(c.x, c.y, 15.5, 0, 2 * Math.PI); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (reglas.trazas) {
      ctx.lineWidth = 1.8;
      for (const r of relevos) {
        const a = clamp(1 - (t - r.instante) / 32, 0, 1) * 0.65;
        ctx.strokeStyle = `rgba(248,213,104,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke();
      }
    }

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(10,19,30,.7)';
    for (const c of celulas) {
      ctx.fillStyle = COLORES[c.estado];
      ctx.beginPath(); ctx.arc(c.x, c.y, RADIO_CELULA, 0, 2 * Math.PI);
      ctx.fill(); ctx.stroke();
      if (c.organizadora) {
        ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,164,141,.78)';
        ctx.beginPath(); ctx.arc(c.x, c.y, 1.35 * RADIO_CELULA, 0, 2 * Math.PI); ctx.stroke();
        ctx.strokeStyle = 'rgba(10,19,30,.7)'; ctx.lineWidth = 0.8;
      }
    }

    ctx.lineWidth = 1.3;
    ctx.textAlign = 'center'; ctx.font = '12px system-ui, sans-serif';
    for (const f of focos) {
      let sx = 0, sy = 0, n = 0;
      for (const c of celulas) if (c.focoId === f.id) { sx += c.x; sy += c.y; n++; }
      if (!n) continue;
      const fx = sx / n, fy = sy / n;
      ctx.strokeStyle = 'rgba(255,228,173,.65)';
      ctx.beginPath(); ctx.arc(fx, fy, 13.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffebc7';
      ctx.fillText(String(f.id), fx, fy - 20);
    }
    ctx.textAlign = 'start';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function actualizarEjecucion() {
    const debeCorrer = listo && !pausaUsuario && paginaVisible && lienzoVisible;
    if (!debeCorrer) detenerTemporizador();
    else if (temporizador === null) temporizador = setTimeout(ciclo, 0);

    estadosUI.pausa.textContent = pausaUsuario ? 'Reanudar' : 'Pausar';
    const causa = pausaUsuario ? 'En pausa' : (!paginaVisible ? 'En pausa (pestaña inactiva)' :
      (!lienzoVisible ? 'En pausa (simulación fuera de pantalla)' : 'En ejecución'));
    estadosUI.estado.textContent = listo ? causa : 'Preparando la simulación…';
  }

  function detenerTemporizador() {
    if (temporizador !== null) clearTimeout(temporizador);
    temporizador = null;
  }

  function ciclo() {
    temporizador = null;
    if (!listo || pausaUsuario || !paginaVisible || !lienzoVisible) return;
    const inicio = performance.now();
    try {
      actualizar();
      dibujar();
    } catch (e) {
      console.error('Error durante la simulación:', e);
      pausaUsuario = true;
      avisoUsuario('La simulación se detuvo por un error. Prueba a reiniciar.');
      actualizarEjecucion();
      return;
    }
    const costo = performance.now() - inicio;
    const modo = estadosUI.consumo.value;
    let intervalo;
    if (modo === 'ahorro') intervalo = 125;        // hasta 8 pasos/s
    else if (modo === 'maximo') intervalo = 33.3; // hasta 30 pasos/s
    else {
      // Auto: reducir pasos/segundo cuando el dispositivo tarda en procesarlos.
      if (costo > 0.45 * duracionAuto) duracionAuto = Math.min(200, duracionAuto * 1.13);
      else if (costo < 0.22 * duracionAuto) duracionAuto = Math.max(42, duracionAuto * 0.985);
      intervalo = duracionAuto;
    }
    temporizador = setTimeout(ciclo, Math.max(1, intervalo - costo));
  }

  function agregarFocoAutomatico() {
    const candidatos = celulas.filter(c => !c.organizadora && c.y > 105 && c.y < H - 105);
    // Elegir el sector celular más separado de los centros activos.
    candidatos.sort((a, b) => {
      const da = Math.min(...focos.map(f => sq(a.x - f.x) + sq(a.y - f.y)));
      const db = Math.min(...focos.map(f => sq(b.x - f.x) + sq(b.y - f.y)));
      return db - da;
    });
    for (const c of candidatos) {
      if (crearFoco(c.x, c.y)) return;
    }
    avisoUsuario('No hay una región disponible suficientemente alejada de los focos actuales.');
  }

  function guardarImagen() {
    canvas.toBlob(blob => {
      if (!blob) { avisoUsuario('No fue posible generar la imagen.'); return; }
      descargarBlob(blob, `bia-morfogenesis-paso-${t}.png`);
    }, 'image/png');
  }
  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url; enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click(); enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function descargarDatos() {
    const cab = 'paso,celulas,indiferenciadas,inducidas,progenitoras,diferenciadas,emisoras,focos,nacimientos,relevos,centroide_x,centroide_y,extension_x,focos_creados_en_paso';
    const filas = registros.map(fila => {
      const columnas = fila.map((v, i) => i >= 10 ? v.toFixed(3) : String(v));
      const eventos = focos.filter(f => f.instante === fila[0])
        .map(f => `id=${f.id};x=${f.x.toFixed(1)};y=${f.y.toFixed(1)};emisoras=${f.emisoras}`).join('|');
      columnas.push(`"${eventos}"`);
      return columnas.join(',');
    });
    const csv = '\uFEFF' + [cab, ...filas].join('\r\n') + '\r\n';
    descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `bia-morfogenesis-datos-paso-${t}.csv`);
  }

  function colocarFocoDesdePuntero(evento) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = camara.x + (evento.clientX - rect.left) * W / rect.width / camara.escala;
    const y = camara.y + (evento.clientY - rect.top) * H / rect.height / camara.escala;
    if (y <= 90 || y >= H - 94) {
      avisoUsuario('Selecciona una región del tejido, no los márgenes.');
      return;
    }
    crearFoco(x, y, false);
  }

  // Botones y controles del laboratorio.
  estadosUI.pausa.addEventListener('click', () => {
    pausaUsuario = !pausaUsuario;
    actualizarEjecucion();
  });
  estadosUI.reiniciar.addEventListener('click', reiniciar);
  estadosUI.imagen.addEventListener('click', guardarImagen);
  estadosUI.datos.addEventListener('click', descargarDatos);
  estadosUI.focoAuto.addEventListener('click', agregarFocoAutomatico);

  for (const key of ['relevos', 'proliferacion', 'adhesion', 'diferenciacion']) {
    $(key).addEventListener('change', evento => {
      reglas[key] = evento.currentTarget.checked;
      reiniciar(); // Como Processing: cambios de reglas -> nuevo experimento.
    });
  }
  $('trazas').addEventListener('change', evento => {
    reglas.trazas = evento.currentTarget.checked;
    if (!reglas.trazas) relevos = [];
    dibujar();
  });
  $('tasa').addEventListener('input', evento => {
    estadosUI.tasa.textContent = Number(evento.currentTarget.value).toFixed(3);
  });
  $('tasa').addEventListener('change', evento => {
    tasaDivision = Number(evento.currentTarget.value);
    reiniciar();
  });
  $('vista').addEventListener('change', dibujar);
  canvas.addEventListener('pointerdown', evento => {
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;
    colocarFocoDesdePuntero(evento);
  });
  canvas.addEventListener('keydown', evento => {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      agregarFocoAutomatico();
    }
  });
  document.addEventListener('visibilitychange', () => {
    paginaVisible = !document.hidden;
    actualizarEjecucion();
  });
  if ('IntersectionObserver' in window) {
    const observador = new IntersectionObserver(entradas => {
      lienzoVisible = !!entradas[0]?.isIntersecting;
      actualizarEjecucion();
    }, { threshold: 0.05 });
    observador.observe(canvas);
  }
  window.addEventListener('pagehide', detenerTemporizador);
  window.addEventListener('pageshow', () => actualizarEjecucion());

  // Entrada inicial determinista.
  try {
    estadosUI.tasa.textContent = tasaDivision.toFixed(3);
    reiniciar();
    for (const id of ['pausa', 'reiniciar', 'imagen', 'datos', 'foco-auto']) estadosUI[id === 'foco-auto' ? 'focoAuto' : id].disabled = false;
  } catch (error) {
    console.error('Error al iniciar Morfogénesis BIA:', error);
    estadosUI.estado.textContent = 'No se pudo iniciar el laboratorio.';
    avisoUsuario('Comprueba que el navegador admita JavaScript moderno.');
    detenerTemporizador();
  }
})();
