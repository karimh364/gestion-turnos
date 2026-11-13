// Pruebas sobre una copia temporal: nunca se insertan fixtures en gestion_turnos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const backend = path.resolve(__dirname, '..');
const config = dotenv.parse(fs.readFileSync(path.join(backend, '.env')));
const origen = config.DB_NAME;
const nombre = `gestion_turnos_prueba_tp_${Date.now()}`;
const report = {
    inicio: new Date().toISOString(),
    baseOriginal: origen,
    pruebas: [],
    completo: false
};
const rutaReporte = path.join(backend, 'tests', 'resultado-circuito.json');
let control,
    db,
    server,
    smtp,
    creada = false,
    fallarCorreo = false;
const correos = [];
const smtpSockets = new Set();
let base, terminarWeb;
const dumpArgs = [
    '--default-character-set=utf8mb4',
    '--single-transaction',
    '--skip-comments',
    '-h',
    config.DB_HOST || 'localhost',
    '-P',
    config.DB_PORT || '3306',
    '-u',
    config.DB_USER,
    origen
];
function volcado() {
    return execFileSync('C:/xampp/mysql/bin/mysqldump.exe', dumpArgs, {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, MYSQL_PWD: config.DB_PASSWORD || '' }
    });
}
function escuchar(instancia) {
    return new Promise((resolve, reject) => {
        instancia.once('error', reject);
        instancia.listen(0, '127.0.0.1', () => resolve(instancia.address().port));
    });
}
function servidorSMTP() {
    return net.createServer((socket) => {
        smtpSockets.add(socket);
        socket.on('close', () => smtpSockets.delete(socket));
        socket.on('error', () => {});
        socket.write('220 localhost ESMTP\r\n');
        let buffer = '',
            datos = false;
        socket.on('data', (chunk) => {
            buffer += chunk.toString();
            let index;
            while ((index = buffer.indexOf('\r\n')) >= 0) {
                const linea = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);
                if (datos) {
                    if (linea === '.') {
                        datos = false;
                        if (fallarCorreo) {
                            fallarCorreo = false;
                            socket.write('550 Prueba de fallo SMTP\r\n');
                        } else socket.write('250 Mensaje capturado\r\n');
                    }
                    continue;
                }
                if (/^EHLO|^HELO/.test(linea)) socket.write('250-localhost\r\n250 PIPELINING\r\n');
                else if (/^DATA/.test(linea)) {
                    datos = true;
                    socket.write('354 Enviar mensaje\r\n');
                } else if (/^QUIT/.test(linea)) {
                    socket.end('221 Fin\r\n');
                } else socket.write('250 OK\r\n');
            }
        });
    });
}
async function api(method, ruta, body, token) {
    const r = await fetch(base + '/api' + ruta, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000)
    });
    const tipo = r.headers.get('content-type') || '';
    const data = tipo.includes('application/json') ? await r.json() : await r.text();
    return { status: r.status, data };
}
async function esperar(method, ruta, body, token, status) {
    const r = await api(method, ruta, body, token);
    assert.equal(r.status, status, `${method} ${ruta}: ${r.data.error || r.data.mensaje || ''}`);
    return r.data;
}
async function prueba(nombrePrueba, fn) {
    const inicio = Date.now();
    try {
        await fn();
        report.pruebas.push({ nombre: nombrePrueba, ok: true, ms: Date.now() - inicio });
        console.log('OK ' + nombrePrueba);
    } catch (error) {
        report.pruebas.push({ nombre: nombrePrueba, ok: false, error: error.message });
        throw error;
    }
}
function enlaceCorreo(email, fragmento) {
    const mail = [...correos]
        .reverse()
        .find((m) => m.to === email && (!fragmento || m.text.includes(fragmento)));
    assert.ok(mail, 'Falta el correo capturado');
    const link = mail.text.match(/https?:\/\/[^\s<>]+/)[0].replace(/\.$/, '');
    return new URL(link);
}
async function limpiar() {
    if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
    if (db) await db.end();
    if (smtp) {
        for (const socket of smtpSockets) socket.destroy();
        await new Promise((resolve) => smtp.close(resolve));
    }
    if (control) {
        if (creada) {
            assert.ok(/^gestion_turnos_prueba_tp_\d+$/.test(nombre) && nombre !== origen);
            await control.query('DROP DATABASE `' + nombre + '`');
        }
        await control.end();
    }
}
(async () => {
    assert.ok(/^[\w]+$/.test(origen));
    control = await mysql.createConnection({
        host: config.DB_HOST,
        port: Number(config.DB_PORT),
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        multipleStatements: true
    });
    const original = volcado();
    assert.ok(
        !/^USE |CREATE DATABASE/im.test(original),
        'El volcado no debe cambiar la base seleccionada'
    );
    await control.query(
        'CREATE DATABASE `' + nombre + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci'
    );
    creada = true;
    await control.changeUser({ database: nombre });
    await control.query(original);
    smtp = servidorSMTP();
    const puertoSMTP = await escuchar(smtp);
    Object.assign(process.env, config, {
        DB_NAME: nombre,
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(puertoSMTP),
        SMTP_SECURE: 'false'
    });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const email = require('../services/emailService');
    const enviarReal = email.enviarCorreo;
    email.enviarCorreo = async (mensaje) => {
        const resultado = await enviarReal(mensaje);
        correos.push(mensaje);
        return resultado;
    };
    const express = require('express');
    const app = require('../server');
    const harness = express();
    if (process.argv.includes('--navegador')) {
        harness.get('/__pruebas/correos', (req, res) =>
            res.json(
                correos.map((m) => ({
                    to: m.to,
                    subject: m.subject,
                    enlace: m.text.match(/https?:\/\/[^\s<>]+/)?.[0]?.replace(/\.$/, '')
                }))
            )
        );
        harness.post('/__pruebas/terminar', (req, res) => {
            res.json({ ok: true });
            setTimeout(() => terminarWeb?.(), 100);
        });
    }
    harness.use(app);
    server = require('node:http').createServer(harness);
    const puerto = await escuchar(server);
    base = `http://127.0.0.1:${puerto}`;
    process.env.FRONTEND_URL = base;
    db = require('../config/database');
    const contexto = {
        assert,
        db,
        api,
        esperar,
        prueba,
        enlaceCorreo,
        correos,
        bcrypt,
        config,
        base,
        get fallarCorreo() {
            return fallarCorreo;
        },
        set fallarCorreo(valor) {
            fallarCorreo = valor;
        }
    };
    await require('../tests/circuitoCasos')(contexto);
    const despues = volcado();
    assert.equal(
        crypto.createHash('sha256').update(despues).digest('hex'),
        crypto.createHash('sha256').update(original).digest('hex'),
        'La base original cambió durante la prueba'
    );
    report.baseOriginalConservada = true;
    if (process.argv.includes('--navegador')) {
        console.log('PRUEBAS_WEB_URL=' + base);
        console.log('API comprobada. Servidor temporal disponible para pruebas de navegador.');
        await new Promise((resolve) => {
            terminarWeb = resolve;
        });
    }
    report.completo = true;
})()
    .catch((error) => {
        report.error = error.message;
        if (!report.pruebas.some((p) => !p.ok))
            report.pruebas.push({
                nombre: 'Preparación o integración del circuito',
                ok: false,
                error: error.message
            });
        console.error('FALLO: ' + error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await limpiar();
        } catch (error) {
            report.errorLimpieza = error.message;
            process.exitCode = 1;
        }
        report.fin = new Date().toISOString();
        fs.mkdirSync(path.dirname(rutaReporte), { recursive: true });
        fs.writeFileSync(rutaReporte, JSON.stringify(report, null, 2));
        console.log(
            'RESULTADO ' +
                (report.completo ? 'COMPLETO' : 'INCOMPLETO') +
                ': ' +
                report.pruebas.filter((p) => p.ok).length +
                '/' +
                report.pruebas.length +
                ' pruebas correctas. Reporte: tests/resultado-circuito.json'
        );
    });
