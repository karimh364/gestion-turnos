const db = require('../config/database');
const crypto = require('crypto');
const v = require('../utils/validaciones');
const tipos = ['VERIFICACION_EMAIL', 'RECUPERACION_PASSWORD'];
async function crearTokenCuenta(idUsuario, tipo, minutosValidez = 30, conexion) {
    v.entero(idUsuario, 'El usuario');
    if (!tipos.includes(tipo)) v.fallo(400, 'Tipo de token no válido');
    if (!Number.isFinite(minutosValidez) || minutosValidez <= 0)
        v.fallo(400, 'La vigencia no es válida');
    const propia = !conexion;
    const cx = conexion || (await db.getConnection());
    try {
        if (propia) await cx.beginTransaction();
        const [usuarios] = await cx.execute(
            'SELECT id_usuario FROM usuario WHERE id_usuario=? FOR UPDATE',
            [idUsuario]
        );
        if (!usuarios.length) v.fallo(404, 'El usuario no existe');
        const token = crypto.randomBytes(32).toString('hex');
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        await cx.execute(
            'UPDATE token_cuenta SET usado=1 WHERE id_usuario=? AND tipo=? AND usado=0',
            [idUsuario, tipo]
        );
        await cx.execute(
            'INSERT INTO token_cuenta (id_usuario,token_hash,tipo,fecha_expiracion,usado) VALUES (?,?,?,?,0)',
            [idUsuario, hash, tipo, new Date(Date.now() + minutosValidez * 60000)]
        );
        if (propia) await cx.commit();
        return token;
    } catch (error) {
        if (propia) await cx.rollback();
        throw error;
    } finally {
        if (propia) cx.release();
    }
}
async function buscarTokenValido(token, tipo) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !tipos.includes(tipo))
        return null;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const [filas] = await db.execute(
        'SELECT id_token,id_usuario FROM token_cuenta WHERE token_hash=? AND tipo=? AND usado=0 AND fecha_expiracion>NOW() LIMIT 1',
        [hash, tipo]
    );
    return filas[0] || null;
}
async function marcarTokenUsado(idToken, conexion = db) {
    const [r] = await conexion.execute(
        'UPDATE token_cuenta SET usado=1 WHERE id_token=? AND usado=0 AND fecha_expiracion>NOW()',
        [idToken]
    );
    return r.affectedRows === 1;
}
module.exports = { crearTokenCuenta, buscarTokenValido, marcarTokenUsado };
