require('dotenv').config();

const db = require('../config/database');
const bcrypt = require('bcryptjs');
const v = require('../utils/validaciones');

async function crearUsuarioPrueba() {
    try {
        const email = v.correo(process.env.ADMIN_EMAIL);
        // Comprobar si el usuario ya existe
        const [usuarios] = await db.execute('SELECT id_usuario FROM usuario WHERE email = ?', [
            email
        ]);

        if (usuarios.length > 0) {
            console.log('El usuario de prueba ya existe.');
            return;
        }

        // Generar el hash de la contraseña
        const password = v.password(process.env.ADMIN_PASSWORD);
        const passwordHash = await bcrypt.hash(password, 10);

        // Crear el usuario con rol ADMIN
        await db.execute(
            `INSERT INTO usuario (email, password_hash, id_rol, activo, email_verificado)
             VALUES (?, ?, ?, ?, ?)`,
            [email, passwordHash, 1, 1, 1]
        );

        console.log('Usuario de prueba creado correctamente.');
        console.log('Email:', email);
    } catch (error) {
        console.error('Error al crear el usuario:', error.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

crearUsuarioPrueba();
