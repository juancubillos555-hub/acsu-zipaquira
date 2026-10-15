"use strict";

// ==========================================
// ACSU - SISTEMA PARA USUARIOS
// ==========================================
// El usuario y el administrador comparten datos a través
// del localStorage: "reportes", "alertas" y "notificacionesUsuario".
// Regla de oro: antes de guardar, SIEMPRE se lee la versión más
// reciente del almacenamiento, para no pisar los cambios del admin.
// ==========================================


// ==========================================
// CONSTANTES
// ==========================================

const CLAVES = {
    SESION: "acsuSesion",
    REPORTES: "reportes",
    ALERTAS: "alertas",
    NOTIFICACIONES: "notificacionesUsuario",
    TEMA: "temaUsuario"
};

const BARRIOS = [
    "Centro",
    "La Esmeralda",
    "San Pablo",
    "Barandillas",
    "La Paz",
    "Santa Isabel",
    "El Rodeo",
    "Algarra",
    "Comuneros"
];

const CENTRO_ZIPAQUIRA = [5.0221, -74.0048];


// ==========================================
// UTILIDADES
// ==========================================

function leer(clave, porDefecto) {
    try {
        const valor = JSON.parse(localStorage.getItem(clave));
        return valor === null || valor === undefined ? porDefecto : valor;
    } catch (error) {
        return porDefecto;
    }
}

function guardar(clave, valor) {
    try {
        localStorage.setItem(clave, JSON.stringify(valor));
        return true;
    } catch (error) {
        console.error("No se pudo guardar", clave, error);
        return false;
    }
}

// Evita que un texto escrito por un usuario se ejecute como HTML (XSS)
function escaparHTML(texto) {
    return String(texto === null || texto === undefined ? "" : texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function nuevoId() {
    return Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

function obtener(id) {
    return document.getElementById(id);
}


// ==========================================
// SESIÓN
// ==========================================

let sesion = leer(CLAVES.SESION, null);

if (!sesion || sesion.verificado !== true) {
    window.location.replace("login.html");
    sesion = { nombre: "", documento: "" };
}


// ==========================================
// REPORTES (lista compartida con el admin)
// ==========================================

function normalizarReporte(r, indice) {
    const tipo = r.tipo || r.delito || "Otro";

    return Object.assign({}, r, {
        id: r.id !== undefined && r.id !== null ? r.id : "antiguo-" + indice,
        tipo: tipo,
        delito: tipo,
        barrio: r.barrio || "No especificado",
        direccion: r.direccion || "No especificada",
        descripcion: r.descripcion || "Sin descripción",
        estado: !r.estado || r.estado === "Enviado" ? "Pendiente" : r.estado
    });
}

// Arregla reportes viejos guardados con otro formato (se hace una sola vez)
function migrarReportes() {
    const crudos = leer(CLAVES.REPORTES, []);

    if (!Array.isArray(crudos)) {
        guardar(CLAVES.REPORTES, []);
        return;
    }

    const normalizados = crudos.map(normalizarReporte);

    if (JSON.stringify(normalizados) !== JSON.stringify(crudos)) {
        guardar(CLAVES.REPORTES, normalizados);
    }
}

function leerReportes() {
    const lista = leer(CLAVES.REPORTES, []);
    return Array.isArray(lista) ? lista : [];
}

function misReportes() {
    return leerReportes().filter(function (r) {
        return r.documento === sesion.documento;
    });
}


// ==========================================
// AVISOS FLOTANTES
// ==========================================

function mostrarAviso(titulo, mensaje, tipo) {
    const contenedor = obtener("contenedorAvisos");
    if (!contenedor) return;

    const aviso = document.createElement("div");
    aviso.className = "aviso-flotante" + (tipo ? " " + tipo : "");

    const fuerte = document.createElement("strong");
    fuerte.textContent = titulo;
    aviso.appendChild(fuerte);

    if (mensaje) {
        aviso.appendChild(document.createTextNode(mensaje));
    }

    contenedor.appendChild(aviso);

    setTimeout(function () {
        aviso.classList.add("mostrar");
    }, 30);

    setTimeout(function () {
        aviso.classList.remove("mostrar");
        setTimeout(function () {
            aviso.remove();
        }, 400);
    }, 4500);
}


// ==========================================
// MAPA Y UBICACIÓN
// ==========================================

let mapa = null;
let marcadorSeleccionado = null;
let ubicacionSeleccionada = null;

function iniciarMapa() {
    const elemento = obtener("map");

    if (!elemento || mapa) return;

    if (typeof L === "undefined") {
        elemento.textContent = "No se pudo cargar el mapa. Revisa tu conexión a internet.";
        return;
    }

    mapa = L.map("map").setView(CENTRO_ZIPAQUIRA, 14);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors © CARTO",
        subdomains: "abcd",
        maxZoom: 19
    }).addTo(mapa);

    mapa.on("click", function (e) {
        seleccionarUbicacion(e.latlng.lat, e.latlng.lng);
    });
}

function seleccionarUbicacion(lat, lon) {
    iniciarMapa();
    if (!mapa) return;

    ubicacionSeleccionada = { lat: lat, lon: lon };

    if (marcadorSeleccionado) {
        mapa.removeLayer(marcadorSeleccionado);
    }

    marcadorSeleccionado = L.marker([lat, lon])
        .addTo(mapa)
        .bindPopup(
            "<b>📍 Ubicación seleccionada</b><br>" +
            lat.toFixed(5) + ", " + lon.toFixed(5)
        )
        .openPopup();

    actualizarEstadoUbicacion();
}

function quitarUbicacionSeleccionada() {
    if (marcadorSeleccionado && mapa) {
        mapa.removeLayer(marcadorSeleccionado);
    }

    marcadorSeleccionado = null;
    ubicacionSeleccionada = null;

    actualizarEstadoUbicacion();
}

function actualizarEstadoUbicacion() {
    const texto = ubicacionSeleccionada
        ? "📍 " + ubicacionSeleccionada.lat.toFixed(5) + ", " + ubicacionSeleccionada.lon.toFixed(5)
        : "No has seleccionado una ubicación";

    ["estadoUbicacion", "estadoUbicacionMapa"].forEach(function (id) {
        const elemento = obtener(id);
        if (elemento) elemento.textContent = texto;
    });
}

// Botón "Usar esta ubicación" del mapa: vuelve al formulario
function confirmarUbicacion() {
    if (!ubicacionSeleccionada) {
        mostrarAviso("📍 Primero toca el mapa", "Elige el lugar del reporte y luego confirma.", "error");
        return;
    }

    mostrarSeccion("reportar");
}

function centrarMapa() {
    iniciarMapa();

    if (mapa) {
        mapa.setView(CENTRO_ZIPAQUIRA, 14);
    }
}

function usarMiUbicacion() {
    if (!navigator.geolocation) {
        mostrarAviso("Sin geolocalización", "Tu navegador no permite obtener la ubicación.", "error");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function (posicion) {
            const lat = posicion.coords.latitude;
            const lon = posicion.coords.longitude;

            seleccionarUbicacion(lat, lon);

            if (mapa) {
                mapa.setView([lat, lon], 16);
            }
        },
        function () {
            mostrarAviso(
                "No se pudo obtener tu ubicación",
                "Revisa los permisos del navegador o toca el mapa.",
                "error"
            );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}


// ==========================================
// REGISTRAR REPORTE
// ==========================================

function registrarReporte() {
    const tipo = obtener("tipoDelito").value;
    const barrio = obtener("barrio").value;
    const direccion = obtener("direccion").value.trim();
    const descripcion = obtener("descripcion").value.trim();
    const confirmado = obtener("confirmarReporte").checked;

    if (!tipo || !barrio) {
        mostrarAviso("⚠️ Faltan datos", "Completa el tipo de situación y el barrio.", "error");
        return;
    }

    if (!confirmado) {
        mostrarAviso("☑️ Falta confirmar", "Confirma que la información del reporte es verdadera.", "error");
        return;
    }

    if (!ubicacionSeleccionada) {
        const continuar = confirm(
            "📍 No has seleccionado una ubicación en el mapa.\n\n¿Quieres enviar el reporte sin ubicación exacta?"
        );

        if (!continuar) {
            mostrarSeccion("mapa");
            return;
        }
    }

    const boton = obtener("botonEnviar");
    boton.disabled = true;

    const ahora = new Date();

    const nuevoReporte = {
        id: nuevoId(),
        usuario: sesion.nombre,
        documento: sesion.documento,
        tipo: tipo,
        delito: tipo,
        barrio: barrio,
        direccion: direccion || "No especificada",
        descripcion: descripcion || "Sin descripción",
        fecha: ahora.toLocaleString("es-CO"),
        creado: ahora.getTime(),
        estado: "Pendiente",
        ubicacion: ubicacionSeleccionada
            ? { lat: ubicacionSeleccionada.lat, lon: ubicacionSeleccionada.lon }
            : null
    };

    // Leer la versión más reciente y agregar
    const reportes = leerReportes();
    reportes.push(nuevoReporte);

    const guardado = guardar(CLAVES.REPORTES, reportes);

    if (!guardado) {
        boton.disabled = false;
        mostrarAviso("No se pudo guardar", "El almacenamiento del navegador está lleno o bloqueado.", "error");
        return;
    }

    // Alerta para el administrador
    const alertas = leer(CLAVES.ALERTAS, []);

    alertas.push({
        id: nuevoId(),
        reporteId: nuevoReporte.id,
        delito: tipo,
        barrio: barrio,
        usuario: sesion.nombre,
        fecha: ahora.toLocaleString("es-CO"),
        hora: ahora.toLocaleTimeString("es-CO"),
        tipo: "Reporte ciudadano"
    });

    guardar(CLAVES.ALERTAS, alertas);

    // Notificación de confirmación para el usuario
    crearNotificacion(
        "Reporte enviado",
        "Tu reporte de " + tipo + " en " + barrio + " fue enviado. Estado: 🟡 Pendiente."
    );

    // Limpiar formulario
    obtener("formularioReporte").reset();
    quitarUbicacionSeleccionada();

    boton.disabled = false;

    cargarMisReportes();
    mostrarSeccion("misReportes");

    mostrarAviso("🚨 Reporte enviado", "Lo verás en «Mis reportes» con estado Pendiente.", "ok");
}


// ==========================================
// MIS REPORTES
// ==========================================

const ESTADOS = {
    "Pendiente": { texto: "🟡 Pendiente", clase: "estado-pendiente" },
    "En revisión": { texto: "🔵 En revisión", clase: "estado-revision" },
    "Atendido": { texto: "🟢 Atendido", clase: "estado-atendido" }
};

function obtenerTextoEstado(estado) {
    return ESTADOS[estado] ? ESTADOS[estado].texto : estado;
}

function cargarMisReportes() {
    const contenedor = obtener("listaMisReportes");
    if (!contenedor) return;

    const lista = misReportes().reverse();

    if (lista.length === 0) {
        contenedor.innerHTML =
            '<div class="sin-reportes">' +
            '<div style="font-size:40px">📭</div>' +
            "<h3>Todavía no tienes reportes</h3>" +
            "<p>Cuando envíes uno aparecerá aquí.</p>" +
            "</div>";
        return;
    }

    contenedor.innerHTML = lista.map(function (r) {
        const estado = ESTADOS[r.estado] || { texto: r.estado, clase: "" };

        let ubicacion = "Sin ubicación exacta";

        if (r.ubicacion && typeof r.ubicacion.lat === "number" && typeof r.ubicacion.lon === "number") {
            ubicacion = r.ubicacion.lat.toFixed(5) + ", " + r.ubicacion.lon.toFixed(5);
        }

        return (
            '<div class="reporte-card">' +
            '<div class="reporte-card-header">' +
            '<div class="reporte-tipo">🚨 ' + escaparHTML(r.tipo) + "</div>" +
            '<div class="estado-reporte ' + estado.clase + '">' + escaparHTML(estado.texto) + "</div>" +
            "</div>" +
            "<p>🏘️ " + escaparHTML(r.barrio) + "</p>" +
            "<p>🏠 " + escaparHTML(r.direccion) + "</p>" +
            "<p>📝 " + escaparHTML(r.descripcion) + "</p>" +
            "<p>📍 " + escaparHTML(ubicacion) + "</p>" +
            "<small>🕒 " + escaparHTML(r.fecha || "") + "</small>" +
            "</div>"
        );
    }).join("");
}

function borrarMisReportes() {
    if (misReportes().length === 0) {
        mostrarAviso("No hay nada que borrar", "Todavía no tienes reportes.");
        return;
    }

    if (!confirm("¿Quieres borrar todos tus reportes?\n\nEsta acción no se puede deshacer.")) {
        return;
    }

    // Solo se quitan los del usuario actual; los demás se conservan
    const restantes = leerReportes().filter(function (r) {
        return r.documento !== sesion.documento;
    });

    guardar(CLAVES.REPORTES, restantes);

    cargarMisReportes();
    mostrarAviso("🗑️ Listo", "Tus reportes fueron eliminados.", "ok");
}


// ==========================================
// NOTIFICACIONES (solo las de este usuario)
// ==========================================

function leerNotificaciones() {
    const lista = leer(CLAVES.NOTIFICACIONES, []);
    return Array.isArray(lista) ? lista : [];
}

function misNotificaciones() {
    return leerNotificaciones().filter(function (n) {
        return n.documento === sesion.documento;
    });
}

// IDs que ya conocemos, para mostrar el aviso solo de las nuevas
let notificacionesConocidas = new Set(
    misNotificaciones().map(function (n) { return String(n.id); })
);

function crearNotificacion(titulo, mensaje) {
    const notificacion = {
        id: nuevoId(),
        titulo: titulo,
        mensaje: mensaje,
        fecha: new Date().toLocaleString("es-CO"),
        leida: false,
        documento: sesion.documento
    };

    const lista = leerNotificaciones();
    lista.push(notificacion);
    guardar(CLAVES.NOTIFICACIONES, lista);

    notificacionesConocidas.add(String(notificacion.id));

    mostrarAviso("🔔 " + titulo, mensaje);
    cargarNotificaciones();
}

function cargarNotificaciones() {
    const lista = obtener("listaNotificaciones");
    if (!lista) return;

    const mias = misNotificaciones().reverse();

    if (mias.length === 0) {
        lista.innerHTML =
            '<div class="sin-reportes">' +
            '<div style="font-size:40px">🔔</div>' +
            "<h3>No tienes notificaciones</h3>" +
            "<p>Aquí aparecerán los avisos de ACSU.</p>" +
            "</div>";
    } else {
        lista.innerHTML = mias.map(function (n) {
            return (
                '<div class="notificacion-item' + (n.leida ? "" : " nueva") + '">' +
                "<strong>🔔 " + escaparHTML(n.titulo) + "</strong>" +
                "<p>" + escaparHTML(n.mensaje) + "</p>" +
                "<small>" + escaparHTML(n.fecha) + "</small>" +
                "</div>"
            );
        }).join("");
    }

    actualizarContadorNotificaciones();
}

function actualizarContadorNotificaciones() {
    const contador = obtener("contadorNotificaciones");
    if (!contador) return;

    const sinLeer = misNotificaciones().filter(function (n) {
        return !n.leida;
    }).length;

    contador.textContent = sinLeer > 9 ? "9+" : sinLeer;
    contador.style.display = sinLeer === 0 ? "none" : "flex";
}

function marcarNotificacionesLeidas() {
    const todas = leerNotificaciones();
    let cambio = false;

    todas.forEach(function (n) {
        if (n.documento === sesion.documento && !n.leida) {
            n.leida = true;
            cambio = true;
        }
    });

    if (cambio) {
        guardar(CLAVES.NOTIFICACIONES, todas);
    }

    actualizarContadorNotificaciones();
}


// ==========================================
// SINCRONIZACIÓN CON EL ADMINISTRADOR
// ==========================================

let ultimoReportes = localStorage.getItem(CLAVES.REPORTES);
let ultimoNotificaciones = localStorage.getItem(CLAVES.NOTIFICACIONES);

function sincronizar() {
    const reportesActuales = localStorage.getItem(CLAVES.REPORTES);

    if (reportesActuales !== ultimoReportes) {
        ultimoReportes = reportesActuales;
        cargarMisReportes();
    }

    const notificacionesActuales = localStorage.getItem(CLAVES.NOTIFICACIONES);

    if (notificacionesActuales !== ultimoNotificaciones) {
        ultimoNotificaciones = notificacionesActuales;

        // Avisar solo de las notificaciones que no conocíamos
        misNotificaciones().forEach(function (n) {
            if (!notificacionesConocidas.has(String(n.id))) {
                notificacionesConocidas.add(String(n.id));
                mostrarAviso("🔔 " + n.titulo, n.mensaje);
            }
        });

        cargarNotificaciones();
    }
}

// Cuando el admin cambia algo en otra pestaña
window.addEventListener("storage", sincronizar);

// Respaldo por si el navegador no dispara el evento "storage"
setInterval(sincronizar, 2000);


// ==========================================
// NAVEGACIÓN
// ==========================================

function mostrarSeccion(nombre) {
    document.querySelectorAll(".seccion").forEach(function (seccion) {
        seccion.hidden = true;
    });

    const seleccionada = obtener(nombre);

    if (seleccionada) {
        seleccionada.hidden = false;
    }

    // Marcar el botón activo del menú inferior
    document.querySelectorAll(".nav-item").forEach(function (boton) {
        boton.classList.toggle("activo", boton.dataset.seccion === nombre);
    });

    if (nombre === "mapa") {
        iniciarMapa();

        // El mapa necesita recalcular su tamaño cuando se hace visible
        requestAnimationFrame(function () {
            if (mapa) mapa.invalidateSize();
        });
    }

    if (nombre === "notificaciones") {
        marcarNotificacionesLeidas();
        cargarNotificaciones();
    }

    if (nombre === "misReportes") {
        cargarMisReportes();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}


// ==========================================
// EMERGENCIA
// ==========================================

function alertaEmergencia() {
    const continuar = confirm(
        "🚨 ¿Quieres registrar una emergencia en ACSU?\n\n" +
        "Usa esta opción solo para situaciones reales.\n" +
        "Si hay peligro inmediato, llama también al 123."
    );

    if (!continuar) return;

    mostrarSeccion("reportar");

    obtener("tipoDelito").value = "Emergencia";
    obtener("barrio").focus();
}


// ==========================================
// TEMA
// ==========================================

function aplicarTema(tema) {
    document.body.classList.remove("dark", "blue", "green", "red");

    if (["dark", "blue", "green", "red"].indexOf(tema) !== -1) {
        document.body.classList.add(tema);
    }

    try {
        localStorage.setItem(CLAVES.TEMA, tema);
    } catch (error) {
        // si no se puede guardar, el tema igual se aplica
    }
}

function configurarTema() {
    const selector = obtener("themeSelect");

    let guardado = "light";

    try {
        guardado = localStorage.getItem(CLAVES.TEMA) || "light";
    } catch (error) {
        guardado = "light";
    }

    aplicarTema(guardado);

    if (selector) {
        selector.value = guardado;

        selector.addEventListener("change", function () {
            aplicarTema(this.value);
        });
    }
}


// ==========================================
// SESIÓN Y PERFIL
// ==========================================

function cerrarSesion() {
    if (!confirm("¿Quieres cerrar tu sesión de ACSU?")) return;

    localStorage.removeItem(CLAVES.SESION);
    window.location.href = "login.html";
}

function cargarDatosUsuario() {
    const nombre = obtener("nombreUsuario");
    if (nombre) nombre.textContent = sesion.nombre;

    const perfilNombre = obtener("perfilNombre");
    if (perfilNombre) perfilNombre.textContent = sesion.nombre;

    const perfilDocumento = obtener("perfilDocumento");

    if (perfilDocumento) {
        const documento = String(sesion.documento || "");
        const oculto = "•".repeat(Math.max(0, documento.length - 4)) + documento.slice(-4);

        perfilDocumento.textContent = "Documento: " + oculto;
    }
}

function llenarBarrios() {
    const select = obtener("barrio");
    if (!select) return;

    BARRIOS.forEach(function (barrio) {
        const opcion = document.createElement("option");
        opcion.value = barrio;
        opcion.textContent = barrio;
        select.appendChild(opcion);
    });
}


// ==========================================
// INICIO
// ==========================================

document.addEventListener("DOMContentLoaded", function () {
    migrarReportes();
    llenarBarrios();
    cargarDatosUsuario();
    cargarMisReportes();
    cargarNotificaciones();
    configurarTema();
    actualizarEstadoUbicacion();
});
