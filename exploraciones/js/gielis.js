/*
  gielis.js — Superfórmula de Gielis (simple, móvil primero)
  Cambios:
  - Sin sliders ni presets
  - Se ocultan las flechas/"spinners" de <input type=number>
  - Campos sólo no negativos (min=0) para a,b,n1,n2,n3, grosor y N
  - El usuario escribe decimales; m es entero ≥1
  - SVG debajo del formulario
*/
(function(){
  const TAU = Math.PI * 2;

  function superformula(phi, p){
    const c = Math.pow(Math.abs(Math.cos((p.m*phi)/4)/p.a), p.n2);
    const s = Math.pow(Math.abs(Math.sin((p.m*phi)/4)/p.b), p.n3);
    return Math.pow(c + s, -1/p.n1);
  }

  function buildPath(params, N, fit=0.95){
    const pts = new Array(N);
    let rmax = 0;
    for(let i=0;i<N;i++){
      const phi = (i/(N-1))*TAU;
      let r = superformula(phi, params);
      if(!isFinite(r)) r = 0;
      rmax = Math.max(rmax, r);
      const x = r*Math.cos(phi);
      const y = r*Math.sin(phi);
      pts[i] = [x,y];
    }
    const s = rmax>0 ? fit/rmax : 1;
    let d = '';
    for(let i=0;i<N;i++){
      const [x,y] = pts[i];
      d += (i===0? 'M ':'L ')+ (x*s)+' '+(-y*s)+' ';
    }
    return d + 'Z';
  }

  function numberInput(label, name, {value=0, min=0, step='any', inputMode='decimal'}){
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.innerHTML = `<span>${label}</span>`;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.name = name;
    inp.step = String(step);
    inp.min  = String(min);
    inp.value = String(value);
    inp.inputMode = inputMode; // móvil: teclado numérico/decimal
    wrap.appendChild(inp);
    return {el:wrap, input:inp};
  }

  function checkbox(label, name, checked=false){
    const wrap = document.createElement('label');
    wrap.className = 'field ck';
    const inp = document.createElement('input'); inp.type='checkbox'; inp.name=name; inp.checked=!!checked;
    const txt = document.createElement('span'); txt.textContent = label;
    wrap.appendChild(inp); wrap.appendChild(txt);
    return {el:wrap, input:inp};
  }

  function colorInput(label, name, value='#000000'){
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.innerHTML = `<span>${label}</span>`;
    const inp = document.createElement('input'); inp.type='color'; inp.name=name; inp.value=value;
    wrap.appendChild(inp);
    return {el:wrap, input:inp};
  }

  function createApp(root){
    root.className = 'gielis-simple';

    // --- Estilos (incluye ocultar spinners de number) ---
    const style = document.createElement('style');
    style.textContent = `
      .gielis-simple{ max-width: 720px; margin: 0 auto; padding: 12px; font: 14px system-ui,-apple-system,Segoe UI,Roboto,Arial }
      .gielis-simple .form{ display:flex; flex-direction:column; gap:10px; background:#fff; border:1px solid #e6e6e6; border-radius:12px; padding:12px }
      .gielis-simple .row{ display:grid; grid-template-columns: 1fr 1fr; gap:8px }
      @media(min-width:700px){ .gielis-simple .row{ grid-template-columns: repeat(3, 1fr) } }
      .gielis-simple .field{ display:flex; flex-direction:column; gap:4px }
      .gielis-simple .field > span{ color:#333; font-weight:500 }
      .gielis-simple input[type=number]{ width:100%; padding:8px; border:1px solid #ddd; border-radius:8px; }
      /* Oculta flechas en Chrome/Safari/Edge */
      .gielis-simple input[type=number]::-webkit-outer-spin-button,
      .gielis-simple input[type=number]::-webkit-inner-spin-button{ -webkit-appearance: none; margin: 0; }
      /* Oculta flechas en Firefox */
      .gielis-simple input[type=number]{ -moz-appearance: textfield; appearance: textfield; }
      .gielis-simple .field.ck{ flex-direction:row; align-items:center; gap:8px }
      .gielis-simple .buttons{ display:flex; gap:8px; margin-top:8px }
      .gielis-simple button{ padding:10px 12px; border:1px solid #ddd; border-radius:10px; background:#f6f6f6; cursor:pointer }
      .gielis-simple button:hover{ background:#eee }
      .gielis-simple .stage{ margin-top:12px; background:#fff; border:1px solid #e6e6e6; border-radius:12px; padding:8px }
      .gielis-simple svg{ display:block; width:100%; height:auto }
    `;
    root.appendChild(style);

    // --- Formulario ---
    const form = document.createElement('div'); form.className='form';
    const row1 = document.createElement('div'); row1.className='row';
    const row2 = document.createElement('div'); row2.className='row';

    // m entero >=1 (teclado numérico)
    const m = numberInput('m (entero ≥1)','m',{value:7, min:1, step:1, inputMode:'numeric'});

    // Reales no negativos
    const a = numberInput('a','a',{value:1.0, min:0, step:'any'});
    const b = numberInput('b','b',{value:1.0, min:0, step:'any'});
    const n1 = numberInput('n1','n1',{value:0.3, min:0, step:'any'});
    const n2 = numberInput('n2','n2',{value:0.6, min:0, step:'any'});
    const n3 = numberInput('n3','n3',{value:0.6, min:0, step:'any'});

    row1.append(m.el, a.el, b.el);
    row2.append(n1.el, n2.el, n3.el);

    const rowSty = document.createElement('div'); rowSty.className='row';
    const stroke = colorInput('Color trazo','stroke','#000000');
    const lw = numberInput('Grosor (px)','lw',{value:1, min:0, step:0.1});
    const N = numberInput('Resolución N','N',{value:2048, min:64, step:1});
    rowSty.append(stroke.el, lw.el, N.el);

    const fill = checkbox('Rellenar','fill',false);
    const fillColor = colorInput('Color relleno','fillColor','#000000');

    const buttons = document.createElement('div'); buttons.className='buttons';
    const btnDraw = document.createElement('button'); btnDraw.textContent='Dibujar';
    const btnExport = document.createElement('button'); btnExport.textContent='Exportar SVG';
    buttons.append(btnDraw, btnExport);

    form.append(row1, row2, rowSty, fill.el, fillColor.el, buttons);

    // --- Área de dibujo (debajo) ---
    const stage = document.createElement('div'); stage.className='stage';
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox','-1 -1 2 2');
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('fill','none'); path.setAttribute('stroke','#000'); path.setAttribute('stroke-width',String(1/100));
    svg.appendChild(path); stage.appendChild(svg);

    root.append(form, stage);

    function readParams(){
      return {
        m: Math.max(1, Math.round(Number(m.input.value)||7)),
        a: Math.max(0, Number(a.input.value)||1),
        b: Math.max(0, Number(b.input.value)||1),
        n1: Math.max(0, Number(n1.input.value)||0.3),
        n2: Math.max(0, Number(n2.input.value)||0.6),
        n3: Math.max(0, Number(n3.input.value)||0.6),
      };
    }

    function render(){
      const p = readParams();
      const Nval = Math.max(64, Math.round(Number(N.input.value)||2048));
      const d = buildPath(p, Nval, 0.95);
      path.setAttribute('d', d);
      path.setAttribute('stroke', stroke.input.value);
      path.setAttribute('stroke-width', String((Number(lw.input.value)||1)/100));
      path.setAttribute('fill', fill.input.checked ? fillColor.input.value : 'none');
    }

    btnDraw.addEventListener('click', render);

    btnExport.addEventListener('click', ()=>{
      render();
      const p = readParams();
      const Nval = Math.max(64, Math.round(Number(N.input.value)||2048));
      const d = buildPath(p, Nval, 0.95);
      const svgText = `<?xml version="1.0" encoding="UTF-8"?>\n`+
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2" width="1024" height="1024">`+
        `<path d="${d}" fill="${fill.input.checked?fillColor.input.value:'none'}" stroke="${stroke.input.value}" stroke-width="${(Number(lw.input.value)||1)/100}"/>`+
        `</svg>`;
      const blob = new Blob([svgText], {type:'image/svg+xml'});
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a');
      aEl.href=url; aEl.download=`gielis_m${readParams().m}.svg`;
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      URL.revokeObjectURL(url);
    });

    // Render inicial
    render();

    return { render };
  }

  // API pública
  window.GielisApp = {
    mount(selector){
      const root = (typeof selector === 'string') ? document.querySelector(selector) : selector;
      if(!root) throw new Error('GielisApp: contenedor no encontrado');
      return createApp(root);
    }
  };
})();
