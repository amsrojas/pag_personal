// Service worker: guarda la aplicación y Python en el celular
// para que funcione sin conexión después de la primera carga.
// Al publicar cambios en los archivos propios, sube el número de CACHE_APP.
// Python se guarda aparte, así una actualización de la aplicación no lo descarga de nuevo.
// Todas las cachés de esta app empiezan por PREFIJO. Al limpiar solo se tocan esas,
// para no borrar las de otras apps publicadas en el mismo sitio.

const PREFIJO = "area-marco:";
const CACHE_APP = PREFIJO + "app-v1";
const CACHE_PYTHON = PREFIJO + "pyodide-314.0.7";
const PROPIOS = [
  "./",
  "index.html",
  "area_core.py",
  "manifest.webmanifest",
  "icono-180.png",
  "icono-192.png",
  "icono-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(PROPIOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  const vigentes = [CACHE_APP, CACHE_PYTHON];
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c.startsWith(PREFIJO) && !vigentes.includes(c)).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

function guardar(nombre, peticion, respuesta) {
  if (respuesta.ok || respuesta.type === "opaque") {
    const copia = respuesta.clone();
    caches.open(nombre).then((cache) => cache.put(peticion, copia));
  }
  return respuesta;
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);

  // Python y sus paquetes: direcciones con versión fija, se descargan una sola vez.
  if (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/pyodide/")) {
    evento.respondWith(
      caches.match(peticion, { cacheName: CACHE_PYTHON })
        .then((guardada) => guardada || fetch(peticion).then((r) => guardar(CACHE_PYTHON, peticion, r)))
    );
    return;
  }

  // Archivos propios: primero la red, para recibir actualizaciones, y la copia guardada sin conexión.
  if (url.origin === self.location.origin) {
    evento.respondWith(
      fetch(peticion)
        .then((r) => guardar(CACHE_APP, peticion, r))
        .catch(() => caches.match(peticion, { ignoreSearch: true }))
    );
  }
});
