const API_URL = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
async function pedir(ruta, { method = 'GET', body, autenticada = true, token } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (autenticada)
        headers.Authorization = `Bearer ${token || sessionStorage.getItem('token') || ''}`;
    let respuesta;
    try {
        respuesta = await fetch(API_URL + ruta, {
            method,
            headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
    } catch {
        throw new Error('No se pudo conectar con el servidor. Comprobá que esté encendido.');
    }
    let datos;
    try {
        datos = await respuesta.json();
    } catch {
        throw new Error('El servidor no pudo completar la solicitud. Intentá nuevamente.');
    }
    if (!respuesta.ok) {
        const error = new Error(datos.error || 'No se pudo completar la operación');
        error.status = respuesta.status;
        throw error;
    }
    return datos;
}
function iniciarSesion(email, password) {
    return pedir('/auth/login', { method: 'POST', body: { email, password }, autenticada: false });
}
function obtenerTurnos(token) {
    return pedir('/turnos', { token });
}
function verificarEmail(token) {
    return pedir('/auth/verificar-email?token=' + encodeURIComponent(token), {
        autenticada: false
    });
}
function registrarCuenta(tipo, datos) {
    return pedir('/auth/registro/' + tipo, { method: 'POST', body: datos, autenticada: false });
}
function recuperarPassword(email) {
    return pedir('/auth/recuperar-password', {
        method: 'POST',
        body: { email },
        autenticada: false
    });
}
function restablecerPassword(token, password) {
    return pedir('/auth/restablecer-password', {
        method: 'POST',
        body: { token, password },
        autenticada: false
    });
}
function obtenerSesion() {
    return pedir('/auth/sesion');
}
function obtenerCatalogos() {
    return pedir('/catalogos');
}
function crearTurno(datos) {
    return pedir('/turnos', { method: 'POST', body: datos });
}
function actualizarTurno(id, datos) {
    return pedir('/turnos/' + id, { method: 'PUT', body: datos });
}
function cancelarTurno(id) {
    return pedir('/turnos/' + id + '/cancelar', { method: 'PATCH', body: {} });
}
function confirmarTurno(id, datos) {
    return pedir('/turnos/' + id + '/confirmar', { method: 'PATCH', body: datos });
}
function eliminarTurno(id) {
    return pedir('/turnos/' + id, { method: 'DELETE' });
}
function actualizarPaciente(dni, datos) {
    return pedir('/pacientes/' + dni, { method: 'PUT', body: datos });
}
