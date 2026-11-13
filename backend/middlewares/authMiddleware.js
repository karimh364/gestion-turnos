const db = require('../config/database');
const jwt = require('jsonwebtoken');
module.exports = async function verificarToken(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Se requiere un token de autenticación' });
    let claims;
    try {
        claims = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Token inválido o vencido' });
    }
    try {
        const [usuarios] = await db.execute(
            'SELECT id_usuario,email,id_rol,activo,email_verificado,dni_paciente,matricula_medico FROM usuario WHERE id_usuario=?',
            [claims.id_usuario]
        );
        const u = usuarios[0];
        if (!u || !u.activo || !u.email_verificado || ![1, 2, 3].includes(u.id_rol))
            return res.status(401).json({ error: 'La sesión ya no está habilitada' });
        req.usuario = u;
        next();
    } catch (error) {
        next(error);
    }
};
