# Área con marco rectangular — aplicación web instalable

Versión para celular del cuaderno `AREA_CONTORNO_BORDE_RECTANGULO.ipynb`. La medida es el promedio de las áreas de los dos bordes del trazo, después de corregir la perspectiva con el marco. Corre dentro del navegador del estudiante con Pyodide (Python compilado a WebAssembly), sin servidor y sin cuenta.

## Archivos

| Archivo | Función |
|---|---|
| `index.html` | Interfaz: medidas, foto, confirmación Sí/No y resultados |
| `area_core.py` | Algoritmo del cuaderno, separado en pasos. Es el único archivo de cálculo |
| `sw.js` | Guarda la aplicación y Python en el celular para usarla sin conexión |
| `manifest.webmanifest`, `icono-*.png` | Nombre e ícono al instalarla |
| `prueba/foto_prueba.jpg` | Foto sintética de prueba. Con lados 160 y 220 mm el área de referencia es 82.07 cm² |

## Publicar gratis en GitHub Pages

1. En GitHub, crea un repositorio público, por ejemplo `area-marco`.
2. Sube todos los archivos a la raíz del repositorio (*Add file → Upload files*).
3. En *Settings → Pages*, elige *Deploy from a branch*, rama `main`, carpeta `/ (root)`, y guarda.
4. Después de uno o dos minutos la aplicación queda en `https://TU-USUARIO.github.io/area-marco/`.

También funciona en una carpeta de cualquier sitio web que use HTTPS. La instalación exige HTTPS.

## Instalar en el celular

- **Android (Chrome):** abrir el enlace y tocar *Instalar en este celular*, o el menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** abrir el enlace, tocar *Compartir* → *Agregar a pantalla de inicio*.

Completa una primera carga con conexión hasta que aparezca «Listo para medir». El funcionamiento sin conexión depende de que el navegador conserve en caché los archivos de la aplicación, Python, NumPy y OpenCV. Cada apertura tarda unos segundos mientras Python se prepara.

## Ajustes de detección

Los dos perfiles son independientes. Por defecto, ambos son equilibrados y el cierre está desactivado. En la selección, abre «Detalles de la detección» para consultar los valores de cada candidato.

| Criterio | Flexible | Equilibrado | Estricto |
|---|---:|---:|---:|
| Área mínima del marco como porcentaje de la foto | 1 % | 3 % | 5 % |
| Desplazamiento máximo de esquinas como porcentaje del lado menor | 15 % | 10 % | 6 % |
| Área interior mínima de la figura como porcentaje del marco | 0.03 % | 0.10 % | 0.25 % |
| Separación mínima del contorno al marco como porcentaje de cada eje | Mayor que cero | 0.5 % | 1.5 % |
| Semidiferencia máxima entre bordes como porcentaje de su promedio | 20 % | 10 % | 5 % |

Se muestrean 40 posiciones en el tramo central de cada lado del marco. La prioridad favorece candidatos con tinta más oscura que ambos flancos en al menos el 60 % de las muestras de cada lado. El perfil estricto exige ese respaldo en los cuatro lados. Conviene confirmar visualmente que el marco señalado corresponde al que se midió sobre la hoja.

Un contraste bajo ayuda a detectar lápiz tenue. Los cierres del marco y de la figura se aplican por separado, en la foto reducida. «Ver trazos detectados» muestra el cierre de la etapa en curso. Revisa en magenta los píxeles añadidos antes de aceptar la selección.

## Modificar la aplicación

- El cálculo y sus parámetros (`UMBRAL_BLOQUE`, `UMBRAL_C`, `PERFILES_MARCO`, `PERFILES_FIGURA`) están al comienzo de `area_core.py`.
- El tamaño máximo de la foto (`LADO_MAXIMO_FOTO`) y los textos están en `index.html`.
- Después de cualquier cambio, sube el número de `CACHE_APP` en `sw.js` (por ejemplo, de `app-v3` a `app-v4`). Así los celulares que ya la instalaron reciben la versión nueva.
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
