const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { crearTokenCuenta, buscarTokenValido } = require('../services/tokenService');
const { enviarCorreo } = require('../services/emailService');
const v = require('../utils/validaciones');
async function solicitarRecuperacion(req, res) {
    const email = v.correo(req.body?.email);
    const cx = await db.getConnection();
    try {
        await cx.beginTransaction();
        const [usuarios] = await cx.execute(
            'SELECT id_usuario FROM usuario WHERE email=? AND activo=1 FOR UPDATE',
            [email]
        );
        if (usuarios.length) {
            const token = await crearTokenCuenta(
                usuarios[0].id_usuario,
                'RECUPERACION_PASSWORD',
                30,
                cx
            );
            const enlace = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/restablecer-password.html?token=${token}`;
            await enviarCorreo({
                to: email,
                subject: 'Recuperación de contraseña - Gestión de Turnos',
                text: `Para cambiar tu contraseña, abrí ${enlace}. El enlace vence en 30 minutos. Si no lo solicitaste, ignorá este mensaje.`,
                html: `<h2>Recuperación de contraseña</h2><p><a href="${v.escapar(enlace)}">Cambiar mi contraseña</a></p><p>El enlace vence en 30 minutos. Si no lo solicitaste, ignorá este mensaje.</p>`
            });
        }
        await cx.commit();
        res.json({
            mensaje:
                'Si existe una cuenta activa con ese correo, recibirás un enlace para cambiar la contraseña.'
        });
    } catch (error) {
        await cx.rollback();
        throw error;
    } finally {
        cx.release();
    }
}
async function restablecerPassword(req, res) {
    const token = req.body?.token;
    const password = v.password(req.body?.password);
    const encontrado = await buscarTokenValido(token, 'RECUPERACION_PASSWORD');
    if (!encontrado) v.fallo(400, 'El enlace venció, ya fue utilizado o no es válido');
    const hash = await bcrypt.hash(password, 10);
    const cx = await db.getConnection();
    try {
        await cx.beginTransaction();
        const [usuarios] = await cx.execute(
            'SELECT activo FROM usuario WHERE id_usuario=? FOR UPDATE',
            [encontrado.id_usuario]
        );
        if (!usuarios.length || !usuarios[0].activo) v.fallo(400, 'La cuenta no está habilitada');
        const [filas] = await cx.execute(
            "SELECT id_usuario FROM token_cuenta WHERE id_token=? AND tipo='RECUPERACION_PASSWORD' AND usado=0 AND fecha_expiracion>NOW() FOR UPDATE",
            [encontrado.id_token]
        );
        if (!filas.length) v.fallo(400, 'El enlace venció o ya fue utilizado');
        await cx.execute('UPDATE usuario SET password_hash=? WHERE id_usuario=? AND activo=1', [
            hash,
            filas[0].id_usuario
        ]);
        await cx.execute('UPDATE token_cuenta SET usado=1 WHERE id_usuario=? AND tipo=?', [
            filas[0].id_usuario,
            'RECUPERACION_PASSWORD'
        ]);
        await cx.commit();
        res.json({ mensaje: 'Contraseña actualizada. Ya podés iniciar sesión.' });
    } catch (error) {
        await cx.rollback();
        throw error;
    } finally {
        cx.release();
    }
}
module.exports = { solicitarRecuperacion, restablecerPassword };
