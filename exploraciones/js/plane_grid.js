(function () {
  'use strict';

  // Arranca cuando el DOM está listo
  window.addEventListener('DOMContentLoaded', init);

  function init() {
    const cvs = document.getElementById('plane');
    if (!cvs) {
      console.warn('[plane_grid] No encontré <canvas id="plane">');
      return;
    }
    const ctx = cvs.getContext('2d');
    const probe = document.getElementById('probe');
    const probeInfo = document.getElementById('probeInfo') || { textContent: '' };
    const statusEl = document.getElementById('status') || { textContent: '' };

    // ---------- util ----------
    const clamp01 = x => Math.max(0, Math.min(1, x));
    const toHex2 = v => v.toString(16).padStart(2, '0');
    const hexFromRGB255 = ([R, G, B]) => '#' + toHex2(R) + toHex2(G) + toHex2(B);
    const cssVar = (name, fb) =>
      (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb);

    // ---------- sRGB <-> XYZ <-> LAB ----------
    function rgb255_to_01([R, G, B]) { return [R / 255, G / 255, B / 255].map(clamp01); }
    function rgb01_to_255([r, g, b]) { return [r, g, b].map(x => Math.round(clamp01(x) * 255)); }
    function srgb_to_linear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function linear_to_srgb(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
    const M_RGB2XYZ = [
      [0.4124564, 0.3575761, 0.1804375],
      [0.2126729, 0.7151522, 0.0721750],
      [0.0193339, 0.1191920, 0.9503041]
    ];
    const M_XYZ2RGB = [
      [3.2404542, -1.5371385, -0.4985314],
      [-0.9692660, 1.8760108, 0.0415560],
      [0.0556434, -0.2040259, 1.0572252]
    ];
    function fLab(t) { return t > Math.pow(6 / 29, 3) ? Math.cbrt(t) : (t / (3 * Math.pow(6 / 29, 2)) + 4 / 29); }
    function fInv(t) { const k = Math.pow(6 / 29, 3); return t > 6 / 29 ? t * t * t : 3 * k * (t - 4 / 29); }

    function rgb255_to_lab([R, G, B]) {
      const [r, g, b] = rgb255_to_01([R, G, B]).map(srgb_to_linear);
      const X = M_RGB2XYZ[0][0] * r + M_RGB2XYZ[0][1] * g + M_RGB2XYZ[0][2] * b;
      const Y = M_RGB2XYZ[1][0] * r + M_RGB2XYZ[1][1] * g + M_RGB2XYZ[1][2] * b;
      const Z = M_RGB2XYZ[2][0] * r + M_RGB2XYZ[2][1] * g + M_RGB2XYZ[2][2] * b;
      const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;
      const fx = fLab(X / Xn), fy = fLab(Y / Yn), fz = fLab(Z / Zn);
      const L = 116 * fy - 16;
      const a = 500 * (fx - fy);
      const b2 = 200 * (fy - fz);
      return [L, a, b2];
    }

    function lab_to_rgb255([L, a, b]) {
      const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
      const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883;
      const xr = fInv(fx), yr = fInv(fy), zr = fInv(fz);
      const X = Xn * xr, Y = Yn * yr, Z = Zn * zr;
      let r = M_XYZ2RGB[0][0] * X + M_XYZ2RGB[0][1] * Y + M_XYZ2RGB[0][2] * Z;
      let g = M_XYZ2RGB[1][0] * X + M_XYZ2RGB[1][1] * Y + M_XYZ2RGB[1][2] * Z;
      let bl = M_XYZ2RGB[2][0] * X + M_XYZ2RGB[2][1] * Y + M_XYZ2RGB[2][2] * Z;
      r = linear_to_srgb(r); g = linear_to_srgb(g); bl = linear_to_srgb(bl);
      return rgb01_to_255([r, g, bl]); // clamp 0..255
    }

    // Entradas RGB de A y B (defaults si no existen)
    const getA = () => [val('AR', 30), val('AG', 120), val('AB', 200)];
    const getB = () => [val('BR', 255), val('BG', 140), val('BB', 0)];
    function val(id, d) { const e = document.getElementById(id); return e ? parseInt(e.value || d, 10) : d; }

    // -------- GRID 10x10 α,β ∈ {0.1..1.0} --------
    function drawGridDiscrete(Ap, Bp, N = 11, margin = 28) {
      const W = cvs.width, H = cvs.height;
      ctx.clearRect(0, 0, W, H);

      const Lm = margin, Tm = margin, Rm = margin, Bm = margin;
      const gridW = W - Lm - Rm, gridH = H - Tm - Bm;
      const cw = Math.floor(gridW / N), ch = Math.floor(gridH / N);

      // Orientación por defecto:
      const alphas = Array.from({ length: N }, (_, i) => i / (N-1));   // izq→der: 0.1..1.0
      const betas  = Array.from({ length: N }, (_, j) => (N - 1 - j) / (N-1));   // arriba→abajo: 1.0..0.1
      // (Si prefieres β de abajo→arriba: usa (j+1)/N)

      // celdas
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const alpha = alphas[i], beta = betas[j];
          const L = alpha * Ap[0] + beta * Bp[0];
          const a = alpha * Ap[1] + beta * Bp[1];
          const b = alpha * Ap[2] + beta * Bp[2];
          const [R, G, B] = lab_to_rgb255([L, a, b]);

          ctx.fillStyle = `rgb(${R},${G},${B})`;
          const x = Lm + i * cw, y = Tm + j * ch;
          ctx.fillRect(x, y, cw, ch);
        }
      }

      // rejilla
      ctx.strokeStyle = cssVar('--border', '#303236'); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const x = Lm + i * cw; ctx.moveTo(x, Tm); ctx.lineTo(x, Tm + N * ch); }
      for (let j = 0; j <= N; j++) { const y = Tm + j * ch; ctx.moveTo(Lm, y); ctx.lineTo(Lm + N * cw, y); }
      ctx.stroke();

      // etiquetas
      ctx.fillStyle = cssVar('--muted', '#9aa0a6');
      ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) { const x = Lm + i * cw + cw / 2; ctx.fillText(alphas[i].toFixed(1), x, Tm + N * ch + 12); }
      ctx.textAlign = 'right';
      for (let j = 0; j < N; j++) { const y = Tm + j * ch + ch / 2; ctx.fillText(betas[j].toFixed(1), Lm - 10, y); }

      // guarda TODO en el estado
      drawGridDiscrete._state = { N, Lm, Tm, cw, ch, Ap, Bp, alphas, betas };
    }

    function cellFromEvent(e) {
      const st = drawGridDiscrete._state; if (!st) return null;
      const rect = cvs.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (cvs.width / rect.width);
      const py = (e.clientY - rect.top) * (cvs.height / rect.height);
      const { N, Lm, Tm, cw, ch, alphas, betas } = st;
      const gx = Math.floor((px - Lm) / cw);
      const gy = Math.floor((py - Tm) / ch);
      if (gx < 0 || gx >= N || gy < 0 || gy >= N) return null;
      return { alpha: alphas[gx], beta: betas[gy], gx, gy };
    }

    function probeGrid(e) {
      const st = drawGridDiscrete._state; if (!st) return;
      const c = cellFromEvent(e);
      if (!c) { if (probe) probe.style.background = 'transparent'; probeInfo.textContent = '–'; return; }

      const { Ap, Bp } = st;
      const L = c.alpha * Ap[0] + c.beta * Bp[0];
      const a = c.alpha * Ap[1] + c.beta * Bp[1];
      const b = c.alpha * Ap[2] + c.beta * Bp[2];
      const rgb = lab_to_rgb255([L, a, b]);
      const [R, G, B] = rgb;
      const hex = hexFromRGB255(rgb);

      if (probe) probe.style.background = hex;
      probeInfo.textContent = `α=${c.alpha.toFixed(1)}, β=${c.beta.toFixed(1)} · HEX=${hex} · RGB(${R}, ${G}, ${B})`;
    }

    async function copyGrid(e) {
      const st = drawGridDiscrete._state; if (!st) return;
      const c = cellFromEvent(e); if (!c) return;

      const { Ap, Bp } = st;
      const L = c.alpha * Ap[0] + c.beta * Bp[0];
      const a = c.alpha * Ap[1] + c.beta * Bp[1];
      const b = c.alpha * Ap[2] + c.beta * Bp[2];
      const rgb = lab_to_rgb255([L, a, b]);
      const [R, G, B] = rgb;
      const hex = hexFromRGB255(rgb);
      const payload = e.shiftKey ? `rgb(${R}, ${G}, ${B})` : hex; // Shift+click = RGB; click normal = HEX

      try { await navigator.clipboard.writeText(payload); statusEl.textContent = `Copiado ${payload}`; }
      catch { statusEl.textContent = 'No se pudo copiar'; }
      setTimeout(() => statusEl.textContent = 'OK', 1200);
    }

    function redraw() {
      const Ap = rgb255_to_lab(getA());
      const Bp = rgb255_to_lab(getB());
      drawGridDiscrete(Ap, Bp);
    }

    // eventos
    ['AR', 'AG', 'AB', 'BR', 'BG', 'BB'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', redraw);
    });
    cvs.addEventListener('mousemove', probeGrid);
    cvs.addEventListener('click', copyGrid);

    // primera pintura
    redraw();
  }
})();
