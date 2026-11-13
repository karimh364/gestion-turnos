const mensaje = document.getElementById('mensaje');

async function verificarCorreoDelEnlace() {
    const parametros = new URLSearchParams(window.location.search);
    const token = parametros.get('token');

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
        mensaje.textContent = 'El enlace de verificación no es válido';
        mensaje.style.color = 'red';
        return;
    }

    try {
        const datos = await verificarEmail(token);

        mensaje.textContent = datos.mensaje ||
            'Correo verificado correctamente. Ya podés iniciar sesión.';
        mensaje.style.color = 'green';
    } catch (error) {
        mensaje.textContent = error.status
            ? error.message
            : 'No se pudo completar la verificación. Intentá nuevamente.';
        mensaje.style.color = 'red';
    }
}

verificarCorreoDelEnlace();
