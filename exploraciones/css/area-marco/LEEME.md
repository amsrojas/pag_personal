# Área con marco rectangular — aplicación web instalable

Versión para celular del cuaderno `AREA_CONTORNO_BORDE_RECTANGULO.ipynb`. El cálculo es el mismo código Python. Corre dentro del navegador del estudiante con Pyodide (Python compilado a WebAssembly), sin servidor y sin cuenta.

## Archivos

| Archivo | Función |
|---|---|
| `index.html` | Interfaz: medidas, foto, confirmación Sí/No y resultados |
| `area_core.py` | Algoritmo del cuaderno, separado en pasos. Es el único archivo de cálculo |
| `sw.js` | Guarda la aplicación y Python en el celular para usarla sin conexión |
| `manifest.webmanifest`, `icono-*.png` | Nombre e ícono al instalarla |
| `prueba/foto_prueba.jpg` | Foto sintética de prueba. Con lados 160 y 220 mm el área exacta es 82,07 cm² |

## Publicar gratis en GitHub Pages

1. En GitHub, crea un repositorio público, por ejemplo `area-marco`.
2. Sube todos los archivos a la raíz del repositorio (*Add file → Upload files*).
3. En *Settings → Pages*, elige *Deploy from a branch*, rama `main`, carpeta `/ (root)`, y guarda.
4. Después de uno o dos minutos la aplicación queda en `https://TU-USUARIO.github.io/area-marco/`.

También funciona en una carpeta de cualquier sitio web que use HTTPS. La instalación exige HTTPS.

## Instalar en el celular

- **Android (Chrome):** abrir el enlace y tocar *Instalar en este celular*, o el menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** abrir el enlace, tocar *Compartir* → *Agregar a pantalla de inicio*.

La primera apertura descarga unos 20 MB (Python, numpy y OpenCV). Desde entonces funciona sin conexión. Cada apertura tarda unos segundos mientras Python se prepara.

## Modificar la aplicación

- El cálculo y sus parámetros (`UMBRAL_BLOQUE`, `UMBRAL_C`, `CELDA_MM`…) están al comienzo de `area_core.py`.
- El tamaño máximo de la foto (`LADO_MAXIMO_FOTO`) y los textos están en `index.html`.
- Después de cualquier cambio, sube el número de `CACHE_APP` en `sw.js` (`app-v1` → `app-v2`). Así los celulares que ya la instalaron reciben la versión nueva.
- Si publicas otra app instalable en el mismo sitio, ponla en su propia carpeta y dale a su `sw.js` un `PREFIJO` distinto.

## Usar el mismo núcleo en Colab

```python
import cv2, area_core as core
med = core.Medicion(cv2.imread("contorno.png"))
med.detectar()                  # número de candidatos a marco
med.confirmar_marco(0)          # índice del marco correcto
r = med.calcular(0, 160, 220)   # índice de la figura y lados en mm
print(r["area_cm2"])
```
