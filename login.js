"use strict";

// ==========================================
// ACSU - SISTEMA DE INICIO DE SESIÓN
// ==========================================
// NOTA: esto es una demostración local. La "sesión" vive en el
// localStorage del navegador, así que no es seguridad real.
// ==========================================

const CLAVE_SESION = "acsuSesion";

const formulario = document.getElementById("loginForm");
const mensajeError = document.getElementById("mensajeError");
const campoDocumento = document.getElementById("documento");
const campoFecha = document.getElementById("fechaNacimiento");
const campoNombre = document.getElementById("nombre");
const campoConfirmacion = document.getElementById("confirmacion");
const botonIngresar = document.getElementById("botonIngresar");


// ==========================================
// UTILIDADES
// ==========================================

function leerSesion() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_SESION));
    } catch (error) {
        return null;
    }
}

function mostrarError(mensaje, campo) {
    mensajeError.textContent = mensaje;
    mensajeError.classList.add("mostrar");

    if (campo) {
        campo.classList.add("invalido");
        campo.focus();
    }
}

function ocultarError() {
    mensajeError.textContent = "";
    mensajeError.classList.remove("mostrar");

    document
        .querySelectorAll(".campo input.invalido")
        .forEach(function (input) {
            input.classList.remove("invalido");
        });
}

// Calcula la edad leyendo año-mes-día a mano.
// (new Date("2000-01-01") se interpreta en UTC y en Colombia
// daría el día anterior, lo que falla justo en cumpleaños.)
function calcularEdad(fechaISO) {
    const partes = fechaISO.split("-").map(Number);
    const anio = partes[0];
    const mes = partes[1];
    const dia = partes[2];

    const hoy = new Date();
    let edad = hoy.getFullYear() - anio;

    const mesActual = hoy.getMonth() + 1;
    const yaCumplio =
        mesActual > mes || (mesActual === mes && hoy.getDate() >= dia);

    if (!yaCumplio) {
        edad--;
    }

    return edad;
}

function fechaDeHoyISO() {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");
    return hoy.getFullYear() + "-" + mes + "-" + dia;
}


// ==========================================
// SI YA ESTÁ LOGUEADO
// ==========================================

const sesionExistente = leerSesion();

if (sesionExistente && sesionExistente.verificado === true) {
    window.location.replace("usuario.html");
}


// ==========================================
// CAMPOS
// ==========================================

// No permitir fechas futuras
campoFecha.max = fechaDeHoyISO();

// Solo números en el documento
campoDocumento.addEventListener("input", function () {
    this.value = this.value.replace(/[^0-9]/g, "");
});

// Quitar el error al escribir
formulario.addEventListener("input", ocultarError);


// ==========================================
// FORMULARIO
// ==========================================

formulario.addEventListener("submit", function (event) {
    event.preventDefault();
    ocultarError();

    const documento = campoDocumento.value.trim();
    const fechaNacimiento = campoFecha.value;
    const nombre = campoNombre.value.trim().replace(/\s+/g, " ");

    // ---- Documento ----
    if (!/^[0-9]{6,10}$/.test(documento)) {
        mostrarError(
            "🪪 El número de documento debe tener entre 6 y 10 números.",
            campoDocumento
        );
        return;
    }

    // ---- Fecha ----
    if (!fechaNacimiento) {
        mostrarError("🎂 Debes ingresar tu fecha de nacimiento.", campoFecha);
        return;
    }

    const edad = calcularEdad(fechaNacimiento);

    if (edad < 0 || edad > 120) {
        mostrarError("🎂 La fecha de nacimiento no es válida.", campoFecha);
        return;
    }

    if (edad < 18) {
        mostrarError(
            "🔒 Debes ser mayor de edad para utilizar esta versión de ACSU.",
            campoFecha
        );
        return;
    }

    // ---- Nombre (letras, espacios, tildes, apóstrofe y guion) ----
    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{1,39}$/.test(nombre)) {
        mostrarError(
            "👤 Escribe un nombre válido (solo letras, mínimo 2).",
            campoNombre
        );
        return;
    }

    // ---- Confirmación ----
    if (!campoConfirmacion.checked) {
        mostrarError(
            "☑️ Debes confirmar que la información ingresada es verdadera.",
            campoConfirmacion
        );
        return;
    }

    // ---- Crear y guardar la sesión ----
    const sesion = {
        documento: documento,
        nombre: nombre,
        fechaNacimiento: fechaNacimiento,
        verificado: true,
        fechaIngreso: new Date().toISOString()
    };

    try {
        localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    } catch (error) {
        mostrarError(
            "⚠️ No se pudo guardar la sesión. Revisa que el navegador permita almacenamiento (no uses modo privado)."
        );
        return;
    }

    // ---- Entrar ----
    botonIngresar.disabled = true;
    botonIngresar.querySelector(".texto-boton").textContent = "Verificando... 🔐";

    setTimeout(function () {
        window.location.href = "usuario.html";
    }, 700);
});
