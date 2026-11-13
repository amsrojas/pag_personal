"""
Núcleo de cálculo de la aplicación «Área con marco rectangular».

Es el mismo algoritmo del cuaderno AREA_CONTORNO_BORDE_RECTANGULO.ipynb,
reorganizado en pasos para que una interfaz (web o Colab) pregunte entre
uno y otro. No depende de Colab. Solo usa numpy y OpenCV.

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

    def __init__(self, imagen):
        if imagen is None or imagen.ndim != 3 or imagen.shape[2] != 3:
            raise ValueError("La fotografía no se pudo leer.")
        self.imagen = imagen
        self.alto, self.ancho = imagen.shape[:2]
        # Trazo de las líneas de selección proporcional a la foto,
        # para que se vean en la pantalla de un celular.
        self.trazo = max(3, round(max(self.alto, self.ancho) / 250))

        # No se cierran aberturas automáticamente.
        gris = cv2.GaussianBlur(cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        self.binaria = cv2.adaptiveThreshold(
            gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
            UMBRAL_BLOQUE, UMBRAL_C,
        )

    @classmethod
    def desde_rgba(cls, datos, ancho, alto):
        """Recibe los píxeles RGBA de un lienzo del navegador."""
        if hasattr(datos, "to_bytes"):      # objeto de JavaScript en Pyodide
            datos = datos.to_bytes()
        rgba = np.frombuffer(datos, dtype=np.uint8).reshape(int(alto), int(ancho), 4)
        return cls(cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGR))

    # ------------------------------
    # Detectar trazos y candidatos a marco
    # ------------------------------

    def detectar(self):
        cs, jerarquia = cv2.findContours(
            self.binaria, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE
        )
        if jerarquia is None:
            raise ValueError("No se detectaron trazos. Revisa la foto y el umbral.")

        jerarquia = jerarquia[0]
        anillos = {}

        for i in range(len(cs)):
            if jerarquia[i][3] != -1:
                continue
            huecos = []
            j = int(jerarquia[i][2])
            while j != -1:
                if cv2.contourArea(cs[j]) > AREA_MIN_CONTORNO:
                    huecos.append(j)
                j = int(jerarquia[j][0])
            if huecos:
                anillos[i] = sorted(
                    huecos, key=lambda j: cv2.contourArea(cs[j]), reverse=True
                )

        candidatos = []
        for i, huecos in anillos.items():
            hueco = cs[huecos[0]]
            aproximacion = cv2.approxPolyDP(
                hueco, 0.02 * cv2.arcLength(hueco, True), True
            )
            if (
                len(aproximacion) == 4
                and cv2.isContourConvex(aproximacion)
                and cv2.contourArea(hueco) > 0.05 * self.alto * self.ancho
            ):
                candidatos.append((i, aproximacion.reshape(4, 2).astype(float)))

        candidatos.sort(key=lambda par: cv2.contourArea(cs[anillos[par[0]][0]]), reverse=True)

        if not candidatos:
            raise ValueError(
                "No se encontró un marco cerrado de cuatro lados. "
                "Cruza sus líneas en las esquinas y revisa la foto."
            )

        self.cs = cs
        self.anillos = anillos
        self.candidatos = candidatos
        return len(candidatos)

    def imagen_binaria(self):
        return codificar(self.binaria)

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
        ys, xs = np.nonzero(mascara_marco)
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
        if desplazamiento > 0.15 * lado_menor:
            raise ValueError("Las líneas ajustadas se alejan demasiado del marco detectado.")

        destino_unidad = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
        H_unidad = cv2.getPerspectiveTransform(esquinas.astype(np.float32), destino_unidad)

        def interior_marco(contorno):
            puntos = transformar(contorno, H_unidad)
            return np.isfinite(puntos).all() and np.all(puntos > 0) and np.all(puntos < 1)

        interiores = [i for i in anillos if i != i_m and interior_marco(cs[i])]
        interiores.sort(key=lambda i: cv2.contourArea(cs[i]), reverse=True)

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
        return self._dibujar(self.cs[self.interiores[posicion]])

    # ------------------------------
    # Calcular el área
    # ------------------------------

    def calcular(self, posicion, lado_1_mm, lado_2_mm):
        A = validar_lado("LADO_1_MM", lado_1_mm)
        B = validar_lado("LADO_2_MM", lado_2_mm)
        cs, anillos, interiores, H_unidad = self.cs, self.anillos, self.interiores, self.H_unidad

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

        ext_u = transformar(contorno_ext, H_unidad)
        int_u = transformar(contorno_int, H_unidad)

        # El producto A*B no cambia al intercambiar las medidas.
        area_marco = A * B
        a_ext_mm2 = area_poligono(ext_u) * area_marco
        a_int_mm2 = area_poligono(int_u) * area_marco
        area_mm2 = (a_ext_mm2 + a_int_mm2) / 2

        if not 0 < a_int_mm2 <= a_ext_mm2 < area_marco:
            raise ValueError("Las áreas no son compatibles con una figura interior simple.")

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
