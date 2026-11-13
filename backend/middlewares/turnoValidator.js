function validarTurno(req, res, next) {
    const datos = req.body || {};
    const camposObligatorios = req.method === 'PUT'
        ? ['fecha_turno', 'hora_turno']
        : ['fecha_turno', 'hora_turno', 'dni_paciente', 'id_practica'];

    const camposFaltantes = camposObligatorios.filter((campo) => {
        const valor = datos[campo];

        return valor === undefined || valor === null ||
            (typeof valor === 'string' && valor.trim() === '');
    });

    if (camposFaltantes.length > 0) {
        return res.status(400).json({
            error: 'Faltan campos obligatorios',
            campos: camposFaltantes
        });
    }

    next();
}

module.exports = validarTurno;
