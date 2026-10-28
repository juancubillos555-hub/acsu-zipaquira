"use strict";

// ==========================================
// ACSU - PANEL DE ADMINISTRACIÓN
// ==========================================
// Comparte datos con la app ciudadana a través del localStorage.
// Los totales por barrio ya NO se guardan aparte: se calculan
// siempre a partir de la lista de reportes, así las estadísticas
// nunca se desincronizan (antes los reportes de los ciudadanos
// no contaban en la gráfica).
// ==========================================


// ==========================================
// 1. CONSTANTES
// ==========================================

const CLAVES = {
    REPORTES: "reportes",
    ALERTAS: "alertas",
    NOTIFICACIONES: "notificacionesUsuario",
    TEMA: "tema",
    SONIDO: "sonidoAlertas"
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

// Coordenadas aproximadas de cada barrio (conviene verificarlas en el mapa)
const COORDENADAS_BARRIOS = {
    "Centro": [5.0255, -74.0035],
    "La Esmeralda": [5.0285, -74.0015],
    "El Rodeo": [5.0290, -73.9960],
    "Comuneros": [5.0315, -73.9940],
    "Algarra": [5.0210, -74.0010],
    "San Pablo": [5.0160, -74.0030],
    "Santa Isabel": [5.0215, -73.9930],
    "La Paz": [5.0360, -74.0030],
    "Barandillas": [5.0120, -73.9730]
};

const ESTADOS = ["Pendiente", "En revisión", "Atendido"];


// ==========================================
// 2. VARIABLES
// ==========================================

let reportes = [];
let alertas = [];

let mapa = null;
let grafica = null;
let marcadores = [];
let zonasRiesgo = [];

let alertasConocidas = new Set();

let ultimoRawReportes = null;
let ultimoRawAlertas = null;

const sonidoAlerta = new Audio("alerta.mp3");


// ==========================================
// 3. UTILIDADES
// ==========================================

function obtener(id) {
    return document.getElementById(id);
}

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

function obtenerTextoEstado(estado) {
    if (estado === "Pendiente") return "🟡 Pendiente";
    if (estado === "En revisión") return "🔵 En revisión";
    if (estado === "Atendido") return "🟢 Atendido";
    return estado;
}

function sonidoActivado() {
    return localStorage.getItem(CLAVES.SONIDO) !== "no";
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
// 4. CARGAR Y NORMALIZAR DATOS
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

function cargarDatos() {
    const r = leer(CLAVES.REPORTES, []);
    const a = leer(CLAVES.ALERTAS, []);

    reportes = Array.isArray(r) ? r : [];
    alertas = Array.isArray(a) ? a : [];

    ultimoRawReportes = localStorage.getItem(CLAVES.REPORTES);
    ultimoRawAlertas = localStorage.getItem(CLAVES.ALERTAS);
}

// Casos por barrio, calculados desde los reportes
function contarPorBarrio() {
    return BARRIOS.map(function (barrio) {
        return reportes.filter(function (r) {
            return r.barrio === barrio;
        }).length;
    });
}


// ==========================================
// 5. NAVEGACIÓN
// ==========================================

function mostrarSeccion(nombre) {
    document.querySelectorAll(".seccion").forEach(function (seccion) {
        seccion.hidden = true;
    });

    document.querySelectorAll(".menu-btn").forEach(function (boton) {
        boton.classList.toggle("active", boton.dataset.section === nombre);
    });

    const seccion = obtener(nombre);
    if (seccion) seccion.hidden = false;

    if (nombre === "mapa") {
        iniciarMapa();

        // Leaflet necesita recalcular el tamaño cuando el mapa se hace visible
        requestAnimationFrame(function () {
            if (mapa) mapa.invalidateSize();
        });
    }

    if (nombre === "estadisticas" && grafica) {
        requestAnimationFrame(function () {
            grafica.resize();
            grafica.update();
        });
    }
}


// ==========================================
// 6. CONTADORES, ZONA Y NIVEL
// ==========================================

function actualizarContadores() {
    const pendientes = reportes.filter(function (r) {
        return r.estado === "Pendiente";
    }).length;

    obtener("totalDelitos").textContent = reportes.length;
    obtener("totalReportes").textContent = reportes.length;
    obtener("totalPendientes").textContent = pendientes;

    const insignia = obtener("insigniaPendientes");
    insignia.textContent = pendientes;
    insignia.hidden = pendientes === 0;
}

function actualizarZonaPeligrosa() {
    const datos = contarPorBarrio();
    const max = Math.max.apply(null, datos);

    const dangerZone = obtener("danger-zone");
    const zonaRiesgo = obtener("zonaRiesgo");

    if (max === 0) {
        dangerZone.textContent = "Sin registros disponibles";
        zonaRiesgo.textContent = "-";
        return;
    }

    // Si hay empate, se muestran todos los barrios empatados
    const zonas = BARRIOS.filter(function (barrio, i) {
        return datos[i] === max;
    });

    dangerZone.textContent = zonas.join(", ") + " (" + max + (max === 1 ? " caso)" : " casos)");
    zonaRiesgo.textContent = zonas.join(", ");
}

function actualizarNivelGeneral() {
    const total = reportes.length;

    let nivel = "🟢 Riesgo bajo";
    if (total >= 10) nivel = "🟡 Riesgo medio";
    if (total >= 25) nivel = "🔴 Riesgo alto";

    obtener("nivelGeneral").textContent = nivel;
}


// ==========================================
// 7. TABLA DE REPORTES
// ==========================================

function crearCelda(texto) {
    const td = document.createElement("td");
    td.textContent = texto;
    return td;
}

function cargarReportes() {
    const tbody = document.querySelector("#tablaReportes tbody");
    if (!tbody) return;

    const filtro = obtener("filtroEstado").value;

    const lista = reportes
        .slice()
        .reverse()
        .filter(function (r) {
            return filtro === "todos" || r.estado === filtro;
        });

    tbody.innerHTML = "";

    if (lista.length === 0) {
        const fila = document.createElement("tr");
        const celda = crearCelda(
            reportes.length === 0
                ? "No existen reportes registrados."
                : "No hay reportes con ese estado."
        );

        celda.colSpan = 7;
        fila.appendChild(celda);
        tbody.appendChild(fila);
        return;
    }

    lista.forEach(function (r) {
        const fila = document.createElement("tr");

        const tdDelito = crearCelda(r.tipo || r.delito || "Otro");
        tdDelito.title = r.descripcion || "";

        // Estado actual y selector para cambiarlo
        const selector = document.createElement("select");
        selector.className = "selector-estado";
        selector.setAttribute("aria-label", "Cambiar estado del reporte");

        ESTADOS.forEach(function (estado) {
            const opcion = document.createElement("option");
            opcion.value = estado;
            opcion.textContent = obtenerTextoEstado(estado);
            opcion.selected = estado === r.estado;
            selector.appendChild(opcion);
        });

        selector.addEventListener("change", function () {
            cambiarEstadoReporte(r.id, this.value);
        });

        const botonEliminar = document.createElement("button");
        botonEliminar.className = "btn-fila";
        botonEliminar.textContent = "🗑️";
        botonEliminar.title = "Eliminar reporte";
        botonEliminar.setAttribute("aria-label", "Eliminar reporte");
        botonEliminar.addEventListener("click", function () {
            eliminarReporte(r.id);
        });

        const tdAccion = document.createElement("td");
        const contenedor = document.createElement("div");
        contenedor.className = "celda-acciones";
        contenedor.append(selector, botonEliminar);
        tdAccion.appendChild(contenedor);

        fila.append(
            crearCelda(r.fecha || "Sin fecha"),
            tdDelito,
            crearCelda(r.barrio),
            crearCelda(r.direccion),
            crearCelda(r.usuario || "Administrador"),
            crearCelda(obtenerTextoEstado(r.estado)),
            tdAccion
        );

        tbody.appendChild(fila);
    });
}

function cambiarEstadoReporte(id, nuevoEstado) {
    // Siempre se parte de la versión más reciente guardada
    const lista = leer(CLAVES.REPORTES, []);
    const reporte = lista.find(function (r) {
        return String(r.id) === String(id);
    });

    if (!reporte || reporte.estado === nuevoEstado) return;

    reporte.estado = nuevoEstado;
    guardar(CLAVES.REPORTES, lista);

    // Notificar al ciudadano dueño del reporte
    if (reporte.documento) {
        const notificaciones = leer(CLAVES.NOTIFICACIONES, []);

        notificaciones.push({
            id: nuevoId(),
            titulo: "Estado actualizado",
            mensaje:
                "Tu reporte de " + (reporte.tipo || reporte.delito) +
                " en " + reporte.barrio +
                " ahora está: " + obtenerTextoEstado(nuevoEstado) + ".",
            fecha: new Date().toLocaleString("es-CO"),
            leida: false,
            documento: reporte.documento,
            reporteId: reporte.id
        });

        guardar(CLAVES.NOTIFICACIONES, notificaciones);
    }

    cargarDatos();
    refrescarVisualizaciones();

    mostrarPopup("Estado actualizado a: " + obtenerTextoEstado(nuevoEstado), "ok");
}

function eliminarReporte(id) {
    if (!confirm("¿Eliminar este reporte?\n\nEsta acción no se puede deshacer.")) return;

    const lista = leer(CLAVES.REPORTES, []).filter(function (r) {
        return String(r.id) !== String(id);
    });

    guardar(CLAVES.REPORTES, lista);

    cargarDatos();
    refrescarVisualizaciones();

    mostrarPopup("Reporte eliminado", "ok");
}


// ==========================================
// 8. ALERTAS
// ==========================================

function crearItemAlerta(alerta) {
    const item = document.createElement("div");
    item.className = "alerta-item";

    const titulo = document.createElement("b");
    titulo.textContent = "🚨 " + (alerta.delito || alerta.tipo || "Reporte");

    const lineas = [
        "📍 " + (alerta.barrio || "No especificado"),
        "🕒 " + (alerta.fecha || alerta.hora || "")
    ];

    if (alerta.usuario) {
        lineas.push("👤 " + alerta.usuario);
    }

    item.appendChild(titulo);

    lineas.forEach(function (texto) {
        item.appendChild(document.createElement("br"));
        item.appendChild(document.createTextNode(texto));
    });

    return item;
}

function cargarAlertas() {
    const lista = obtener("listaAlertas");
    const recientes = obtener("alertasRecientes");

    lista.innerHTML = "";
    recientes.innerHTML = "";

    if (alertas.length === 0) {
        [lista, recientes].forEach(function (contenedor) {
            const div = document.createElement("div");
            div.className = "alert";
            div.textContent = "No existen alertas registradas.";
            contenedor.appendChild(div);
        });
        return;
    }

    const ordenadas = alertas.slice().reverse();

    ordenadas.forEach(function (alerta) {
        lista.appendChild(crearItemAlerta(alerta));
    });

    ordenadas.slice(0, 3).forEach(function (alerta) {
        recientes.appendChild(crearItemAlerta(alerta));
    });
}

// Muestra una ventanita arriba a la derecha (y suena si está activado)
function mostrarPopup(texto, tipo) {
    const contenedor = obtener("contenedorPopups");

    const popup = document.createElement("div");
    popup.className = "alerta-popup" + (tipo ? " " + tipo : "");
    popup.textContent = texto;
    contenedor.appendChild(popup);

    setTimeout(function () {
        popup.remove();
    }, 4000);
}

function sonarAlerta() {
    if (!sonidoActivado()) return;

    sonidoAlerta.currentTime = 0;

    sonidoAlerta.play().catch(function () {
        // El navegador bloquea el audio hasta que la persona hace clic en la página
    });
}

function avisarAlerta(alerta) {
    mostrarPopup(
        "🚨 NUEVA ALERTA: " + (alerta.delito || alerta.tipo || "Reporte") +
        " en " + (alerta.barrio || "No especificado")
    );

    sonarAlerta();
}

// Crea una alerta cuando el administrador registra un incidente
function crearAlerta(delito, barrio, usuario, reporteId) {
    const ahora = new Date();

    const nueva = {
        id: nuevoId(),
        delito: delito,
        barrio: barrio,
        usuario: usuario,
        reporteId: reporteId,
        hora: ahora.toLocaleTimeString("es-CO"),
        fecha: ahora.toLocaleString("es-CO"),
        tipo: "Registro del administrador"
    };

    const lista = leer(CLAVES.ALERTAS, []);
    lista.push(nueva);
    guardar(CLAVES.ALERTAS, lista);

    alertasConocidas.add(String(nueva.id));

    avisarAlerta(nueva);
}

function limpiarAlertas() {
    if (alertas.length === 0) return;
    if (!confirm("¿Borrar todas las alertas?")) return;

    guardar(CLAVES.ALERTAS, []);
    alertasConocidas.clear();

    cargarDatos();
    cargarAlertas();
}


// ==========================================
// 9. GRÁFICA
// ==========================================

function colorTextoGrafica() {
    return getComputedStyle(document.body).getPropertyValue("--text-muted").trim() || "#667085";
}

function inicializarGrafica() {
    const canvas = obtener("crimeChart");

    if (!canvas || typeof Chart === "undefined") return;

    Chart.defaults.color = colorTextoGrafica();

    grafica = new Chart(canvas, {
        type: "bar",
        data: {
            labels: BARRIOS,
            datasets: [{
                label: "Casos registrados",
                data: contarPorBarrio(),
                backgroundColor: "#0288D1",
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 }
                }
            }
        }
    });
}

function actualizarGrafica() {
    if (!grafica) return;

    Chart.defaults.color = colorTextoGrafica();


    grafica.data.datasets[0].data = contarPorBarrio();
    grafica.update();
}


// ==========================================
// 10. MAPA
// ==========================================

function iniciarMapa() {
    const contenedor = obtener("map");

    if (!contenedor || mapa) return;

    if (typeof L === "undefined") {
        contenedor.textContent = "No se pudo cargar el mapa. Revisa tu conexión a internet.";
        return;
    }

    mapa = L.map("map").setView([5.0265, -74.0010], 14.5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19
    }).addTo(mapa);

    actualizarMapa();
}

function actualizarMapa() {
    if (!mapa) return;

    // ---- Quitar lo anterior ----
    marcadores.forEach(function (m) { mapa.removeLayer(m); });
    zonasRiesgo.forEach(function (z) { mapa.removeLayer(z); });

    marcadores = [];
    zonasRiesgo = [];

    // ---- Zonas de riesgo por barrio ----
    const datos = contarPorBarrio();

    BARRIOS.forEach(function (barrio, i) {
        const cantidad = datos[i];
        const coords = COORDENADAS_BARRIOS[barrio];

        if (!coords) return;

        let color = "#22c55e";
        let nivel = "Sin casos";

        if (cantidad >= 10) {
            color = "#dc2626";
            nivel = "Crítico";
        } else if (cantidad >= 5) {
            color = "#f97316";
            nivel = "Medio-alto";
        } else if (cantidad > 0) {
            color = "#eab308";
            nivel = "Moderado";
        }

        const circulo = L.circle(coords, {
            stroke: false,
            fillColor: color,
            fillOpacity: 0.4,
            radius: 250
        }).addTo(mapa);

        circulo.bindPopup(
            "<b>Área: " + escaparHTML(barrio) + "</b>" +
            "<br>Incidentes: " + cantidad +
            "<br>Nivel de riesgo: " + nivel
        );

        zonasRiesgo.push(circulo);
    });

    // ---- Un marcador por cada reporte ----
    reportes.forEach(function (r) {
        let coords = null;

        if (r.ubicacion && typeof r.ubicacion.lat === "number" && typeof r.ubicacion.lon === "number") {
            coords = [r.ubicacion.lat, r.ubicacion.lon];
        } else if (COORDENADAS_BARRIOS[r.barrio]) {
            coords = COORDENADAS_BARRIOS[r.barrio];
        }

        if (!coords) return;

        let contenido =
            "<b>🚨 " + escaparHTML(r.tipo || r.delito || "Reporte") + "</b><br><br>" +
            "🏘️ Barrio: " + escaparHTML(r.barrio) + "<br>" +
            "🏠 Dirección: " + escaparHTML(r.direccion) + "<br>" +
            "🕒 Fecha: " + escaparHTML(r.fecha || "Sin fecha") + "<br>" +
            "📊 Estado: " + escaparHTML(obtenerTextoEstado(r.estado));

        if (r.usuario) {
            contenido += "<br>👤 Usuario: " + escaparHTML(r.usuario);
        }

        if (r.ubicacion) {
            contenido += "<br>📍 Ubicación exacta seleccionada";
        }

        marcadores.push(L.marker(coords).addTo(mapa).bindPopup(contenido));
    });
}


// ==========================================
// 11. REFRESCAR TODO
// ==========================================

function refrescarVisualizaciones() {
    actualizarContadores();
    actualizarZonaPeligrosa();
    actualizarNivelGeneral();
    cargarReportes();
    cargarAlertas();
    actualizarGrafica();
    actualizarMapa();
}


// ==========================================
// 12. SINCRONIZACIÓN CON LA APP CIUDADANA
// ==========================================

function sincronizar() {
    const rawReportes = localStorage.getItem(CLAVES.REPORTES);
    const rawAlertas = localStorage.getItem(CLAVES.ALERTAS);

    if (rawReportes === ultimoRawReportes && rawAlertas === ultimoRawAlertas) {
        return;
    }

    cargarDatos();

    // Avisar solo de las alertas que todavía no habíamos visto
    alertas.forEach(function (alerta) {
        const id = String(alerta.id);

        if (!alertasConocidas.has(id)) {
            alertasConocidas.add(id);
            avisarAlerta(alerta);
        }
    });

    refrescarVisualizaciones();
}

window.addEventListener("storage", sincronizar);

// Respaldo por si el navegador no dispara el evento "storage"
setInterval(sincronizar, 2000);


// ==========================================
// 13. TEMA, SONIDO Y REINICIO
// ==========================================

function aplicarTema(tema) {
    document.body.classList.remove("dark", "blue", "green", "red");

    if (tema !== "light") {
        document.body.classList.add(tema);
    }

    try {
        localStorage.setItem(CLAVES.TEMA, tema);
    } catch (error) {
        // si no se puede guardar, el tema igual se aplica
    }

    actualizarGrafica();
}

function reiniciarDatos() {
    const confirmar = confirm(
        "¿Seguro que quieres reiniciar el sistema?\n\n" +
        "Se borrarán todos los reportes, alertas y notificaciones guardados en este navegador."
    );

    if (!confirmar) return;

    // Solo se borran los datos de ACSU (antes localStorage.clear()
    // también cerraba la sesión de los usuarios y borraba los temas)
    [
        CLAVES.REPORTES,
        CLAVES.ALERTAS,
        CLAVES.NOTIFICACIONES,
        "datosDelitos"
    ].forEach(function (clave) {
        localStorage.removeItem(clave);
    });

    location.reload();
}


// ==========================================
// 14. INICIO
// ==========================================

document.addEventListener("DOMContentLoaded", function () {

    migrarReportes();
    cargarDatos();

    // Las alertas que ya existen no deben sonar al abrir la página
    alertas.forEach(function (alerta) {
        alertasConocidas.add(String(alerta.id));
    });

    llenarBarrios();

    // ---- Tema (antes de crear la gráfica, para que tome los colores) ----
    const themeSelect = obtener("themeSelect");
    const temaGuardado = localStorage.getItem(CLAVES.TEMA) || "light";

    themeSelect.value = temaGuardado;
    aplicarTema(temaGuardado);

    themeSelect.addEventListener("change", function () {
        aplicarTema(this.value);
    });

    // ---- Sonido ----
    const chkSonido = obtener("chkSonido");
    chkSonido.checked = sonidoActivado();

    chkSonido.addEventListener("change", function () {
        localStorage.setItem(CLAVES.SONIDO, this.checked ? "si" : "no");

        if (this.checked) sonarAlerta();
    });

    // ---- Gráfica ----
    inicializarGrafica();

    // ---- Menú ----
    obtener("navigationMenu").addEventListener("click", function (e) {
        const boton = e.target.closest(".menu-btn");

        if (boton) mostrarSeccion(boton.dataset.section);
    });

    // ---- Filtro de reportes ----
    obtener("filtroEstado").addEventListener("change", cargarReportes);

    // ---- Formulario para registrar incidentes ----
    obtener("incidentForm").addEventListener("submit", function (e) {
        e.preventDefault();

        const delito = obtener("tipoDelito").value;
        const barrio = obtener("barrio").value;
        const direccion = obtener("direccion").value.trim();
        const descripcion = obtener("descripcion").value.trim();

        if (!direccion) {
            mostrarPopup("Escribe la dirección del incidente.");
            return;
        }

        const ahora = new Date();

        const nuevoReporte = {
            id: nuevoId(),
            usuario: "Administrador",
            tipo: delito,
            delito: delito,
            barrio: barrio,
            direccion: direccion,
            descripcion: descripcion || "Sin descripción",
            fecha: ahora.toLocaleString("es-CO"),
            creado: ahora.getTime(),
            estado: "Pendiente",
            ubicacion: null
        };

        // Leer la lista más reciente antes de agregar
        const lista = leer(CLAVES.REPORTES, []);
        lista.push(nuevoReporte);
        guardar(CLAVES.REPORTES, lista);

        crearAlerta(delito, barrio, "Administrador", nuevoReporte.id);

        cargarDatos();
        refrescarVisualizaciones();

        this.reset();

        mostrarPopup("Reporte integrado al sistema correctamente.", "ok");
    });

    // ---- Alertas y reinicio ----
    obtener("btnLimpiarAlertas").addEventListener("click", limpiarAlertas);
    obtener("btnReset").addEventListener("click", reiniciarDatos);

    // ---- Primera carga ----
    refrescarVisualizaciones();

    console.log("ACSU Administrador iniciado correctamente.");
});
