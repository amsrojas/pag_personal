"""
Núcleo de cálculo de la aplicación «Área con marco rectangular».

Usa el método de los dos bordes del cuaderno AREA_CONTORNO_BORDE_RECTANGULO.
La detección ofrece ajustes independientes para el marco y la figura. No depende de Colab. Solo usa numpy y OpenCV.

Flujo:
    med = Medicion(imagen_bgr)        # umbral adaptativo
    med.detectar()                    # anillos y candidatos a marco
    med.opcion_marco(i)               # imagen con el candidato i
    med.confirmar_marco(i)            # ajusta esquinas, busca figuras
    med.opcion_figura(j)              # imagen con la figura j
    med.calcular(j, LADO_1_MM, LADO_2_MM)
"""

import cv2
import numpy as np

# ==============================
# PARÁMETROS
# ==============================

UMBRAL_BLOQUE = 31
UMBRAL_C = 6
AREA_MIN_CONTORNO = 100
CELDA_MM = 5.0
RESOLUCION_VISTA = 4.0
LADO_MAX_PRESENTACION = 1200   # px del lado mayor de las imágenes que se muestran
CALIDAD_JPEG = 85


# Fracción mínima de foto, tolerancias de aproximación como fracción del
# perímetro, desplazamiento máximo de esquinas relativo al lado menor.
PERFILES_MARCO = {
    "flexible": (.01, (.02, .015, .01, .03, .045), .15),
    "equilibrado": (.03, (.02, .015, .01, .03), .10),
    "estricto": (.05, (.02, .015, .01), .06),
}
# Área interior mínima, margen mínimo por eje y semidiferencia máxima,
# expresados como fracciones del marco, del eje y del área media, respectivamente.
PERFILES_FIGURA = {
    "flexible": (.0003, 0, .20),
    "equilibrado": (.001, .005, .10),
    "estricto": (.0025, .015, .05),
}

def cerrar_trazos(original, radio):
    if radio == 0:
        return original
    tam = 2 * radio + 1
    disco = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (tam, tam))
    return cv2.morphologyEx(original, cv2.MORPH_CLOSE, disco)

def evidencia_tinta(gris, quad, grosor, contraste):
    """Fracción de muestras con tinta más oscura que el papel a ambos lados."""
    q = ordenar_esquinas(quad)
    distancia = max(6, 1.8 * grosor + 3)
    fracciones = []
    for a, b in zip(q, np.roll(q, -1, axis=0)):
        d = b - a
        normal = np.array([-d[1], d[0]]) / np.linalg.norm(d)
        centros = a + np.linspace(.12, .88, 40)[:, None] * d
        def muestras(offset):
            xy = np.rint(centros + offset * normal).astype(int)
            dentro = ((xy[:, 0] >= 0) & (xy[:, 0] < gris.shape[1])
                      & (xy[:, 1] >= 0) & (xy[:, 1] < gris.shape[0]))
            v = np.full(len(xy), np.nan)
            v[dentro] = gris[xy[dentro, 1], xy[dentro, 0]]
            return v
        # El cuadrilátero inicial aproxima el borde interior, no el centro del trazo.
        tinta = np.min([muestras(k) for k in np.linspace(-grosor, grosor, 9)], axis=0)
        fondos = np.minimum(muestras(-distancia), muestras(distancia))
        fracciones.append(float(np.mean(fondos-tinta >= contraste)))
    return min(fracciones)

def extraer_anillos(mascara):
    cs, jerarquia = cv2.findContours(mascara, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    anillos = {}
    if jerarquia is not None:
        for i, (_, _, hijo, padre) in enumerate(jerarquia[0]):
            if padre != -1:
                continue
            huecos = []
            while hijo != -1:
                if cv2.contourArea(cs[hijo]) > AREA_MIN_CONTORNO:
                    huecos.append(hijo)
                hijo = jerarquia[0][hijo][0]
            if huecos:
                anillos[i] = sorted(huecos, key=lambda j: cv2.contourArea(cs[j]), reverse=True)
    return cs, anillos


# ==============================
# FUNCIONES GEOMÉTRICAS
# ==============================

def area_poligono(p):
    """Área mediante la fórmula de Gauss."""
    x, y = p[:, 0], p[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def transformar(c, H):
    """Transforma los puntos de un contorno mediante una homografía."""
    puntos = c.reshape(-1, 1, 2).astype(np.float64)
    return cv2.perspectiveTransform(puntos, H).reshape(-1, 2)


def ordenar_esquinas(q):
    """Ordena los vértices cíclicamente."""
    centro = q.mean(axis=0)
    angulos = np.arctan2(q[:, 1] - centro[1], q[:, 0] - centro[0])
    q = q[np.argsort(angulos)]
    return np.roll(q, -np.argmin(q.sum(axis=1)), axis=0)


def ajustar_recta(P, a, b, banda):
    """Ajusta la recta central de un lado, evitando las esquinas."""
    longitud = np.linalg.norm(b - a)
    u = (b - a) / longitud
    normal = np.array([-u[1], u[0]])

    s = (P - a) @ u / longitud
    seleccion = (s > 0.1) & (s < 0.9) & (np.abs((P - a) @ normal) < banda)

    for _ in range(2):
        if seleccion.sum() < 10:
            raise ValueError(
                "Un lado del marco tiene muy pocos píxeles. "
                "Revisa que el marco sea continuo."
            )

        vx, vy, x0, y0 = cv2.fitLine(
            P[seleccion].astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01
        ).ravel()

        p0 = np.array([x0, y0], dtype=float)
        v = np.array([vx, vy], dtype=float)
        normal = np.array([-v[1], v[0]])

        seleccion = (s > 0.1) & (s < 0.9) & (np.abs((P - p0) @ normal) < banda / 2)

    return p0, v


def interseccion(r1, r2):
    (p1, v1), (p2, v2) = r1, r2
    coeficiente, _ = np.linalg.solve(np.column_stack([v1, -v2]), p2 - p1)
    return p1 + coeficiente * v1


def validar_lado(nombre, valor):
    if (
        not isinstance(valor, (int, float))
        or isinstance(valor, bool)
        or not np.isfinite(valor)
        or valor <= 0
    ):
        raise ValueError(f"{nombre}: introduce un número positivo y finito.")
    return float(valor)


def codificar(img):
    """Reduce la imagen para presentarla y la devuelve como bytes JPEG."""
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    h, w = img.shape[:2]
    factor = LADO_MAX_PRESENTACION / max(h, w)
    if factor < 1:
        img = cv2.resize(
            img, (max(1, round(w * factor)), max(1, round(h * factor))),
            interpolation=cv2.INTER_AREA,
        )
    ok, datos = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, CALIDAD_JPEG])
    if not ok:
        raise ValueError("No se pudo preparar la imagen para mostrarla.")
    return datos.tobytes()


# ==============================
# MEDICIÓN
# ==============================

class Medicion:

    def __init__(self, imagen, perfil_marco="equilibrado", perfil_figura="equilibrado",
                 contraste=UMBRAL_C, cierre_marco=0, cierre_figura=0):
        if imagen is None or imagen.ndim != 3 or imagen.shape[2] != 3:
            raise ValueError("La fotografía no se pudo leer.")
        self.imagen = imagen
        self.alto, self.ancho = imagen.shape[:2]
        # Trazo de las líneas de selección proporcional a la foto,
        # para que se vean en la pantalla de un celular.
        self.trazo = max(3, round(max(self.alto, self.ancho) / 250))

        if perfil_marco not in PERFILES_MARCO or perfil_figura not in PERFILES_FIGURA:
            raise ValueError("Elige un perfil válido para el marco y la figura.")
        if not isinstance(contraste, (float, int)) or not 1 <= contraste <= 30:
            raise ValueError("El contraste mínimo debe estar entre 1 y 30.")
        for radio in (cierre_marco, cierre_figura):
            if not isinstance(radio, int) or not 0 <= radio <= 6:
                raise ValueError("El radio de cierre debe ser un entero entre 0 y 6 px.")
        self.etapa_mascara = "marco"
        self.perfil_marco, self.perfil_figura = perfil_marco, perfil_figura
        self.contraste = contraste
        gris = cv2.GaussianBlur(cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        self.gris = gris
        self.original = cv2.adaptiveThreshold(
            gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
            UMBRAL_BLOQUE, contraste,
        )

        self.binaria = cerrar_trazos(self.original, cierre_marco)
        self.mascara_figura = (self.binaria if cierre_marco == cierre_figura
                              else cerrar_trazos(self.original, cierre_figura))

    @classmethod
    def desde_rgba(cls, datos, ancho, alto, *ajustes):
        """Recibe los píxeles RGBA de un lienzo del navegador."""
        if hasattr(datos, "to_bytes"):      # objeto de JavaScript en Pyodide
            datos = datos.to_bytes()
        rgba = np.frombuffer(datos, dtype=np.uint8).reshape(int(alto), int(ancho), 4)
        return cls(cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGR), *ajustes)

    # ------------------------------
    # Detectar trazos y candidatos a marco
    # ------------------------------

    def detectar(self):
        self.etapa_mascara = "marco"
        cs, anillos = extraer_anillos(self.binaria)
        area_min, tolerancias, _ = PERFILES_MARCO[self.perfil_marco]
        self.auditoria_marco = {}
        candidatos = []
        for i, huecos in anillos.items():
            hueco = cs[huecos[0]]
            area = cv2.contourArea(hueco)
            fraccion = area / (self.alto * self.ancho)
            if fraccion < area_min or len(huecos) != 1:
                continue
            perimetro = cv2.arcLength(hueco, True)
            for eps in tolerancias:
                aprox = cv2.approxPolyDP(hueco, eps * perimetro, True)
                if len(aprox) == 4 and cv2.isContourConvex(aprox):
                    break
            else:
                continue
            quad = aprox.reshape(4, 2).astype(float)
            grosor = 1 + 2 * (cv2.contourArea(cs[i])-area) / (cv2.arcLength(cs[i], True)+perimetro)
            apoyo = evidencia_tinta(self.gris, quad, grosor, self.contraste)
            if self.perfil_marco == "estricto" and apoyo < .60:
                continue
            self.auditoria_marco[i] = (apoyo, fraccion)
            candidatos.append((i, quad))
        # Las líneas oscuras con papel a ambos lados tienen prioridad sobre un
        # borde de hoja. Entre candidatos de la misma categoría, primero el mayor.
        candidatos.sort(key=lambda par: (self.auditoria_marco[par[0]][0] >= .60,
                                         self.auditoria_marco[par[0]][1]), reverse=True)
        if not candidatos:
            raise ValueError(f"No aparece un marco cerrado con el perfil {self.perfil_marco}. "
                             f"Área mínima: {100*area_min:g}% de la foto. Revisa los trazos "
                             "y prueba otro perfil o ajusta el contraste.")
        self.cs, self.anillos, self.candidatos = cs, anillos, candidatos
        return len(candidatos)

    def imagen_binaria(self, tipo="marco"):
        mascara = self.mascara_figura if tipo == "figura" else self.binaria
        color = cv2.cvtColor(self.original, cv2.COLOR_GRAY2BGR)
        color[(mascara != 0) & (self.original == 0)] = (190, 50, 255)
        return codificar(color)

    def detalle_marco(self, indice):
        apoyo, fraccion = self.auditoria_marco[self.candidatos[indice][0]]
        return (f"Ocupa el {fraccion*100:.1f}% de la foto. En el lado con menor respaldo, "
                f"el {apoyo*100:.0f}% de las muestras tiene tinta más oscura que ambos lados.")

    def _dibujar(self, contorno):
        vista_previa = self.imagen.copy()
        cv2.drawContours(vista_previa, [contorno], -1, (255, 70, 0), self.trazo)
        return codificar(vista_previa)

    def opcion_marco(self, indice):
        return self._dibujar(self.cs[self.candidatos[indice][0]])

    # ------------------------------
    # Confirmar el marco y ajustar las esquinas
    # ------------------------------

    def confirmar_marco(self, seleccion):
        self.etapa_mascara = "marco"
        cs, anillos = self.cs, self.anillos
        i_m, quad = self.candidatos[seleccion]
        marco_ext = cs[i_m]
        marco_hueco = cs[anillos[i_m][0]]

        if len(anillos[i_m]) != 1:
            raise ValueError(
                "El marco tiene divisiones o contactos internos. "
                "Se requiere papel libre entre marco y figura."
            )

        _, etiquetas = cv2.connectedComponents(self.binaria)
        x0, y0 = marco_ext[0, 0]
        mascara_marco = etiquetas == etiquetas[y0, x0]
        ys, xs = np.nonzero(mascara_marco & (self.original != 0))
        P = np.column_stack([xs, ys]).astype(float)

        p_med = (cv2.arcLength(marco_ext, True) + cv2.arcLength(marco_hueco, True)) / 2
        grosor_px = (cv2.contourArea(marco_ext) - cv2.contourArea(marco_hueco)) / p_med + 1

        quad = ordenar_esquinas(quad)
        rectas = [
            ajustar_recta(P, quad[j], quad[(j + 1) % 4], 2 * grosor_px + 6)
            for j in range(4)
        ]

        try:
            esquinas = np.array([interseccion(rectas[j - 1], rectas[j]) for j in range(4)])
        except np.linalg.LinAlgError as exc:
            raise ValueError("No se pudieron ajustar las esquinas del marco.") from exc

        if (
            not np.isfinite(esquinas).all()
            or not cv2.isContourConvex(esquinas.astype(np.float32).reshape(-1, 1, 2))
        ):
            raise ValueError("El ajuste del marco no es válido. Repite la fotografía.")

        desplazamiento = np.max(np.linalg.norm(esquinas - quad, axis=1))
        lado_menor = np.min(np.linalg.norm(quad - np.roll(quad, 1, axis=0), axis=1))
        if desplazamiento > PERFILES_MARCO[self.perfil_marco][2] * lado_menor:
            raise ValueError("Las líneas ajustadas se alejan demasiado del marco detectado.")

        destino_unidad = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
        H_unidad = cv2.getPerspectiveTransform(esquinas.astype(np.float32), destino_unidad)

        self.etapa_mascara = "figura"
        if self.mascara_figura is self.binaria:
            cs_f, anillos_f = cs, anillos
        else:
            cs_f, anillos_f = extraer_anillos(self.mascara_figura)
        interiores = []
        for i in anillos_f:
            if self.mascara_figura is self.binaria and i == i_m:
                continue
            puntos = transformar(cs_f[i], H_unidad)
            if np.isfinite(puntos).all() and np.all(puntos > 0) and np.all(puntos < 1):
                interiores.append(i)
        interiores.sort(key=lambda i: cv2.contourArea(cs_f[i]), reverse=True)
        self.cs_figura, self.anillos_figura = cs_f, anillos_f
        if not interiores:
            raise ValueError(
                "No se detectó una figura cerrada dentro del marco. "
                "Repara las aberturas y evita tocar el marco."
            )

        self.esquinas = esquinas
        self.H_unidad = H_unidad
        self.interiores = interiores
        return len(interiores)

    def opcion_figura(self, posicion):
        return self._dibujar(self.cs_figura[self.interiores[posicion]])

    def _bordes(self, posicion):
        i = self.interiores[posicion]
        exterior = transformar(self.cs_figura[i], self.H_unidad)
        interior = transformar(self.cs_figura[self.anillos_figura[i][0]], self.H_unidad)
        ae, ai = area_poligono(exterior), area_poligono(interior)
        if not 0 < ai <= ae < 1:
            raise ValueError("Las áreas no son compatibles con una figura interior simple.")
        margen = min(exterior.min(), 1-exterior.max())
        return exterior, interior, ae, ai, margen, (ae-ai)/(ae+ai)

    def detalle_figura(self, posicion):
        _, _, _, ai, margen, banda = self._bordes(posicion)
        return (f"Área interior: {100*ai:.2f}% del marco. Separación mínima: {100*margen:.2f}% "
                f"del eje correspondiente. Diferencia de cada borde al promedio: {100*banda:.2f}%.")

    # ------------------------------
    # Calcular el área
    # ------------------------------

    def calcular(self, posicion, lado_1_mm, lado_2_mm):
        A = validar_lado("LADO_1_MM", lado_1_mm)
        B = validar_lado("LADO_2_MM", lado_2_mm)
        cs, anillos, interiores, H_unidad = self.cs_figura, self.anillos_figura, self.interiores, self.H_unidad

        i_f = interiores[posicion]
        if len(anillos[i_f]) != 1:
            raise ValueError(
                "La figura está dividida por trazos internos. "
                "Borra esas líneas antes de medir."
            )

        contorno_ext = cs[i_f]
        contorno_int = cs[anillos[i_f][0]]

        for j in interiores:
            if j == i_f:
                continue
            contenido = all(
                cv2.pointPolygonTest(contorno_ext, (float(x), float(y)), False) >= 0
                for x, y in cv2.convexHull(cs[j]).reshape(-1, 2)
            )
            if contenido:
                raise ValueError(
                    "Hay otra figura cerrada dentro de la seleccionada. "
                    "Borra las marcas internas."
                )

        ext_u, int_u, ae, ai, margen_rel, banda = self._bordes(posicion)
        minimo, separacion, max_banda = PERFILES_FIGURA[self.perfil_figura]
        motivos = []
        if ai < minimo:
            motivos.append(f"área interior {ai*100:.2f}% del marco (mínimo {minimo*100:g}%)")
        if margen_rel < separacion:
            motivos.append(f"separación {margen_rel*100:.2f}% (mínimo {separacion*100:g}%)")
        if banda > max_banda:
            motivos.append(f"diferencia al promedio {banda*100:.2f}% (máximo {max_banda*100:g}%)")
        if motivos:
            raise ValueError("El contorno excede los límites del perfil " + self.perfil_figura
                             + ": " + ", ".join(motivos) + ". Revisa la selección o ajusta el perfil.")
        area_marco = A * B
        if not np.isfinite(area_marco) or area_marco <= 0:
            raise ValueError("Las medidas del marco exceden el intervalo numérico.")
        a_ext_mm2, a_int_mm2 = ae * area_marco, ai * area_marco
        area_mm2 = ((ae + ai) / 2) * area_marco

        # Vista corregida: lado 1 horizontal y lado 2 vertical.
        k = min(RESOLUCION_VISTA, 1800 / max(A, B))
        margen = 20
        ancho_vista = int(np.ceil(A * k)) + 2 * margen + 1
        alto_vista = int(np.ceil(B * k)) + 2 * margen + 1

        S = np.array([[A * k, 0, margen], [0, B * k, margen], [0, 0, 1]], dtype=float)
        vista = cv2.warpPerspective(
            self.imagen, S @ H_unidad, (ancho_vista, alto_vista),
            borderValue=(255, 255, 255),
        )
        ext_v = np.rint(ext_u * [A * k, B * k] + margen).astype(np.int32)
        int_v = np.rint(int_u * [A * k, B * k] + margen).astype(np.int32)

        relleno = vista.copy()
        cv2.fillPoly(relleno, [int_v], (0, 200, 60))
        vista = cv2.addWeighted(relleno, 0.3, vista, 0.7, 0)
        cv2.polylines(vista, [ext_v], True, (0, 160, 0), 2)
        cv2.polylines(vista, [int_v], True, (0, 0, 220), 2)

        resultado = self.imagen.copy()
        cv2.polylines(resultado, [np.rint(self.esquinas).astype(np.int32)], True,
                      (255, 80, 0), self.trazo)
        cv2.drawContours(resultado, [contorno_ext], -1, (0, 160, 0), max(2, self.trazo // 2))
        cv2.drawContours(resultado, [contorno_int], -1, (0, 0, 220), max(2, self.trazo // 2))

        return {
            "area_mm2": float(area_mm2),
            "area_cm2": float(area_mm2 / 100),
            "interior_cm2": float(a_int_mm2 / 100),
            "exterior_cm2": float(a_ext_mm2 / 100),
            "celdas": float(area_mm2 / CELDA_MM ** 2),
            "celda_mm": float(CELDA_MM),
            "img_resultado": codificar(resultado),
            "img_vista": codificar(vista),
        }
