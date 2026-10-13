
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("lsystem-interactive");

  // Crear elementos dinámicamente
  container.innerHTML = `
    <style>
      .ls-container {
        display: grid;
        grid-template-columns: 1fr 2fr;
        gap: 2rem;
        align-items: start;
        justify-content: center;
        padding-bottom: 1rem;
      }
      .ls-controls {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        min-width: 200px;
      }
      .ls-container canvas {
        width: 100%;
        height: auto;
        border: 1px solid #DFE2DD;
        border-radius: 8px;
        background-color: #ffffff;
      }
      .ls-container button {
        background-color: #253D52;
        color: white;
        border: none;
        padding: 0.5rem;
        border-radius: 6px;
        cursor: pointer;
      }
      .ls-container button:hover {
        background-color: #366B61;
      }
      input[type=range] {
        width: 100%;
      }
      label span.value {
        float: right;
        font-weight: bold;
        color: #366B61;
      }
      @media (max-width: 768px) {
        .ls-container {
          display: flex;
          flex-direction: column;
        }
        .ls-container canvas {
          width: 100vw !important;
          max-width: 100%;
          margin: 0 auto;
        }
      }
    </style>
    <div class="ls-container">
      <div class="ls-controls">
        <label for="ls-model">Modelo:</label>
        <select id="ls-model" onchange="setLSDefaults()">
          <option value="koch_exp">📏 Koch </option>
          <option value="arbol">🌱 Árbol</option>
          <option value="koch">📐 Koch Clásico</option>
          <option value="helecho">🌿 Helecho</option>
        </select>
        <label for="ls-iter">Iteraciones (0–5):</label>
        <input type="number" id="ls-iter" min="0" max="5" value="1" />
        <label for="ls-angle">Ángulo: <span class="value" id="ls-angle-val">90°</span></label>
        <input type="range" id="ls-angle" min="0" max="90" step="1" value="90"
          oninput="document.getElementById('ls-angle-val').textContent = this.value + '°'" />
        <button onclick="drawLS()">Generar</button>
      </div>
      <div>
        <canvas id="ls-canvas"></canvas>
        <p style="text-align: center; margin-top: 0.5rem;">Vista generada del L-Sistema</p>
      </div>
    </div>
  `;

  window.setLSDefaults = function () {
    const model = document.getElementById("ls-model").value;
    let angle = 90;
    if (model === "koch" || model === "koch_exp") angle = 90;
    if (model === "helecho") angle = 25;
    document.getElementById("ls-angle").value = angle;
    document.getElementById("ls-angle-val").textContent = angle + "°";
  };

  window.drawLS = function () {
    const canvas = document.getElementById("ls-canvas");
    const ctx = canvas.getContext("2d");
    const model = document.getElementById("ls-model").value;
    let iter = parseInt(document.getElementById("ls-iter").value);
    const angleDeg = parseFloat(document.getElementById("ls-angle").value);

  // ✅ Validación suave: limitar iteraciones a 5 como máximo
  if (iter > 5) {
    iter = 5;
    document.getElementById("ls-iter").value = "5";
  } else if (iter < 0 || isNaN(iter)) {
    iter = 0;
    document.getElementById("ls-iter").value = "0";
  }

    let axiom = "F";
    let rules = {};
    let startAngle = 0;

    if (model === "koch_exp") {
      rules = { "F": "F+F-F-F+F" };
    } else if (model === "arbol") {
      axiom = "F";
      rules = { "F": "F[+F]F[-F]F" };
      startAngle = -90;
    } else if (model === "koch") {
      rules = { "F": "F-F++F-F" };
    } else if (model === "helecho") {
      axiom = "X";
      rules = { "X": "F[+X]F[-X]+X", "F": "FF" };
      startAngle = -90;
    }

    let seq = axiom;
    for (let i = 0; i < iter; i++) {
      seq = seq.split("").map(c => rules[c] || c).join("");
    }

    // Simular para obtener bounding box
    let x = 0, y = 0, angle = startAngle * Math.PI / 180;
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    let stack = [];

    for (let c of seq) {
      if (c === "F") {
        x += Math.cos(angle);
        y += Math.sin(angle);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      } else if (c === "+") {
        angle -= angleDeg * Math.PI / 180;
      } else if (c === "-") {
        angle += angleDeg * Math.PI / 180;
      } else if (c === "[") {
        stack.push([x, y, angle]);
      } else if (c === "]") {
        [x, y, angle] = stack.pop();
      }
    }

    const W = canvas.parentElement.clientWidth - 20;
    const H = W;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    const scale = 0.9 * Math.min(W / (maxX - minX), H / (maxY - minY));
    x = (W - (maxX - minX) * scale) / 2 - minX * scale;
    y = (H - (maxY - minY) * scale) / 2 - minY * scale;
    angle = startAngle * Math.PI / 180;
    stack = [];

    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let c of seq) {
      if (c === "F") {
        let x1 = x + scale * Math.cos(angle);
        let y1 = y + scale * Math.sin(angle);
        ctx.lineTo(x1, y1);
        x = x1;
        y = y1;
      } else if (c === "+") {
        angle -= angleDeg * Math.PI / 180;
      } else if (c === "-") {
        angle += angleDeg * Math.PI / 180;
      } else if (c === "[") {
        stack.push([x, y, angle]);
      } else if (c === "]") {
        [x, y, angle] = stack.pop();
        ctx.moveTo(x, y);
      }
    }

    ctx.strokeStyle = "#007744";
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  setLSDefaults();
  drawLS();
});
