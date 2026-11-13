const token = new URLSearchParams(location.search).get('token');
const formulario = document.getElementById('formRestablecer');
const mensaje = document.getElementById('mensaje');
if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    formulario.hidden = true;
    mensaje.textContent = 'El enlace de recuperación no es válido';
    mensaje.style.color = 'red';
}
formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('button');
    boton.disabled = true;
    try {
        const datos = await restablecerPassword(
            token,
            document.getElementById('nuevaPassword').value
        );
        mensaje.textContent = datos.mensaje;
        mensaje.style.color = 'green';
        formulario.hidden = true;
    } catch (error) {
        mensaje.textContent = error.message;
        mensaje.style.color = 'red';
    } finally {
        boton.disabled = false;
    }
});
