const nodemailer = require('nodemailer');
let transporterPromise;
async function obtenerTransporter() {
    if (!transporterPromise) {
        transporterPromise = (async () => {
            if (process.env.SMTP_HOST) {
                return nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: Number(process.env.SMTP_PORT || 587),
                    secure: process.env.SMTP_SECURE === 'true',
                    ...(process.env.SMTP_USER
                        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
                        : {})
                });
            }
            const cuenta = await nodemailer.createTestAccount();
            return nodemailer.createTransport({
                host: cuenta.smtp.host,
                port: cuenta.smtp.port,
                secure: cuenta.smtp.secure,
                auth: { user: cuenta.user, pass: cuenta.pass }
            });
        })().catch((error) => {
            transporterPromise = undefined;
            throw error;
        });
    }
    return transporterPromise;
}
async function enviarCorreo({ to, subject, text, html }) {
    const conexion = await obtenerTransporter();
    const info = await conexion.sendMail({
        from: '"Gestión de Turnos Médicos" <pruebas@gestion-turnos.test>',
        to,
        subject,
        text,
        html
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log('Correo enviado al servicio de pruebas.');
    console.log('Asunto:', subject);
    if (previewUrl) console.log('Vista previa:', previewUrl);
    return { messageId: info.messageId, previewUrl };
}
function cerrarCorreo() {
    if (transporterPromise) transporterPromise.then((t) => t.close()).catch(() => {});
}
module.exports = { enviarCorreo, cerrarCorreo };
