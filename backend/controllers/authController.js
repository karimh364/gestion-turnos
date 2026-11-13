const db = require('../config/database');
const authService = require('../services/authService');
const jwt = require('jsonwebtoken');
const v = require('../utils/validaciones');
async function login(req, res) {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password)
        v.fallo(400, 'El email y la contraseña son obligatorios');
    const u = await authService.verificarCredenciales(email.trim().toLowerCase(), password);
    if (!u) v.fallo(401, 'Credenciales incorrectas');
    if (u.error === 'EMAIL_NO_VERIFICADO')
        v.fallo(403, 'Debés verificar tu correo antes de iniciar sesión');
    if (!process.env.JWT_SECRET) throw new Error('Falta configurar JWT_SECRET');
    const usuario = {
        id_usuario: u.id_usuario,
        email: u.email,
        id_rol: u.id_rol,
        dni_paciente: u.dni_paciente,
        matricula_medico: u.matricula_medico
    };
    const token = jwt.sign(usuario, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ mensaje: 'Inicio de sesión exitoso', usuario, token });
}
function sesion(req, res) {
    const { id_usuario, email, id_rol, dni_paciente, matricula_medico } = req.usuario;
    res.json({ id_usuario, email, id_rol, dni_paciente, matricula_medico });
}
module.exports = { login, sesion };
