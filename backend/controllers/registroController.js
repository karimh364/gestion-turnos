const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { crearTokenCuenta } = require('../services/tokenService');
const { enviarCorreo } = require('../services/emailService');
const v = require('../utils/validaciones');
const frontend = () => process.env.FRONTEND_URL || 'http://localhost:3000';
async function registrar(req, res, medico) {
    const datos = req.body || {};
    const email = v.correo(datos.email, medico ? 100 : 50);
    const password = v.password(datos.password);
    const identidad = v.entero(
        medico ? datos.matricula_medico : datos.dni_paciente,
        medico ? 'La matrícula' : 'El DNI'
    );
    let nombre, apellido, nacimiento;
    if (!medico) {
        nombre = v.texto(datos.nombre_paciente, 'El nombre', 50);
        apellido = v.texto(datos.apellido_paciente, 'El apellido', 50);
        nacimiento = v.fecha(datos.fec_nac_paciente, 'La fecha de nacimiento');
        if (nacimiento > v.hoy()) v.fallo(400, 'La fecha de nacimiento no puede ser futura');
    }
    const cx = await db.getConnection();
    try {
        await cx.beginTransaction();
        if (medico) {
            const [m] = await cx.execute(
                'SELECT matricula_medico FROM medico WHERE matricula_medico=? FOR UPDATE',
                [identidad]
            );
            if (!m.length) v.fallo(404, 'La matrícula no existe en el registro de médicos');
        } else {
            const [p] = await cx.execute(
                'SELECT email_paciente FROM paciente WHERE dni_paciente=? FOR UPDATE',
                [identidad]
            );
            if (p.length && (p[0].email_paciente || '').toLowerCase() !== email)
                v.fallo(
                    409,
                    'El DNI ya está registrado con otro correo. Contactá con la administración.'
                );
            if (!p.length)
                await cx.execute(
                    'INSERT INTO paciente (dni_paciente,nombre_paciente,apellido_paciente,fec_nac_paciente,email_paciente) VALUES (?,?,?,?,?)',
                    [identidad, nombre, apellido, nacimiento, email]
                );
        }
        const [resultado] = await cx.execute(
            `INSERT INTO usuario (email,password_hash,id_rol,activo,dni_paciente,matricula_medico,email_verificado) VALUES (?,?,?,1,?,?,0)`,
            [
                email,
                await bcrypt.hash(password, 10),
                medico ? 2 : 3,
                medico ? null : identidad,
                medico ? identidad : null
            ]
        );
        const token = await crearTokenCuenta(resultado.insertId, 'VERIFICACION_EMAIL', 30, cx);
        const enlace = `${frontend()}/verificar-email.html?token=${token}`;
        await enviarCorreo({
            to: email,
            subject: 'Verificá tu correo - Gestión de Turnos',
            text: `Para verificar tu cuenta, abrí este enlace: ${enlace}. El enlace vence en 30 minutos.`,
            html: `<h2>Verificación de correo</h2><p><a href="${v.escapar(enlace)}">Verificar mi correo</a></p><p>El enlace vence en 30 minutos.</p>`
        });
        await cx.commit();
        res.status(201).json({
            mensaje: 'Registro realizado. Revisá el correo para verificar tu cuenta.'
        });
    } catch (error) {
        await cx.rollback();
        throw error;
    } finally {
        cx.release();
    }
}
async function registrarPaciente(req, res) {
    return registrar(req, res, false);
}
async function registrarMedico(req, res) {
    return registrar(req, res, true);
}
module.exports = { registrarPaciente, registrarMedico };
