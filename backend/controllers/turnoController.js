const servicio = require('../services/turnoService');
const v = require('../utils/validaciones');
async function obtenerTurnos(req, res) {
    res.json(await servicio.obtenerTodos(req.usuario));
}
async function obtenerTurnoPorId(req, res) {
    res.json(await servicio.obtenerPorId(req.params.id, req.usuario));
}
async function obtenerTurnosPorPaciente(req, res) {
    const dni = v.entero(req.params.dni, 'El DNI');
    if (req.usuario.id_rol === 3 && dni !== req.usuario.dni_paciente)
        v.fallo(403, 'Solo podés consultar tus propios turnos');
    res.json((await servicio.obtenerTodos(req.usuario)).filter((t) => t.dni_paciente === dni));
}
async function crearTurno(req, res) {
    res.status(201).json({
        mensaje: 'Turno creado correctamente',
        id_turno: await servicio.crear(req.body, req.usuario)
    });
}
async function actualizarTurno(req, res) {
    res.json({
        mensaje: 'Turno actualizado correctamente',
        id_turno: await servicio.actualizar(req.params.id, req.body, req.usuario)
    });
}
async function cancelarTurno(req, res) {
    res.json({
        mensaje: 'Turno cancelado correctamente',
        id_turno: await servicio.cambiarEstado(
            req.params.id,
            'Cancelado',
            req.body || {},
            req.usuario
        )
    });
}
async function confirmarTurno(req, res) {
    res.json({
        mensaje: 'Turno confirmado correctamente',
        id_turno: await servicio.cambiarEstado(
            req.params.id,
            'Confirmado',
            req.body || {},
            req.usuario
        )
    });
}
async function eliminarTurno(req, res) {
    res.json({
        mensaje: 'Turno eliminado correctamente',
        id_turno: await servicio.eliminar(req.params.id, req.usuario)
    });
}
module.exports = {
    obtenerTurnos,
    obtenerTurnoPorId,
    obtenerTurnosPorPaciente,
    crearTurno,
    actualizarTurno,
    cancelarTurno,
    confirmarTurno,
    eliminarTurno
};
