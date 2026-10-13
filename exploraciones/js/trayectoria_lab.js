/* Trayectoria cromatica A'--B' en CIELAB, calculada sobre sRGB/D65.
   Depende de cal_rgb_cielab.js para rgb255ToLab, rgbToHex, dot3,
   M_XYZ2RGB, Xn, Yn, Zn y linearToSrgb. */
(() => {
  'use strict';
  window.addEventListener('DOMContentLoaded', init);

  function init() {
    const get = id => document.getElementById(id);
    const idsA = ['AR', 'AG', 'AB'];
    const idsB = ['BR', 'BG', 'BB'];
    const canvas = get('labPathCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const safeCanvas = get('rgbSafeCanvas');
    const safeCtx = safeCanvas.getContext('2d');
    const pickerA = get('pickerA');
    const pickerB = get('pickerB');
    const slider = get('pathT');
    const segmentsInput = get('pathSegments');
    const stepsCanvas = get('labStepsCanvas');
    const stepsCtx = stepsCanvas.getContext('2d');
    const MIN_SEGMENTS = 1;
    const MAX_SEGMENTS = 100;
    const DEFAULT_SEGMENTS = 12;
    const EPS = 1e-6; // tolerancia por redondeo de las matrices D65

    function normalizeChannel(raw, fallback = 0) {
      if (String(raw).trim() === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : fallback;
    }
    function getRGB(ids) {
      return ids.map(id => normalizeChannel(get(id).value));
    }
    function setRGB(ids, rgb) {
      ids.forEach((id, k) => get(id).value = rgb[k]);
    }
    function parseHex(value) {
      const hex = value.replace('#', '');
      return [0, 2, 4].map(k => parseInt(hex.slice(k, k + 2), 16));
    }
    function labAt(A, B, t) {
      return A.map((x, k) => (1 - t) * x + t * B[k]);
    }

    // Inversa LAB -> sRGB SIN recorte para comprobar el gamut.
    // La clasificacion se hace antes de redondear los canales a 8 bits.
    function toSrgb(lab) {
      const [L, a, b] = lab;
      const fy = (L + 16) / 116;
      const fx = fy + a / 500;
      const fz = fy - b / 200;
      const eps = 216 / 24389;
      const kappa = 24389 / 27;
      const finv = v => v * v * v > eps ? v * v * v : (116 * v - 16) / kappa;
      const xyz = [Xn * finv(fx), Yn * finv(fy), Zn * finv(fz)];
      const linear = dot3(M_XYZ2RGB, xyz);
      const inGamut = linear.every(v => v >= -EPS && v <= 1 + EPS);
      const rgb = linear.map(v => Math.round(255 * linearToSrgb(Math.max(0, Math.min(1, v)))));
      return { rgb, inGamut };
    }

    function drawTrack(context, width, height, A, B, pathFn, currentT, indicateOut) {
      context.clearRect(0, 0, width, height);
      const y = indicateOut ? 13 : 0;
      const h = height - y;
      context.fillStyle = '#F5F7F8';
      context.fillRect(0, y, width, h);
      let invalidCount = 0;
      // Cada columna toma una muestra del camino; zonas fuera de gamut se rayan.
      for (let x = 0; x < width; ++x) {
        const t = x / (width - 1);
        const lab = pathFn(A, B, t);
        const mapped = toSrgb(lab);
        if (!mapped.inGamut) invalidCount++;
        context.fillStyle = mapped.inGamut ? `rgb(${mapped.rgb.join(',')})` : '#EEE8E1';
        context.fillRect(x, y, 1, h);
        if (!mapped.inGamut) {
          context.strokeStyle = '#9F5B37';
          context.globalAlpha = .6;
          context.lineWidth = 1;
          context.beginPath();
          const offset = x % 10;
          context.moveTo(x, y + offset);
          context.lineTo(x, y + offset + 7);
          context.stroke();
          context.globalAlpha = 1;
          context.fillStyle = '#9F5B37';
          context.fillRect(x, 0, 1, 8);
        }
      }
      if (currentT != null) {
        const x = Math.round(currentT * (width - 1)) + .5;
        context.strokeStyle = '#FFFFFF';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, height);
        context.stroke();
        context.strokeStyle = '#253D52';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, height);
        context.stroke();
        context.fillStyle = '#253D52';
        context.beginPath();
        context.arc(x, y + 2, 4, 0, Math.PI * 2);
        context.fill();
      }
      return invalidCount / width;
    }

    function numberOfSegments() {
      const raw = String(segmentsInput.value).trim();
      if (raw === '') return DEFAULT_SEGMENTS;
      const value = Number(raw);
      if (!Number.isFinite(value)) return DEFAULT_SEGMENTS;
      return Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, Math.round(value)));
    }

    function drawSegmentedTrack(Ap, Bp, count, selectedT) {
      const w = stepsCanvas.width;
      const h = stepsCanvas.height;
      stepsCtx.clearRect(0, 0, w, h);
      let outside = 0;

      for (let k = 0; k < count; k++) {
        // N tramos de igual longitud. Se usa la muestra central de cada uno.
        const tMid = (k + 0.5) / count;
        const { rgb, inGamut } = toSrgb(labAt(Ap, Bp, tMid));
        if (!inGamut) outside++;

        const left = Math.round(k * w / count);
        const right = Math.round((k + 1) * w / count);
        const cellWidth = right - left;
        stepsCtx.fillStyle = inGamut ? `rgb(${rgb.join(',')})` : '#EEE8E1';
        stepsCtx.fillRect(left, 0, cellWidth, h);

        if (!inGamut) {
          // Rayado limitado al tramo para distinguir puntos fuera de gamut.
          stepsCtx.save();
          stepsCtx.beginPath();
          stepsCtx.rect(left, 0, cellWidth, h);
          stepsCtx.clip();
          stepsCtx.strokeStyle = '#9F5B37';
          stepsCtx.lineWidth = 1.4;
          for (let x = left - h; x < right + h; x += 12) {
            stepsCtx.beginPath();
            stepsCtx.moveTo(x, 0);
            stepsCtx.lineTo(x + h, h);
            stepsCtx.stroke();
          }
          stepsCtx.restore();
        }
      }

      // La franja discreta queda limpia: sin marcador ni divisores blancos.
      // La posicion seleccionada se indica con el deslizador y el texto inferior.

      const current = Math.min(count - 1, Math.floor(selectedT * count)) + 1;
      get('pathSegmentsValue').textContent = `${count} ${count === 1 ? 'tramo' : 'tramos'} · ${count + 1} nodos`;
      get('pathStepsSummary').textContent =
        `Posición actual: tramo ${current} de ${count}. ` +
        (outside === 0
          ? 'Todos los puntos medios muestreados están en sRGB.'
          : `${outside} de ${count} puntos medios están fuera del gamut sRGB.`) +
        ' Esta discretización es un muestreo; la barra continua permite ver más detalles del gamut.';
    }

    const rgbSafeLab = (A, B, t) => {
      const mixed = A.map((c, k) => (1 - t) * c + t * B[k]);
      return rgb255ToLab(...mixed);
    };

    let state = null;
    function readEndpoints() {
      const A = getRGB(idsA);
      const B = getRGB(idsB);
      pickerA.value = rgbToHex(...A);
      pickerB.value = rgbToHex(...B);
      get('hexA').textContent = pickerA.value.toUpperCase();
      get('hexB').textContent = pickerB.value.toUpperCase();
      const Ap = rgb255ToLab(...A);
      const Bp = rgb255ToLab(...B);
      get('labA').textContent = `L* ${Ap[0].toFixed(2)} · a* ${Ap[1].toFixed(2)} · b* ${Ap[2].toFixed(2)}`;
      get('labB').textContent = `L* ${Bp[0].toFixed(2)} · a* ${Bp[1].toFixed(2)} · b* ${Bp[2].toFixed(2)}`;
      state = { A, B, Ap, Bp };
    }

    function redraw() {
      readEndpoints();
      render();
    }

    function render() {
      if (!state) return;
      const { A, B, Ap, Bp } = state;
      const t = Number(slider.value) / 1000;
      get('pathTValue').textContent = `t = ${t.toFixed(3)}`;
      slider.setAttribute('aria-valuetext', `t igual a ${t.toFixed(3)}`);

      const lab = labAt(Ap, Bp, t);
      const { rgb, inGamut } = toSrgb(lab);
      const hex = rgbToHex(...rgb);
      const swatch = get('pathSwatch');
      swatch.style.backgroundColor = hex;
      swatch.classList.toggle('outside', !inGamut);
      swatch.setAttribute('aria-label', `Color ${hex}${inGamut ? '' : ', aproximacion recortada fuera de gamut'}`);
      get('pathLab').textContent = `LAB: (${lab.map(x => x.toFixed(2)).join(', ')})`;
      get('pathRgb').textContent = `RGB: (${rgb.join(', ')}) · ${hex}${inGamut ? '' : ' (recortado)'}`;
      const note = get('pathGamut');
      note.className = 'path-gamut ' + (inGamut ? 'ok' : 'outside');
      note.textContent = inGamut
        ? 'Dentro del gamut sRGB: color representable.'
        : 'Fuera del gamut sRGB: el color mostrado es una aproximación por recorte de canales.';

      const invalidRatio = drawTrack(ctx, canvas.width, canvas.height, Ap, Bp, labAt, t, true);
      drawTrack(safeCtx, safeCanvas.width, safeCanvas.height, A, B, rgbSafeLab, null, false);
      drawSegmentedTrack(Ap, Bp, numberOfSegments(), t);
      const summary = get('pathGamutSummary');
      summary.textContent = invalidRatio > 0
        ? `Una parte del segmento está fuera del gamut sRGB (aprox. ${(invalidRatio * 100).toFixed(1)} % de las muestras). Las zonas rayadas representan puntos no reproducibles exactamente.`
        : 'Todas las muestras del segmento están dentro del gamut sRGB (comprobación numérica).';
    }

    for (const ids of [idsA, idsB]) {
      for (const id of ids) {
        get(id).addEventListener('input', redraw);
        get(id).addEventListener('change', () => {
          const el = get(id);
          el.value = normalizeChannel(el.value);
          redraw();
        });
      }
    }
    pickerA.addEventListener('input', () => { setRGB(idsA, parseHex(pickerA.value)); redraw(); });
    pickerB.addEventListener('input', () => { setRGB(idsB, parseHex(pickerB.value)); redraw(); });
    slider.addEventListener('input', render);
    segmentsInput.addEventListener('input', () => {
      if (String(segmentsInput.value).trim() !== '') render();
    });
    segmentsInput.addEventListener('change', () => {
      segmentsInput.value = numberOfSegments();
      render();
    });
    // Permite inspeccionar el punto medio del tramo seleccionado.
    stepsCanvas.addEventListener('click', event => {
      const rect = stepsCanvas.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const n = numberOfSegments();
      const k = Math.min(n - 1, Math.floor(x * n));
      slider.value = Math.round(1000 * (k + 0.5) / n);
      render();
    });
    redraw();
  }
})();
