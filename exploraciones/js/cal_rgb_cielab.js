// === Utilidades (sRGB D65) ===
function srgbToLinear(c){ return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
function linearToSrgb(c){ return c <= 0.0031308 ? 12.92*c : 1.055*Math.max(c,0)**(1/2.4) - 0.055; }
const M_RGB2XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];
const M_XYZ2RGB = [
  [ 3.2404542, -1.5371385, -0.4985314],
  [-0.9692660,  1.8760108,  0.0415560],
  [ 0.0556434, -0.2040259,  1.0572252],
];
const Xn = 0.95047, Yn = 1.0, Zn = 1.08883; // D65 (2°)
function dot3(m, v){
  return [
    m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
    m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
    m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
  ];
}
function clamp(x, lo, hi){ return Math.min(hi, Math.max(lo, x)); }
function clamp255(x){ return Math.min(255, Math.max(0, Math.round(x))); }
function fmt(x){ return Number(x).toFixed(2); }

// RGB (0–255) -> LAB
function rgb255ToLab(R, G, B){
  const r = srgbToLinear(R/255), g = srgbToLinear(G/255), b = srgbToLinear(B/255);
  let [X,Y,Z] = dot3(M_RGB2XYZ, [r,g,b]);
  X /= Xn; Y /= Yn; Z /= Zn;
  const eps = 216/24389, kappa = 24389/27;
  const f = t => t > eps ? Math.cbrt(t) : (kappa*t + 16)/116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  const L = 116*fy - 16;
  const a = 500*(fx - fy);
  const bb = 200*(fy - fz);
  return [L, a, bb];
}

// LAB -> RGB (0–255) con detección de gamut
function labToRgb255(L, a, b){
  const eps = 216/24389, kappa = 24389/27;
  const fy = (L + 16)/116;
  const fx = a/500 + fy;
  const fz = fy - b/200;
  const finv = t => {
    const t3 = t*t*t; return t3 > eps ? t3 : (116*t - 16)/kappa;
  };
  let X = Xn * finv(fx);
  let Y = Yn * finv(fy);
  let Z = Zn * finv(fz);
  let [rl, gl, bl] = dot3(M_XYZ2RGB, [X, Y, Z]);
  const sr = linearToSrgb(rl), sg = linearToSrgb(gl), sb = linearToSrgb(bl);
  const clipped = (sr<0||sr>1) || (sg<0||sg>1) || (sb<0||sb>1);
  const R = clamp255(sr*255), G = clamp255(sg*255), B = clamp255(sb*255);
  return { R, G, B, clipped };
}

function rgbToHex(R,G,B){
  return '#' + ((1<<24) + (R<<16) + (G<<8) + B).toString(16).slice(1).toUpperCase();
}

// ===== Wire-up cuando el DOM esté listo =====
document.addEventListener('DOMContentLoaded', () => {
  // --- DOM refs ---
  const inR = document.getElementById('inR');
  const inG = document.getElementById('inG');
  const inB = document.getElementById('inB');
  const swatchRGB = document.getElementById('swatchRGB');
  const hexRGB = document.getElementById('hexRGB');
  const Lval = document.getElementById('Lval');
  const aval = document.getElementById('aval');
  const bval = document.getElementById('bval');

  const inL = document.getElementById('inL');
  const ina = document.getElementById('ina');
  const inb = document.getElementById('inb');
  const swatchLAB = document.getElementById('swatchLAB');
  const hexLAB = document.getElementById('hexLAB');
  const Rval = document.getElementById('Rval');
  const Gval = document.getElementById('Gval');
  const Bval = document.getElementById('Bval');
  const gamutNote = document.getElementById('gamutNote');

  // --- Estados “último válido” para tolerar '-' durante edición LAB ---
  let lastL = Number(inL?.value || 50) || 50;
  let lastA = Number(ina?.value || 0) || 0;
  let lastB = Number(inb?.value || 0) || 0;

  function renderFromLAB(L, a, b, writeBack) {
    const {R,G,B, clipped} = labToRgb255(L, a, b);
    Rval.textContent = R; Gval.textContent = G; Bval.textContent = B;

    const hex = rgbToHex(R,G,B);
    hexLAB.textContent = hex;
    swatchLAB.style.background = `rgb(${R}, ${G}, ${B})`;
    swatchLAB.style.color = (0.2126*R + 0.7152*G + 0.0722*B) < 128 ? '#fff' : '#000';
    swatchLAB.setAttribute('aria-label', `Muestra LAB convertida a RGB ${R},${G},${B}`);

    gamutNote.innerHTML = clipped
      ? '<span class="warn">Advertencia:</span> el color LAB ingresado cae parcialmente fuera del rango sRGB. El valor mostrado se ajustó a RGB en [0,255].'
      : '';

    if (writeBack) {
      inL.value = L.toFixed(2);
      ina.value = a.toFixed(2);
      inb.value = b.toFixed(2);
    }
  }

  // Parser laxo: permite '-', '', '+', '.', '-.', '+.' mientras se escribe
  function parseLoose(s, lo, hi) {
    if (s === '' || s === '-' || s === '+' || s === '.' || s === '-.' || s === '+.') {
      return { ok: false };
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, value: Math.min(hi, Math.max(lo, n)) };
  }

  // === RGB → LAB ===
  function updateFromRGB(){
    let R = clamp(Number(inR.value||0), 0, 255) | 0;
    let G = clamp(Number(inG.value||0), 0, 255) | 0;
    let B = clamp(Number(inB.value||0), 0, 255) | 0;
    inR.value = R; inG.value = G; inB.value = B;

    const [L,a,b] = rgb255ToLab(R,G,B);
    Lval.textContent = fmt(L);
    aval.textContent = fmt(a);
    bval.textContent = fmt(b);

    const hex = rgbToHex(R,G,B);
    hexRGB.textContent = hex;
    swatchRGB.style.background = `rgb(${R}, ${G}, ${B})`;
    swatchRGB.style.color = (0.2126*R + 0.7152*G + 0.0722*B) < 128 ? '#fff' : '#000';
    swatchRGB.setAttribute('aria-label', `Muestra RGB ${R},${G},${B}`);
  }

  // === LAB → RGB (tolerante durante la escritura) ===
  function updateFromLABInput() {
    const Lp = parseLoose(inL.value, 0, 100);
    const ap = parseLoose(ina.value, -200, 200);
    const bp = parseLoose(inb.value, -200, 200);

    if (Lp.ok) lastL = Lp.value;
    if (ap.ok) lastA = ap.value;
    if (bp.ok) lastB = bp.value;

    // Renderiza con el último valor válido conocido
    renderFromLAB(lastL, lastA, lastB, /*writeBack=*/false);
  }

  function commitLABChange() {
    // Si el campo queda vacío o solo '-', usa último válido
    const Ltry = Number(inL.value);
    const Atry = Number(ina.value);
    const Btry = Number(inb.value);

    lastL = Number.isFinite(Ltry) ? clamp(Ltry, 0, 100) : lastL;
    lastA = Number.isFinite(Atry) ? clamp(Atry, -200, 200) : lastA;
    lastB = Number.isFinite(Btry) ? clamp(Btry, -200, 200) : lastB;

    renderFromLAB(lastL, lastA, lastB, /*writeBack=*/true);
  }

  // Eventos
  [inR,inG,inB].forEach(el => el.addEventListener('input', updateFromRGB));

  [inL,ina,inb].forEach(el => el.addEventListener('input', updateFromLABInput));
  [inL,ina,inb].forEach(el => el.addEventListener('change', commitLABChange));
  [inL,ina,inb].forEach(el => el.addEventListener('blur', commitLABChange));

  // Inicializa
  updateFromRGB();
  renderFromLAB(lastL, lastA, lastB, true);
});
