const db = require('../config/database');
const v = require('../utils/validaciones');
const { crearTokenCuenta } = require('../services/tokenService');
const { enviarCorreo } = require('../services/emailService');
async function catalogos(req, res) {
    const nombres = [
        'practica',
        'medico',
        'equipo',
        'disponibilidad',
        'practica_medico',
        'practica_equipo',
        'medico_disponibilidad',
        'obra_social'
    ];
    const resultados = await Promise.all(
        nombres.map((nombre) => db.query(`SELECT * FROM ${nombre}`))
    );
    const catalogo = Object.fromEntries(nombres.map((nombre, i) => [nombre, resultados[i][0]]));
    const [pacientes] =
        req.usuario.id_rol === 1
            ? await db.query('SELECT * FROM paciente ORDER BY apellido_paciente,nombre_paciente')
            : await db.execute('SELECT * FROM paciente WHERE dni_paciente=?', [
                  req.usuario.dni_paciente || 0
              ]);
    catalogo.paciente = pacientes;
    res.json(catalogo);
}
async function actualizarPaciente(req, res) {
    const dni = v.entero(req.params.dni, 'El DNI');
    if (req.usuario.id_rol !== 1 && req.usuario.dni_paciente !== dni)
        v.fallo(403, 'No tenés permisos sobre este paciente');
    const datos = req.body || {};
    const nombre = v.texto(datos.nombre_paciente, 'El nombre', 50),
        apellido = v.texto(datos.apellido_paciente, 'El apellido', 50);
    const nacimiento = v.fecha(datos.fec_nac_paciente, 'La fecha de nacimiento');
    if (nacimiento > v.hoy()) v.fallo(400, 'La fecha de nacimiento no puede ser futura');
    const email = datos.email_paciente ? v.correo(datos.email_paciente, 50) : null;
    const telefono = v.texto(datos.tel_paciente, 'El teléfono', 15, true);
    if (telefono && !/^[+\d ()-]+$/.test(telefono)) v.fallo(400, 'El teléfono no es válido');
    const obra =
        datos.id_os == null || datos.id_os === '' ? null : v.entero(datos.id_os, 'La obra social');
    const afiliado =
        datos.nro_afiliado_paciente == null || datos.nro_afiliado_paciente === ''
            ? null
            : v.entero(datos.nro_afiliado_paciente, 'El número de afiliado');
    if (!obra && afiliado) v.fallo(400, 'El número de afiliado requiere una obra social');
    const cx = await db.getConnection();
    try {
        await cx.beginTransaction();
        const [pacientes] = await cx.execute(
            'SELECT dni_paciente FROM paciente WHERE dni_paciente=? FOR UPDATE',
            [dni]
        );
        if (!pacientes.length) v.fallo(404, 'El paciente no existe');
        if (obra) {
            const [os] = await cx.execute('SELECT id_os FROM obra_social WHERE id_os=?', [obra]);
            if (!os.length) v.fallo(404, 'La obra social no existe');
        }
        const [cuentas] = await cx.execute(
            'SELECT id_usuario,email FROM usuario WHERE dni_paciente=? FOR UPDATE',
            [dni]
        );
        if (cuentas.length && !email) v.fallo(400, 'La cuenta requiere un correo');
        await cx.execute(
            'UPDATE paciente SET nombre_paciente=?,apellido_paciente=?,fec_nac_paciente=?,email_paciente=?,tel_paciente=?,id_os=?,nro_afiliado_paciente=? WHERE dni_paciente=?',
            [nombre, apellido, nacimiento, email, telefono, obra, afiliado, dni]
        );
        let mensaje = 'Datos del paciente actualizados correctamente';
        if (cuentas.length && cuentas[0].email !== email) {
            await cx.execute('UPDATE usuario SET email=?,email_verificado=0 WHERE id_usuario=?', [
                email,
                cuentas[0].id_usuario
            ]);
            const token = await crearTokenCuenta(
                cuentas[0].id_usuario,
                'VERIFICACION_EMAIL',
                30,
                cx
            );
            const enlace = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verificar-email.html?token=${token}`;
            await enviarCorreo({
                to: email,
                subject: 'Verificá tu nuevo correo - Gestión de Turnos',
                text: `Verificá tu correo en ${enlace}`,
                html: `<p><a href="${v.escapar(enlace)}">Verificar mi correo</a></p>`
            });
            mensaje += '; verificá el nuevo correo antes de volver a ingresar';
        }
        await cx.commit();
        res.json({ mensaje });
    } catch (error) {
        await cx.rollback();
        throw error;
    } finally {
        cx.release();
    }
}
module.exports = { catalogos, actualizarPaciente };
