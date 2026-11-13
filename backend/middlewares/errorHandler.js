module.exports = function (error, req, res, next) {
    if (res.headersSent) return next(error);
    let status = error.status || 500,
        mensaje = error.message;
    if (error.code === 'ER_DUP_ENTRY') {
        status = 409;
        mensaje = 'El DNI, correo o registro ya existe';
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        status = 404;
        mensaje = 'Uno de los registros relacionados no existe';
    }
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        status = 409;
        mensaje = 'No se puede eliminar porque existen registros asociados';
    }
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) {
        status = 409;
        mensaje = 'El horario está siendo reservado. Volvé a consultar e intentá nuevamente';
    }
    if (error.type === 'entity.parse.failed') {
        status = 400;
        mensaje = 'El JSON enviado no es válido';
    }
    if (status >= 500) {
        console.error('Error:', error);
        mensaje = 'No se pudo completar la operación. Intentá nuevamente';
    }
    res.status(status).json({ error: mensaje });
};
