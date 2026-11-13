function fallo(status, mensaje) {
    const error = new Error(mensaje);
    error.status = status;
    throw error;
}
function entero(valor, nombre) {
    if (
        !['string', 'number'].includes(typeof valor) ||
        !/^\d+$/.test(String(valor)) ||
        !Number.isSafeInteger(Number(valor)) ||
        Number(valor) < 1 ||
        Number(valor) > 2147483647
    )
        fallo(400, `${nombre} no es válido`);
    return Number(valor);
}
function texto(valor, nombre, maximo, opcional = false) {
    if (opcional && (valor == null || valor === '')) return null;
    if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > maximo)
        fallo(400, `${nombre} debe tener entre 1 y ${maximo} caracteres`);
    return valor.trim();
}
function hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fecha(valor, nombre = 'La fecha') {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor))
        fallo(400, `${nombre} no es válida`);
    const d = new Date(`${valor}T12:00:00`);
    if (
        Number.isNaN(d.getTime()) ||
        Number(valor.slice(0, 4)) < 1000 ||
        d.getFullYear() !== Number(valor.slice(0, 4)) ||
        d.getMonth() + 1 !== Number(valor.slice(5, 7)) ||
        d.getDate() !== Number(valor.slice(8))
    )
        fallo(400, `${nombre} no es válida`);
    return valor;
}
function hora(valor) {
    if (typeof valor !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(valor))
        fallo(400, 'La hora no es válida');
    return valor.length === 5 ? `${valor}:00` : valor;
}
function segundos(valor) {
    const [h, m, s = 0] = String(valor).split(':').map(Number);
    return h * 3600 + m * 60 + s;
}
function correo(valor, maximo = 100) {
    const email = texto(valor, 'El correo', maximo).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fallo(400, 'El correo no es válido');
    return email;
}
function password(valor) {
    if (typeof valor !== 'string' || valor.length < 8 || Buffer.byteLength(valor, 'utf8') > 72)
        fallo(400, 'La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes');
    return valor;
}
function medio(valor, confirmacion = false) {
    if (valor == null || valor === '') return confirmacion ? 'Email' : 'Web';
    const key = texto(valor, 'El medio', 50)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const opciones = {
        telefono: 'Teléfono',
        email: 'Email',
        correo: 'Email',
        'correo electronico': 'Email',
        web: 'Web',
        whatsapp: 'WhatsApp'
    };
    if (
        !opciones[key] ||
        (confirmacion && !['telefono', 'email', 'correo', 'correo electronico'].includes(key))
    )
        fallo(
            400,
            confirmacion
                ? 'El medio de confirmación debe ser Teléfono o Email'
                : 'El medio solicitado debe ser Teléfono, Email, Web o WhatsApp'
        );
    return opciones[key];
}
function escapar(valor) {
    return String(valor).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
}
module.exports = {
    fallo,
    entero,
    texto,
    hoy,
    fecha,
    hora,
    segundos,
    correo,
    password,
    medio,
    escapar
};
