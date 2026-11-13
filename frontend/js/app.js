const mensaje = document.getElementById('mensaje');
const porId = (id) => document.getElementById(id);
function mostrarPanel(nombre) {
    for (const panel of ['Login', 'Registro', 'Recuperar'])
        porId('panel' + panel).hidden = panel.toLowerCase() !== nombre;
    mensaje.textContent = '';
}
for (const enlace of document.querySelectorAll('[data-panel]'))
    enlace.addEventListener('click', () => mostrarPanel(enlace.dataset.panel));
function actualizarTipo() {
    const medico = porId('tipoRegistro').value === 'medico';
    porId('datosPaciente').hidden = medico;
    porId('datosMedico').hidden = !medico;
    for (const campo of porId('datosPaciente').querySelectorAll('input')) campo.disabled = medico;
    porId('matriculaRegistro').disabled = !medico;
    porId('emailRegistro').maxLength = medico ? 100 : 50;
}
porId('tipoRegistro').addEventListener('change', actualizarTipo);
function hoyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
porId('nacimientoRegistro').max = hoyLocal();
async function enviarFormulario(evento, operacion) {
    evento.preventDefault();
    const boton = evento.currentTarget.querySelector('button[type="submit"]');
    const titulo = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Procesando...';
    mensaje.textContent = '';
    try {
        const datos = await operacion();
        if (datos?.mensaje) {
            mensaje.textContent = datos.mensaje;
            mensaje.style.color = 'green';
        }
    } catch (error) {
        mensaje.textContent = error.message;
        mensaje.style.color = 'red';
    } finally {
        boton.disabled = false;
        boton.textContent = titulo;
    }
}
porId('formLogin').addEventListener('submit', (event) =>
    enviarFormulario(event, async () => {
        const datos = await iniciarSesion(porId('email').value.trim(), porId('password').value);
        sessionStorage.setItem('token', datos.token);
        window.location.href = 'pages/dashboard.html';
    })
);
porId('formRegistro').addEventListener('submit', (event) =>
    enviarFormulario(event, () => {
        const tipo = porId('tipoRegistro').value;
        const datos = {
            email: porId('emailRegistro').value.trim(),
            password: porId('passwordRegistro').value
        };
        if (tipo === 'medico') datos.matricula_medico = porId('matriculaRegistro').value;
        else
            Object.assign(datos, {
                dni_paciente: porId('dniRegistro').value,
                nombre_paciente: porId('nombreRegistro').value,
                apellido_paciente: porId('apellidoRegistro').value,
                fec_nac_paciente: porId('nacimientoRegistro').value
            });
        return registrarCuenta(tipo, datos);
    })
);
porId('formRecuperar').addEventListener('submit', (event) =>
    enviarFormulario(event, () => recuperarPassword(porId('emailRecuperar').value.trim()))
);
actualizarTipo();
function mostrarPanelDelEnlace() {
    mostrarPanel(
        location.hash === '#registro'
            ? 'registro'
            : location.hash === '#recuperar'
              ? 'recuperar'
              : 'login'
    );
}
window.addEventListener('hashchange', mostrarPanelDelEnlace);
mostrarPanelDelEnlace();
