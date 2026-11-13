module.exports = async (c) => {
    const { assert, db, api, esperar: E, prueba: P, enlaceCorreo, bcrypt } = c;
    const [[basePrueba]] = await db.query('SELECT DATABASE() AS nombre');
    assert.match(basePrueba.nombre, /^gestion_turnos_prueba_tp_\d+$/);
    // La cuenta de este médico se recrea solo en la copia temporal.
    await db.execute('DELETE FROM usuario WHERE matricula_medico=?', [1001]);
    const [[limite]] = await db.query(
        "SELECT DATE_FORMAT(MAX(fecha_turno),'%Y-%m-%d') ultima FROM turno"
    );
    const primeraFecha = Math.max(
        Date.now() + 3 * 86400000,
        limite.ultima ? new Date(limite.ultima + 'T12:00:00').getTime() + 7 * 86400000 : 0
    );
    const fecha = (dia, semanas = 0) => {
        const d = new Date(primeraFecha);
        d.setHours(12, 0, 0, 0);
        while (d.getDay() !== dia) d.setDate(d.getDate() + 1);
        d.setDate(d.getDate() + semanas * 7);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const lunes = fecha(1),
        jueves = fecha(4),
        sabado = fecha(6),
        domingo = fecha(0);
    const generarClave = () => require('node:crypto').randomBytes(18).toString('hex');
    const clave = generarClave();
    const paciente = {
        dni_paciente: 1900000001,
        nombre_paciente: 'Paciente',
        apellido_paciente: 'Prueba TP',
        fec_nac_paciente: '1995-06-15',
        email: 'tp.paciente@example.test',
        password: clave
    };
    const otro = { ...paciente, dni_paciente: 1900000002, email: 'tp.otro@example.test' };
    let admin, pacienteToken, otroToken, medicoToken, primero, adyacente;
    await db.execute(
        'INSERT INTO usuario (email,password_hash,id_rol,activo,email_verificado) VALUES (?,?,1,1,1)',
        ['tp.admin@example.test', await bcrypt.hash(clave, 10)]
    );
    await P('Login ADMIN y JWT', async () => {
        admin = (
            await E(
                'POST',
                '/auth/login',
                { email: 'tp.admin@example.test', password: clave },
                null,
                200
            )
        ).token;
        assert.ok(admin);
    });
    if (c.config.ADMIN_EMAIL && c.config.ADMIN_PASSWORD) {
        await P('Login del administrador local conservado', () =>
            E(
                'POST',
                '/auth/login',
                { email: c.config.ADMIN_EMAIL, password: c.config.ADMIN_PASSWORD },
                null,
                200
            )
        );
    }
    await P('Login sin datos: 400', () => E('POST', '/auth/login', {}, null, 400));
    await P('Login contraseña incorrecta: 401', () =>
        E('POST', '/auth/login', { email: paciente.email, password: 'Incorrecta123' }, null, 401)
    );
    await P('Ruta protegida sin token: 401', () => E('GET', '/turnos', undefined, null, 401));
    await P('JWT mal formado: 401', () => E('GET', '/turnos', undefined, 'invalido', 401));
    await P('JWT vencido: 401', () =>
        E(
            'GET',
            '/turnos',
            undefined,
            require('jsonwebtoken').sign({ id_usuario: 1 }, process.env.JWT_SECRET, {
                expiresIn: -1
            }),
            401
        )
    );
    for (const [nombre, body] of [
        ['sin datos', {}],
        ['DNI inválido', { ...paciente, dni_paciente: -1 }],
        ['DNI booleano', { ...paciente, dni_paciente: true }],
        ['nombre no textual', { ...paciente, nombre_paciente: 7 }],
        ['nombre excesivo', { ...paciente, nombre_paciente: 'a'.repeat(51) }],
        ['correo inválido', { ...paciente, email: 'abc' }],
        ['correo excesivo', { ...paciente, email: 'a'.repeat(45) + '@e.com' }],
        ['contraseña corta', { ...paciente, password: '1234567' }],
        ['contraseña truncable', { ...paciente, password: 'á'.repeat(40) }],
        ['nacimiento imposible', { ...paciente, fec_nac_paciente: '2026-02-31' }],
        ['nacimiento fuera de rango', { ...paciente, fec_nac_paciente: '0001-01-01' }],
        ['nacimiento futuro', { ...paciente, fec_nac_paciente: '2099-01-01' }]
    ])
        await P('Registro paciente ' + nombre + ': 400', () =>
            E('POST', '/auth/registro/paciente', body, null, 400)
        );
    await P('Registro paciente: 201 y correo SMTP capturado', async () => {
        await E('POST', '/auth/registro/paciente', paciente, null, 201);
        assert.ok(enlaceCorreo(paciente.email).searchParams.get('token'));
    });
    await P('Contraseña almacenada como hash y cuenta pendiente', async () => {
        const [[u]] = await db.execute('SELECT * FROM usuario WHERE email=?', [paciente.email]);
        assert.equal(u.email_verificado, 0);
        assert.equal(u.id_rol, 3);
        assert.notEqual(u.password_hash, clave);
        assert.ok(await bcrypt.compare(clave, u.password_hash));
    });
    await P('Registro duplicado: 409', () =>
        E('POST', '/auth/registro/paciente', paciente, null, 409)
    );
    await P('DNI con otro correo: 409', () =>
        E(
            'POST',
            '/auth/registro/paciente',
            { ...paciente, email: 'otra.cuenta@example.test' },
            null,
            409
        )
    );
    await P('Login previo a verificación: 403', () =>
        E('POST', '/auth/login', { email: paciente.email, password: clave }, null, 403)
    );
    await P('Verificación sin token: 400', () =>
        E('GET', '/auth/verificar-email', undefined, null, 400)
    );
    await P('Verificación token inexistente: 400', () =>
        E('GET', '/auth/verificar-email?token=' + 'f'.repeat(64), undefined, null, 400)
    );
    const verificar = async (email) =>
        E(
            'GET',
            '/auth/verificar-email?token=' + enlaceCorreo(email).searchParams.get('token'),
            undefined,
            null,
            200
        );
    await P('Verificación por enlace: 200', () => verificar(paciente.email));
    await P('Verificación reutilizada: 400', () =>
        E(
            'GET',
            '/auth/verificar-email?token=' + enlaceCorreo(paciente.email).searchParams.get('token'),
            undefined,
            null,
            400
        )
    );
    await P('Login PACIENTE verificado: 200', async () => {
        const data = await E(
            'POST',
            '/auth/login',
            { email: paciente.email, password: clave },
            null,
            200
        );
        assert.equal(data.usuario.id_rol, 3);
        pacienteToken = data.token;
    });
    await E('POST', '/auth/registro/paciente', otro, null, 201);
    await verificar(otro.email);
    otroToken = (await E('POST', '/auth/login', { email: otro.email, password: clave }, null, 200))
        .token;
    await P('Registro médico inexistente: 404', () =>
        E(
            'POST',
            '/auth/registro/medico',
            { matricula_medico: 2147483647, email: 'tp.medico@example.test', password: clave },
            null,
            404
        )
    );
    await P('Registro médico sin datos: 400', () =>
        E('POST', '/auth/registro/medico', {}, null, 400)
    );
    await P('Registro y verificación MÉDICO', async () => {
        await E(
            'POST',
            '/auth/registro/medico',
            { matricula_medico: 1001, email: 'tp.medico@example.test', password: clave },
            null,
            201
        );
        await verificar('tp.medico@example.test');
        const data = await E(
            'POST',
            '/auth/login',
            { email: 'tp.medico@example.test', password: clave },
            null,
            200
        );
        assert.equal(data.usuario.id_rol, 2);
        medicoToken = data.token;
    });
    await P('Matrícula duplicada: 409', () =>
        E(
            'POST',
            '/auth/registro/medico',
            { matricula_medico: 1001, email: 'tp.medico.otra@example.test', password: clave },
            null,
            409
        )
    );
    await P('Fallo SMTP revierte cuenta, paciente y token', async () => {
        c.fallarCorreo = true;
        const errorLog = console.error;
        console.error = () => {};
        try {
            await E(
                'POST',
                '/auth/registro/paciente',
                { ...paciente, dni_paciente: 1900000004, email: 'tp.fallo@example.test' },
                null,
                500
            );
        } finally {
            console.error = errorLog;
        }
        const [[r]] = await db.query(
            'SELECT COUNT(*) n FROM paciente WHERE dni_paciente=1900000004'
        );
        assert.equal(r.n, 0);
        const [[u]] = await db.execute('SELECT COUNT(*) n FROM usuario WHERE email=?', [
            'tp.fallo@example.test'
        ]);
        assert.equal(u.n, 0);
    });
    await P('Recuperación de cuenta desconocida: respuesta neutral', async () => {
        const a = await E(
            'POST',
            '/auth/recuperar-password',
            { email: 'desconocido@example.test' },
            null,
            200
        );
        const b = await E('POST', '/auth/recuperar-password', { email: paciente.email }, null, 200);
        assert.equal(a.mensaje, b.mensaje);
    });
    const recovery = enlaceCorreo(paciente.email, 'restablecer-password').searchParams.get('token');
    await P('Token de recuperación no verifica email', () =>
        E('GET', '/auth/verificar-email?token=' + recovery, undefined, null, 400)
    );
    await P('Recuperación rechaza contraseña corta', () =>
        E('POST', '/auth/restablecer-password', { token: recovery, password: '123' }, null, 400)
    );
    const nueva = generarClave();
    await P('Cambio de contraseña mediante enlace: 200', () =>
        E('POST', '/auth/restablecer-password', { token: recovery, password: nueva }, null, 200)
    );
    await P('Enlace de recuperación consumido: 400', () =>
        E('POST', '/auth/restablecer-password', { token: recovery, password: clave }, null, 400)
    );
    await P('Contraseña anterior deja de funcionar', () =>
        E('POST', '/auth/login', { email: paciente.email, password: clave }, null, 401)
    );
    await P('Nueva contraseña funciona', async () => {
        pacienteToken = (
            await E('POST', '/auth/login', { email: paciente.email, password: nueva }, null, 200)
        ).token;
    });
    await P('Recuperación nueva invalida enlace anterior', async () => {
        await E('POST', '/auth/recuperar-password', { email: paciente.email }, null, 200);
        const anterior = enlaceCorreo(paciente.email, 'restablecer-password').searchParams.get(
            'token'
        );
        await E('POST', '/auth/recuperar-password', { email: paciente.email }, null, 200);
        await E(
            'POST',
            '/auth/restablecer-password',
            { token: anterior, password: clave },
            null,
            400
        );
    });
    await P('Recuperación vencida: 400', async () => {
        const token = enlaceCorreo(paciente.email, 'restablecer-password').searchParams.get(
            'token'
        );
        await db.execute(
            "UPDATE token_cuenta SET fecha_expiracion=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE tipo='RECUPERACION_PASSWORD' AND usado=0"
        );
        await E('POST', '/auth/restablecer-password', { token, password: clave }, null, 400);
    });
    await P('Catálogo del paciente no expone otros pacientes', async () => {
        const cat = await E('GET', '/catalogos', undefined, pacienteToken, 200);
        assert.equal(cat.paciente.length, 1);
        assert.equal(cat.paciente[0].dni_paciente, paciente.dni_paciente);
    });
    const reserva = {
        fecha_turno: lunes,
        hora_turno: '10:00',
        dni_paciente: paciente.dni_paciente,
        id_practica: 1,
        id_equipo: 15,
        matricula_medico: 1001,
        id_disponibilidad: 1
    };
    for (const [nombre, cambio, status] of [
        ['fecha pasada', { fecha_turno: '2000-01-01' }, 400],
        ['fecha imposible', { fecha_turno: '2026-02-31' }, 400],
        ['hora inválida', { hora_turno: '25:00' }, 400],
        ['domingo', { fecha_turno: domingo }, 400],
        ['antes de abrir', { hora_turno: '07:59' }, 400],
        ['después de cerrar', { hora_turno: '20:00' }, 400],
        ['sábado excedido', { fecha_turno: sabado, hora_turno: '13:45' }, 400],
        ['duración excede disponibilidad', { hora_turno: '11:45' }, 400],
        ['médico incompatible', { matricula_medico: 1003 }, 400],
        ['equipo incompatible', { id_equipo: 1 }, 400],
        ['paciente inexistente', { dni_paciente: 2147483647 }, 404],
        ['práctica inexistente', { id_practica: 2147483647 }, 404],
        ['médico inexistente', { matricula_medico: 2147483647 }, 404],
        ['equipo inexistente', { id_equipo: 2147483647 }, 404],
        ['disponibilidad inexistente', { id_disponibilidad: 2147483647 }, 404],
        ['estado libre', { estado_turno: 'Inventado' }, 400],
        ['medio libre', { medio_solicitado: 'Inventado' }, 400],
        ['médico confirmación inexistente', { medico_confirmacion: 2147483647 }, 404],
        ['fecha confirmación inválida', { fecha_confirmacion: 'abc' }, 400],
        ['fecha confirmación booleana', { fecha_confirmacion: false }, 400],
        ['fecha confirmación imposible', { fecha_confirmacion: '2026-02-31T08:00:00' }, 400],
        ['hora confirmación inválida', { fecha_confirmacion: '2000-01-01T24:00:00' }, 400],
        ['confirmación futura', { fecha_confirmacion: '2099-01-01T08:00:00' }, 400],
        ['referencia booleana', { id_practica: true }, 400]
    ])
        await P('Reserva ' + nombre, () =>
            E('POST', '/turnos', { ...reserva, ...cambio }, admin, status)
        );
    await P('Reserva sin campos obligatorios: 400', () => E('POST', '/turnos', {}, admin, 400));
    await P('Paciente no reserva para otro DNI: 403', () =>
        E('POST', '/turnos', { ...reserva, dni_paciente: otro.dni_paciente }, pacienteToken, 403)
    );
    await P('Médico no crea reservas: 403', () => E('POST', '/turnos', reserva, medicoToken, 403));
    await P('Reserva válida y asignación única de médico', async () => {
        primero = (await E('POST', '/turnos', reserva, pacienteToken, 201)).id_turno;
        const t = await E('GET', '/turnos/' + primero, undefined, pacienteToken, 200);
        assert.equal(t.matricula_medico, 1001);
        assert.equal(t.estado_turno, 'Reservado');
        const [[r]] = await db.execute('SELECT COUNT(*) n FROM registra WHERE id_turno=?', [
            primero
        ]);
        assert.equal(r.n, 1);
    });
    await P('Reserva idéntica: 409', () => E('POST', '/turnos', reserva, admin, 409));
    await P('Superposición parcial: 409', () =>
        E('POST', '/turnos', { ...reserva, hora_turno: '10:15' }, admin, 409)
    );
    await P('Turnos adyacentes: 201', async () => {
        adyacente = (await E('POST', '/turnos', { ...reserva, hora_turno: '10:30' }, admin, 201))
            .id_turno;
    });
    await P('Paciente no se superpone entre servicios', () =>
        E(
            'POST',
            '/turnos',
            {
                ...reserva,
                hora_turno: '10:00',
                id_practica: 3,
                id_equipo: 1,
                matricula_medico: 1003
            },
            admin,
            409
        )
    );
    await E(
        'POST',
        '/turnos',
        {
            ...reserva,
            hora_turno: '11:00',
            dni_paciente: otro.dni_paciente,
            id_practica: 3,
            id_equipo: 1,
            matricula_medico: 1003
        },
        admin,
        201
    );
    await P('Médico no se superpone usando otro equipo', () =>
        E(
            'POST',
            '/turnos',
            {
                ...reserva,
                hora_turno: '11:00',
                id_practica: 3,
                id_equipo: 2,
                matricula_medico: 1003
            },
            admin,
            409
        )
    );
    const reservaEquipoCompartido = {
        ...reserva,
        fecha_turno: lunes,
        hora_turno: '14:00',
        id_practica: 3,
        id_equipo: 1,
        matricula_medico: 1004,
        id_disponibilidad: 2
    };
    await E('POST', '/turnos', reservaEquipoCompartido, admin, 201);
    await P('Equipo no se superpone entre médicos', () =>
        E(
            'POST',
            '/turnos',
            { ...reservaEquipoCompartido, dni_paciente: otro.dni_paciente, matricula_medico: 1018 },
            admin,
            409
        )
    );
    await P('Confirmación guarda fecha y medio', async () => {
        await E(
            'PATCH',
            '/turnos/' + primero + '/confirmar',
            { medio_confirmacion: 'Teléfono', medico_confirmacion: 1001 },
            medicoToken,
            200
        );
        const t = await E('GET', '/turnos/' + primero, undefined, admin, 200);
        assert.equal(t.estado_turno, 'Confirmado');
        assert.equal(t.medio_confirmacion, 'Teléfono');
        assert.ok(t.fecha_confirmacion);
    });
    await P('Confirmación repetida: 400', () =>
        E('PATCH', '/turnos/' + primero + '/confirmar', {}, admin, 400)
    );
    await P('Reprogramación conserva ID y vuelve a reservado', async () => {
        await E(
            'PUT',
            '/turnos/' + primero,
            { fecha_turno: lunes, hora_turno: '09:00' },
            pacienteToken,
            200
        );
        const t = await E('GET', '/turnos/' + primero, undefined, admin, 200);
        assert.equal(t.estado_turno, 'Reservado');
        assert.equal(t.fecha_confirmacion, null);
        assert.equal(t.medio_confirmacion, null);
    });
    await P('Reprogramación conflictiva deja los datos previos', async () => {
        await E(
            'PUT',
            '/turnos/' + primero,
            { fecha_turno: lunes, hora_turno: '10:30' },
            admin,
            409
        );
        const t = await E('GET', '/turnos/' + primero, undefined, admin, 200);
        assert.equal(t.hora_turno, '09:00:00');
    });
    for (const [metodo, ruta, body] of [
        ['GET', '/turnos/' + primero],
        ['GET', '/turnos/paciente/' + paciente.dni_paciente],
        ['PUT', '/turnos/' + primero, { fecha_turno: lunes, hora_turno: '08:00' }],
        ['PATCH', '/turnos/' + primero + '/cancelar', {}],
        ['PATCH', '/turnos/' + primero + '/confirmar', {}],
        ['DELETE', '/turnos/' + primero]
    ])
        await P('Aislamiento paciente ' + metodo + ' ' + ruta, () =>
            E(metodo, ruta, body, otroToken, 403)
        );
    await P('Cancelar conserva el turno y libera horario', async () => {
        await E('PATCH', '/turnos/' + primero + '/cancelar', {}, pacienteToken, 200);
        const t = await E('GET', '/turnos/' + primero, undefined, pacienteToken, 200);
        assert.equal(t.estado_turno, 'Cancelado');
        await E('POST', '/turnos', { ...reserva, hora_turno: '09:00' }, pacienteToken, 201);
    });
    await P('Cancelado no se reprograma', () =>
        E('PUT', '/turnos/' + primero, { fecha_turno: lunes, hora_turno: '08:00' }, admin, 400)
    );
    await P('Cancelado no se confirma', () =>
        E('PATCH', '/turnos/' + primero + '/confirmar', {}, admin, 400)
    );
    await P('Cancelación repetida: 400', () =>
        E('PATCH', '/turnos/' + primero + '/cancelar', {}, admin, 400)
    );
    await P('Consulta por paciente devuelve solo sus turnos', async () => {
        const t = await E(
            'GET',
            '/turnos/paciente/' + paciente.dni_paciente,
            undefined,
            pacienteToken,
            200
        );
        assert.ok(t.length);
        assert.ok(t.every((t) => t.dni_paciente === paciente.dni_paciente));
    });
    await P('Agenda médico contiene solo su matrícula', async () => {
        const t = await E('GET', '/turnos', undefined, medicoToken, 200);
        assert.ok(t.every((t) => t.matricula_medico === 1001));
    });
    await P('ID inválido: 400', () => E('GET', '/turnos/abc', undefined, admin, 400));
    await P('ID inexistente: 404', () => E('GET', '/turnos/2147483647', undefined, admin, 404));
    await P('Eliminar físico del CRUD conserva respuesta anterior', async () => {
        await E('DELETE', '/turnos/' + primero, undefined, admin, 200);
        await E('GET', '/turnos/' + primero, undefined, admin, 404);
    });
    await P('Reserva concurrente: solo una gana el horario', async () => {
        const r = await Promise.all([
            api(
                'POST',
                '/turnos',
                { ...reserva, fecha_turno: fecha(1, 2), hora_turno: '08:00' },
                admin
            ),
            api(
                'POST',
                '/turnos',
                { ...reserva, fecha_turno: fecha(1, 2), hora_turno: '08:00' },
                admin
            )
        ]);
        assert.deepEqual(r.map((r) => r.status).sort(), [201, 409]);
    });
    await P('Sábado hasta las 14:00 con disponibilidad real', async () => {
        const [d] = await db.execute(
            "INSERT INTO disponibilidad (dia,hora_desde,hora_hasta) VALUES ('Sábado','08:00','14:00')"
        );
        await db.execute('INSERT INTO medico_disponibilidad VALUES (?,?)', [1001, d.insertId]);
        await E(
            'POST',
            '/turnos',
            { ...reserva, fecha_turno: sabado, hora_turno: '13:30', id_disponibilidad: d.insertId },
            admin,
            201
        );
    });
    await P('Compatibilidad de servicio también se valida', () =>
        E(
            'POST',
            '/turnos',
            {
                ...reserva,
                fecha_turno: lunes,
                hora_turno: '09:00',
                id_practica: 4,
                id_equipo: 3,
                matricula_medico: 1003
            },
            admin,
            400
        )
    );
    await P('API anterior de cuatro campos asigna recursos compatibles', () =>
        E(
            'POST',
            '/turnos',
            {
                fecha_turno: fecha(1, 3),
                hora_turno: '08:00',
                dni_paciente: paciente.dni_paciente,
                id_practica: 1,
                estado_turno: null,
                medio_solicitado: null
            },
            admin,
            201
        )
    );
    const perfil = {
        nombre_paciente: 'Paciente',
        apellido_paciente: 'Prueba TP',
        fec_nac_paciente: '1995-06-15',
        tel_paciente: '1122334455',
        email_paciente: paciente.email,
        id_os: null,
        nro_afiliado_paciente: null
    };
    await P('Actualización de datos personales', () =>
        E('PUT', '/pacientes/' + paciente.dni_paciente, perfil, pacienteToken, 200)
    );
    await P('Datos ajenos protegidos', () =>
        E('PUT', '/pacientes/' + paciente.dni_paciente, perfil, otroToken, 403)
    );
    await P('Obra social inexistente: 404', () =>
        E(
            'PUT',
            '/pacientes/' + paciente.dni_paciente,
            { ...perfil, id_os: 2147483647 },
            admin,
            404
        )
    );
    await P('Afiliado sin obra social: 400', () =>
        E(
            'PUT',
            '/pacientes/' + paciente.dni_paciente,
            { ...perfil, nro_afiliado_paciente: 123 },
            admin,
            400
        )
    );
    await P('Teléfono inválido: 400', () =>
        E(
            'PUT',
            '/pacientes/' + paciente.dni_paciente,
            { ...perfil, tel_paciente: 'abc' },
            admin,
            400
        )
    );
    await P('Cuenta inactiva pierde acceso con JWT previo', async () => {
        await db.execute('UPDATE usuario SET activo=0 WHERE email=?', [otro.email]);
        await E('GET', '/turnos', undefined, otroToken, 401);
        await db.execute('UPDATE usuario SET activo=1 WHERE email=?', [otro.email]);
    });
    await P('Token de verificación vencido: 400', async () => {
        const p = { ...paciente, dni_paciente: 1900000003, email: 'tp.pendiente@example.test' };
        await E('POST', '/auth/registro/paciente', p, null, 201);
        await db.execute(
            'UPDATE token_cuenta tc JOIN usuario u ON u.id_usuario=tc.id_usuario SET tc.fecha_expiracion=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE u.email=?',
            [p.email]
        );
        await E(
            'GET',
            '/auth/verificar-email?token=' + enlaceCorreo(p.email).searchParams.get('token'),
            undefined,
            null,
            400
        );
    });
    await P('Ruta API inexistente: JSON 404', () => E('GET', '/no-existe', undefined, null, 404));
    await P('Un turno tiene un único médico asignado', () =>
        assert.rejects(
            db.execute(
                'INSERT INTO registra (matricula_medico,id_turno,id_disponibilidad) VALUES (?,?,?)',
                [1017, adyacente, 1]
            ),
            (error) => error.errno === 1062
        )
    );
    await P('Una duración inválida no permite reservar', async () => {
        const [[practica]] = await db.query('SELECT duracion FROM practica WHERE id_practica=1');
        try {
            await db.query('UPDATE practica SET duracion=0 WHERE id_practica=1');
            await E('POST', '/turnos', { ...reserva, fecha_turno: fecha(1, 5) }, admin, 400);
        } finally {
            await db.execute('UPDATE practica SET duracion=? WHERE id_practica=1', [
                practica.duracion
            ]);
        }
    });
    await P('JSON mal formado: 400', async () => {
        const r = await fetch(c.base + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{incorrecto'
        });
        assert.equal(r.status, 400);
        assert.ok((await r.json()).error);
    });
    await P('Supervisor no puede ser el propio médico', () =>
        assert.rejects(
            db.execute(
                'UPDATE medico SET matricula_supervisor=matricula_medico WHERE matricula_medico=1001'
            ),
            (error) => error.errno === 4025
        )
    );
    await P('Supervisor pertenece al mismo servicio', () =>
        assert.rejects(
            db.execute('UPDATE medico SET matricula_supervisor=1003 WHERE matricula_medico=1001'),
            (error) => error.errno === 1452
        )
    );
    await P('No se mueve un supervisor dejando subordinados en otro servicio', () =>
        assert.rejects(
            db.execute('UPDATE medico SET id_servicio=2 WHERE matricula_medico=1001'),
            (error) => error.errno === 1451
        )
    );
    await P('Supervisión compatible puede quedar vacía o asignada', async () => {
        await db.execute('UPDATE medico SET matricula_supervisor=NULL WHERE matricula_medico=1002');
        await db.execute('UPDATE medico SET matricula_supervisor=1001 WHERE matricula_medico=1002');
    });
    for (const pagina of [
        '/index.html',
        '/pages/dashboard.html',
        '/verificar-email.html',
        '/restablecer-password.html'
    ])
        await P('Página ' + pagina, async () => {
            const r = await fetch(c.base + pagina);
            assert.equal(r.status, 200);
            assert.ok((await r.text()).includes('<html lang="es">'));
        });
};
