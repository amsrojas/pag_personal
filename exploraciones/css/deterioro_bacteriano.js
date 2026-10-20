*
 * Crecimiento bacteriano y deterioro ambiental.
 * P(t) = P0 * exp[t * (r0 - a*t)]
 *
 * Se muestran únicamente las funciones P(t) y r(t).
 * El cálculo de derivadas y la clasificación de intervalos
 * quedan expresamente a cargo de los estudiantes.
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const HORIZON = 12;
  const DEFAULT = { P0: 100, r0: 0.4, a: 0.05, t: 6 };

  function fmt(value, decimals) {
    return value.toLocaleString('es-CO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function sample(t, P0, r0, a) {
    const r = r0 - a * t;
    const P = P0 * Math.exp(t * r);
    return { r, P };
  }

  function el(parent, tag, attrs = {}, content) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      child.setAttribute(key, String(value));
    }
    if (content !== undefined) child.textContent = content;
    parent.appendChild(child);
    return child;
  }

  function plot(svg, kind, state) {
    const W = 580;
    const H = 288;
    const bounds = { L: 65, R: W - 18, U: 24, B: H - 40 };
    const samples = [];
    for (let i = 0; i <= 240; i++) {
      const x = HORIZON * i / 240;
      samples.push({ t: x, ...sample(x, state.P0, state.r0, state.a) });
    }

    let minY;
    let maxY;
    if (kind === 'P') {
      minY = 0;
      maxY = Math.max(state.P0, ...samples.map(p => p.P)) * 1.12;
    } else {
      minY = Math.min(0, ...samples.map(p => p.r));
      maxY = Math.max(0, ...samples.map(p => p.r));
      const padding = Math.max(0.045, (maxY - minY) * 0.12);
      minY -= padding;
      maxY += padding;
    }

    const toX = t => bounds.L + (t / HORIZON) * (bounds.R - bounds.L);
    const toY = y => bounds.B - (y - minY) / (maxY - minY) * (bounds.B - bounds.U);
    svg.replaceChildren();

    for (let i = 0; i <= 4; i++) {
      const v = minY + (maxY - minY) * i / 4;
      const y = toY(v);
      el(svg, 'line', { x1: bounds.L, y1: y, x2: bounds.R, y2: y, class: 'db-grid' });
      el(svg, 'text', {
        x: bounds.L - 10, y: y + 4, 'text-anchor': 'end', class: 'db-axis-text'
      }, kind === 'P' ? fmt(v, 0) : fmt(v, 2));
    }

    for (let i = 0; i <= 4; i++) {
      const t = i * 3;
      const x = toX(t);
      el(svg, 'line', { x1: x, y1: bounds.U, x2: x, y2: bounds.B, class: 'db-grid' });
      el(svg, 'text', { x, y: bounds.B + 22, 'text-anchor': 'middle', class: 'db-axis-text' }, String(t));
    }

    el(svg, 'text', { x: bounds.L, y: 14, class: 'db-axis-text' },
      kind === 'P' ? 'Bacterias' : 'r(t) · h⁻¹');
    el(svg, 'text', {
      x: bounds.R, y: H - 8, 'text-anchor': 'end', class: 'db-axis-text'
    }, 'Tiempo (h)');

    if (kind === 'r' && minY < 0 && maxY > 0) {
      el(svg, 'line', {
        x1: bounds.L, y1: toY(0), x2: bounds.R, y2: toY(0), class: 'db-zero'
      });
    }

    const path = samples.map((point, i) => {
      const value = kind === 'P' ? point.P : point.r;
      return `${i === 0 ? 'M' : 'L'}${toX(point.t).toFixed(2)},${toY(value).toFixed(2)}`;
    }).join(' ');
    el(svg, 'path', { d: path, class: kind === 'P' ? 'db-line-p' : 'db-line-r' });

    const x = toX(state.t);
    const current = sample(state.t, state.P0, state.r0, state.a);
    el(svg, 'line', {
      x1: x, y1: bounds.U, x2: x, y2: bounds.B, class: 'db-cursor'
    });
    el(svg, 'circle', {
      cx: x, cy: toY(kind === 'P' ? current.P : current.r), r: 5,
      class: kind === 'P' ? 'db-dot-p' : 'db-dot-r'
    });

    return { W, left: bounds.L, right: bounds.R };
  }

  function mount(selector) {
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root || root.dataset.dbMounted === '1') return;
    root.dataset.dbMounted = '1';
    root.innerHTML = `
      <div class="db-app">
        <div class="db-controls" role="group" aria-label="Parámetros del modelo">
          <label class="db-control">
            <span class="db-label">Población inicial P₀ <output id="db-P0-value">100</output></span>
            <input id="db-P0" type="range" min="50" max="500" step="50" value="100">
            <small>Bacterias iniciales</small>
          </label>
          <label class="db-control">
            <span class="db-label">Parámetro inicial r₀ <output id="db-r0-value">0,40</output></span>
            <input id="db-r0" type="range" min="0.10" max="0.70" step="0.01" value="0.40">
            <small>En h⁻¹</small>
          </label>
          <label class="db-control">
            <span class="db-label">Deterioro a <output id="db-a-value">0,050</output></span>
            <input id="db-a" type="range" min="0" max="0.10" step="0.005" value="0.05">
            <small>En h⁻² · a = 0 significa sin deterioro</small>
          </label>
          <label class="db-control">
            <span class="db-label">Tiempo t <output id="db-t-value">6,0 h</output></span>
            <input id="db-t" type="range" min="0" max="12" step="0.1" value="6">
            <small>Selecciona un instante, de 0 a 12 horas</small>
          </label>
        </div>

        <div class="db-actions">
          <button class="db-button db-button-primary" id="db-play" type="button">▶ Reproducir</button>
          <button class="db-button" id="db-reset" type="button">Restablecer</button>
          <button class="db-button" id="db-csv" type="button">Descargar datos CSV</button>
        </div>

        <div class="db-observation" aria-live="polite" aria-label="Valores del instante seleccionado">
          <div><small>Tiempo seleccionado</small><strong id="db-time-result">6,0 h</strong></div>
          <div><small>Población P(t)</small><strong id="db-population-result">182,21 bacterias</strong></div>
          <div><small>Parámetro r(t)</small><strong id="db-parameter-result">0,10 h⁻¹</strong></div>
        </div>

        <div class="db-charts">
          <figure class="db-figure">
            <figcaption>Población bacteriana</figcaption>
            <div class="db-plot-scroll">
              <svg class="db-plot" id="db-plot-population" viewBox="0 0 580 288"
                role="img" aria-label="Gráfica de la población P(t) frente al tiempo"></svg>
            </div>
            <small>La curva representa el número esperado de bacterias según el modelo.</small>
          </figure>
          <figure class="db-figure">
            <figcaption>Parámetro de crecimiento</figcaption>
            <div class="db-plot-scroll">
              <svg class="db-plot" id="db-plot-parameter" viewBox="0 0 580 288"
                role="img" aria-label="Gráfica del parámetro r(t) frente al tiempo"></svg>
            </div>
            <small>Observa cuándo r(t) es positivo, nulo o negativo.</small>
          </figure>
        </div>

        <div class="db-table-wrap">
          <h3>Tabla de valores</h3>
          <p>Valores calculados cada dos horas. El archivo CSV ofrece los valores con ocho cifras decimales.</p>
          <div class="db-table-scroll">
            <table class="db-table">
              <thead>
                <tr><th scope="col">Tiempo (h)</th><th scope="col">Población P(t)</th><th scope="col">Parámetro r(t) (h⁻¹)</th></tr>
              </thead>
              <tbody id="db-table-body"></tbody>
            </table>
          </div>
        </div>
        <p class="db-hint">Las gráficas y la tabla muestran P(t) y r(t). El cálculo de las derivadas, el estudio de sus signos y la localización analítica de los extremos quedan a cargo de los estudiantes.</p>
      </div>`;

    const get = id => root.querySelector('#' + id);
    const P0input = get('db-P0');
    const r0input = get('db-r0');
    const ainput = get('db-a');
    const tinput = get('db-t');
    const playBtn = get('db-play');
    let animation = null;
    let previousTime = null;

    function state() {
      return {
        P0: Number(P0input.value),
        r0: Number(r0input.value),
        a: Number(ainput.value),
        t: Number(tinput.value)
      };
    }

    function stop() {
      if (animation !== null) {
        clearInterval(animation);
        animation = null;
      }
      playBtn.textContent = '▶ Reproducir';
    }

    function render() {
      const s = state();
      const m = sample(s.t, s.P0, s.r0, s.a);

      get('db-P0-value').textContent = fmt(s.P0, 0);
      get('db-r0-value').textContent = fmt(s.r0, 2);
      get('db-a-value').textContent = fmt(s.a, 3);
      get('db-t-value').textContent = fmt(s.t, 1) + ' h';
      get('db-time-result').textContent = fmt(s.t, 1) + ' h';
      get('db-population-result').textContent = fmt(m.P, 2) + ' bacterias';
      get('db-parameter-result').textContent = fmt(m.r, 3) + ' h⁻¹';

      plot(get('db-plot-population'), 'P', s);
      plot(get('db-plot-parameter'), 'r', s);

      const rows = [];
      for (let t = 0; t <= HORIZON; t += 2) {
        const v = sample(t, s.P0, s.r0, s.a);
        rows.push(`<tr><td>${fmt(t, 0)}</td><td>${fmt(v.P, 2)}</td><td>${fmt(v.r, 3)}</td></tr>`);
      }
      get('db-table-body').innerHTML = rows.join('');
      previousTime = s.t;
    }

    function setTimeFromPlot(event, svg) {
      const bounds = svg.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const viewX = (event.clientX - bounds.left) / bounds.width * 580;
      const time = Math.max(0, Math.min(HORIZON, (viewX - 65) / (580 - 18 - 65) * HORIZON));
      tinput.value = time.toFixed(1);
      render();
    }

    [P0input, r0input, ainput, tinput].forEach(input => {
      input.addEventListener('input', () => { stop(); render(); });
    });

    [get('db-plot-population'), get('db-plot-parameter')].forEach(svg => {
      svg.addEventListener('click', event => { stop(); setTimeFromPlot(event, svg); });
    });

    playBtn.addEventListener('click', () => {
      if (animation !== null) { stop(); return; }
      if (Number(tinput.value) >= HORIZON) tinput.value = '0';
      playBtn.textContent = 'Ⅱ Pausar';
      animation = setInterval(() => {
        if (!root.isConnected) { stop(); return; }
        const next = Math.min(HORIZON, Number(tinput.value) + 0.1);
        tinput.value = next.toFixed(1);
        render();
        if (next >= HORIZON) stop();
      }, 100);
    });

    get('db-reset').addEventListener('click', () => {
      stop();
      P0input.value = DEFAULT.P0;
      r0input.value = DEFAULT.r0;
      ainput.value = DEFAULT.a;
      tinput.value = DEFAULT.t;
      render();
    });

    get('db-csv').addEventListener('click', () => {
      const s = state();
      const lines = ['tiempo_h,poblacion_estimada,r_h_inv'];
      for (let i = 0; i <= 48; i++) {
        const t = i * 0.25;
        const v = sample(t, s.P0, s.r0, s.a);
        lines.push([t.toFixed(2), v.P.toFixed(8), v.r.toFixed(6)].join(','));
      }
      const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
        type: 'text/csv;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'crecimiento_bacteriano_datos.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      playBtn.disabled = true;
      playBtn.textContent = 'Animación desactivada';
      playBtn.title = 'La preferencia del dispositivo es reducir el movimiento. Utiliza el control de tiempo.';
    }

    render();
  }

  window.DeterioroBacterianoApp = { mount };
})();
