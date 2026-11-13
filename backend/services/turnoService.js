const db = require('../config/database');
const v = require('../utils/validaciones');

const consulta = `SELECT t.*, p.nombre_practica, p.duracion,
    CONCAT(pa.apellido_paciente, ', ', pa.nombre_paciente) AS paciente, e.nombre_equipo,
    (SELECT r.matricula_medico FROM registra r WHERE r.id_turno=t.id_turno ORDER BY r.matricula_medico LIMIT 1) AS matricula_medico,
    (SELECT CONCAT(m.apellido_medico, ', ', m.nombre_medico) FROM registra r JOIN medico m ON m.matricula_medico=r.matricula_medico WHERE r.id_turno=t.id_turno ORDER BY r.matricula_medico LIMIT 1) AS medico
    FROM turno t JOIN practica p ON p.id_practica=t.id_practica
    JOIN paciente pa ON pa.dni_paciente=t.dni_paciente LEFT JOIN equipo e ON e.id_equipo=t.id_equipo`;

async function transaccion(operacion) {
    const conexion = await db.getConnection();
    try {
        await conexion.beginTransaction();
        const resultado = await operacion(conexion);
        await conexion.commit();
        return resultado;
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}

async function acceso(conexion, id, usuario) {
    const [filas] = await conexion.execute('SELECT * FROM turno WHERE id_turno=? FOR UPDATE', [
        v.entero(id, 'El turno')
    ]);
    if (!filas.length) v.fallo(404, 'Turno no encontrado');
    const turno = filas[0];
    if (usuario.id_rol === 3 && turno.dni_paciente !== usuario.dni_paciente)
        v.fallo(403, 'No tenés permisos sobre este turno');
    if (usuario.id_rol === 2) {
        const [relacion] = await conexion.execute(
            'SELECT 1 FROM registra WHERE id_turno=? AND matricula_medico=?',
            [turno.id_turno, usuario.matricula_medico]
        );
        if (!relacion.length) v.fallo(403, 'No tenés permisos sobre este turno');
    }
    return turno;
}

async function obtenerTodos(usuario) {
    let filtro = '';
    const params = [];
    if (usuario?.id_rol === 3) {
        filtro = ' WHERE t.dni_paciente=?';
        params.push(usuario.dni_paciente);
    }
    if (usuario?.id_rol === 2) {
        filtro =
            ' WHERE EXISTS (SELECT 1 FROM registra r WHERE r.id_turno=t.id_turno AND r.matricula_medico=?)';
        params.push(usuario.matricula_medico);
    }
    const [turnos] = await db.execute(
        consulta + filtro + ' ORDER BY t.fecha_turno,t.hora_turno,t.id_turno',
        params
    );
    return turnos;
}

async function obtenerPorId(id, usuario) {
    const numero = v.entero(id, 'El turno');
    const turno = (await obtenerTodos(usuario)).find((t) => t.id_turno === numero);
    if (!turno) {
        const [existe] = await db.execute('SELECT id_turno FROM turno WHERE id_turno=?', [numero]);
        v.fallo(
            existe.length ? 403 : 404,
            existe.length ? 'No tenés permisos sobre este turno' : 'Turno no encontrado'
        );
    }
    return turno;
}

function validarHorario(fecha, hora, duracion) {
    if (!Number.isInteger(duracion) || duracion <= 0)
        v.fallo(400, 'La práctica no tiene una duración válida registrada');
    const dia = new Date(`${fecha}T12:00:00`).getDay();
    const inicio = v.segundos(hora),
        fin = inicio + duracion * 60;
    if (fecha < v.hoy() || new Date(`${fecha}T${hora}`).getTime() <= Date.now())
        v.fallo(400, 'La fecha y hora del turno deben ser futuras');
    if (dia === 0 || inicio < 8 * 3600 || fin > (dia === 6 ? 14 : 20) * 3600)
        v.fallo(
            400,
            'El turno completo debe estar dentro del horario: lunes a viernes 08:00–20:00 y sábado 08:00–14:00; domingo cerrado'
        );
    return { dia, inicio, fin };
}

async function preparar(conexion, datos, usuario, excluir = 0) {
    const fecha = v.fecha(datos.fecha_turno),
        hora = v.hora(datos.hora_turno);
    const dni = v.entero(datos.dni_paciente, 'El DNI'),
        practicaId = v.entero(datos.id_practica, 'La práctica');
    if (usuario.id_rol === 3 && dni !== usuario.dni_paciente)
        v.fallo(403, 'Solo podés reservar turnos para tu propia cuenta');
    // Los bloqueos por recurso serializan reservas concurrentes.
    const [pacientes] = await conexion.execute(
        'SELECT dni_paciente FROM paciente WHERE dni_paciente=? FOR UPDATE',
        [dni]
    );
    if (!pacientes.length) v.fallo(404, 'El paciente no existe');
    const [practicas] = await conexion.execute('SELECT * FROM practica WHERE id_practica=?', [
        practicaId
    ]);
    if (!practicas.length) v.fallo(404, 'La práctica no existe');
    const practica = practicas[0],
        horario = validarHorario(fecha, hora, practica.duracion);
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const normalizar = (s) =>
        s
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    const medicoId =
        datos.matricula_medico == null || datos.matricula_medico === ''
            ? null
            : v.entero(datos.matricula_medico, 'La matrícula');
    const disponibilidadId =
        datos.id_disponibilidad == null || datos.id_disponibilidad === ''
            ? null
            : v.entero(datos.id_disponibilidad, 'La disponibilidad');
    if (medicoId) {
        const [m] = await conexion.execute(
            'SELECT matricula_medico FROM medico WHERE matricula_medico=?',
            [medicoId]
        );
        if (!m.length) v.fallo(404, 'El médico no existe');
    }
    if (disponibilidadId) {
        const [d] = await conexion.execute(
            'SELECT id_disponibilidad FROM disponibilidad WHERE id_disponibilidad=?',
            [disponibilidadId]
        );
        if (!d.length) v.fallo(404, 'La disponibilidad no existe');
    }
    const [opciones] = await conexion.execute(
        `SELECT m.matricula_medico,d.* FROM medico m
        JOIN practica_medico pm ON pm.matricula_medico=m.matricula_medico
        JOIN medico_disponibilidad md ON md.matricula_medico=m.matricula_medico
        JOIN disponibilidad d ON d.id_disponibilidad=md.id_disponibilidad
        WHERE pm.id_practica=? AND m.id_servicio=? ORDER BY m.matricula_medico,d.id_disponibilidad`,
        [practicaId, practica.id_servicio]
    );
    const candidatos = opciones.filter(
        (o) =>
            (!medicoId || o.matricula_medico === medicoId) &&
            (!disponibilidadId || o.id_disponibilidad === disponibilidadId) &&
            normalizar(o.dia) === dias[horario.dia] &&
            v.segundos(o.hora_desde) <= horario.inicio &&
            v.segundos(o.hora_hasta) >= horario.fin
    );
    if (!candidatos.length)
        v.fallo(
            400,
            'El médico no puede realizar la práctica o no está disponible durante todo el turno'
        );
    const equipoId =
        datos.id_equipo == null || datos.id_equipo === ''
            ? null
            : v.entero(datos.id_equipo, 'El equipo');
    if (equipoId) {
        const [e] = await conexion.execute('SELECT id_equipo FROM equipo WHERE id_equipo=?', [
            equipoId
        ]);
        if (!e.length) v.fallo(404, 'El equipo no existe');
    }
    const [equipos] = await conexion.execute(
        `SELECT e.id_equipo FROM equipo e JOIN practica_equipo pe ON pe.id_equipo=e.id_equipo
        WHERE pe.id_practica=? AND e.id_servicio=? ORDER BY e.id_equipo`,
        [practicaId, practica.id_servicio]
    );
    const compatibles = equipos.filter((e) => !equipoId || equipoId === e.id_equipo);
    if (!compatibles.length)
        v.fallo(400, 'El equipo no es compatible con la práctica y su servicio');
    for (const medico of candidatos) {
        await conexion.execute(
            'SELECT matricula_medico FROM medico WHERE matricula_medico=? FOR UPDATE',
            [medico.matricula_medico]
        );
        for (const equipo of compatibles) {
            await conexion.execute('SELECT id_equipo FROM equipo WHERE id_equipo=? FOR UPDATE', [
                equipo.id_equipo
            ]);
            // Lectura actual, no una instantánea anterior al bloqueo del recurso.
            const [conflictos] = await conexion.execute(
                `SELECT t.id_turno FROM turno t JOIN practica p ON p.id_practica=t.id_practica
                WHERE t.fecha_turno=? AND t.id_turno<>? AND COALESCE(t.estado_turno,'Reservado')<>'Cancelado'
                AND TIME_TO_SEC(t.hora_turno)<? AND TIME_TO_SEC(t.hora_turno)+p.duracion*60>?
                AND (t.dni_paciente=? OR t.id_equipo=? OR EXISTS
                    (SELECT 1 FROM registra r WHERE r.id_turno=t.id_turno AND r.matricula_medico=?)) FOR UPDATE`,
                [
                    fecha,
                    excluir,
                    horario.fin,
                    horario.inicio,
                    dni,
                    equipo.id_equipo,
                    medico.matricula_medico
                ]
            );
            if (!conflictos.length)
                return {
                    fecha,
                    hora,
                    dni,
                    practicaId,
                    equipo: equipo.id_equipo,
                    medico: medico.matricula_medico,
                    disponibilidad: medico.id_disponibilidad
                };
        }
    }
    v.fallo(409, 'El paciente, el médico o el equipo tienen otro turno superpuesto');
}

async function confirmarDatos(conexion, datos, fecha, hora) {
    const medio = v.medio(datos.medio_confirmacion, true);
    if (datos.fecha_confirmacion != null) {
        const partes =
            typeof datos.fecha_confirmacion === 'string' &&
            datos.fecha_confirmacion.match(
                /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)?$/
            );
        if (!partes) v.fallo(400, 'La fecha de confirmación no es válida');
        v.fecha(partes[1], 'La fecha de confirmación');
        if (partes[2]) v.hora(partes[2]);
    }
    const fechaConfirmacion =
        datos.fecha_confirmacion == null ? new Date() : new Date(datos.fecha_confirmacion);
    if (
        Number.isNaN(fechaConfirmacion.getTime()) ||
        fechaConfirmacion.getTime() > Date.now() + 1000 ||
        fechaConfirmacion >= new Date(`${fecha}T${hora}`)
    )
        v.fallo(400, 'La fecha de confirmación no es válida o no es anterior al turno');
    const medico =
        datos.medico_confirmacion == null || datos.medico_confirmacion === ''
            ? null
            : v.entero(datos.medico_confirmacion, 'El médico de confirmación');
    if (medico) {
        const [filas] = await conexion.execute(
            'SELECT matricula_medico FROM medico WHERE matricula_medico=?',
            [medico]
        );
        if (!filas.length) v.fallo(404, 'El médico de confirmación no existe');
    }
    return { medio, fecha: fechaConfirmacion, medico };
}

async function crear(datos, usuario) {
    return transaccion(async (conexion) => {
        const estado = datos.estado_turno ?? 'Reservado';
        if (!['Reservado', 'Confirmado', 'Cancelado'].includes(estado))
            v.fallo(400, 'El estado debe ser Reservado, Confirmado o Cancelado');
        const medio = v.medio(datos.medio_solicitado);
        const r = await preparar(conexion, datos, usuario);
        const c = await confirmarDatos(conexion, datos, r.fecha, r.hora);
        const [resultado] = await conexion.execute(
            `INSERT INTO turno
            (fecha_turno,hora_turno,medio_solicitado,estado_turno,fecha_confirmacion,medico_confirmacion,dni_paciente,id_practica,id_equipo,id_disponibilidad,medio_confirmacion)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
                r.fecha,
                r.hora,
                medio,
                estado,
                estado === 'Confirmado' ? c.fecha : null,
                estado === 'Confirmado' ? c.medico : null,
                r.dni,
                r.practicaId,
                r.equipo,
                r.disponibilidad,
                estado === 'Confirmado' ? c.medio : null
            ]
        );
        await conexion.execute(
            'INSERT INTO registra (matricula_medico,id_turno,id_disponibilidad) VALUES (?,?,?)',
            [r.medico, resultado.insertId, r.disponibilidad]
        );
        return resultado.insertId;
    });
}

async function actualizar(id, datos, usuario) {
    return transaccion(async (conexion) => {
        const turno = await acceso(conexion, id, usuario);
        if (!['Reservado', 'Confirmado'].includes(turno.estado_turno))
            v.fallo(400, 'Solo se pueden modificar turnos reservados o confirmados');
        const [asignados] = await conexion.execute(
            'SELECT matricula_medico FROM registra WHERE id_turno=? ORDER BY matricula_medico LIMIT 1',
            [turno.id_turno]
        );
        const r = await preparar(
            conexion,
            {
                ...turno,
                ...datos,
                dni_paciente: turno.dni_paciente,
                id_practica: turno.id_practica,
                matricula_medico: datos.matricula_medico ?? asignados[0]?.matricula_medico,
                id_disponibilidad: datos.id_disponibilidad ?? null
            },
            usuario,
            turno.id_turno
        );
        await conexion.execute(
            `UPDATE turno SET fecha_turno=?,hora_turno=?,estado_turno='Reservado',fecha_confirmacion=NULL,
            medico_confirmacion=NULL,medio_confirmacion=NULL,id_equipo=?,id_disponibilidad=? WHERE id_turno=?`,
            [r.fecha, r.hora, r.equipo, r.disponibilidad, turno.id_turno]
        );
        await conexion.execute('DELETE FROM registra WHERE id_turno=?', [turno.id_turno]);
        await conexion.execute(
            'INSERT INTO registra (matricula_medico,id_turno,id_disponibilidad) VALUES (?,?,?)',
            [r.medico, turno.id_turno, r.disponibilidad]
        );
        return turno.id_turno;
    });
}

async function cambiarEstado(id, estado, datos, usuario) {
    return transaccion(async (conexion) => {
        const turno = await acceso(conexion, id, usuario);
        if (turno.estado_turno === 'Cancelado') v.fallo(400, 'El turno ya está cancelado');
        if (estado === 'Confirmado' && turno.estado_turno !== 'Reservado')
            v.fallo(400, 'Solo se puede confirmar un turno reservado');
        const d = turno.fecha_turno;
        const fecha =
            d instanceof Date
                ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                : String(d).slice(0, 10);
        if (new Date(`${fecha}T${turno.hora_turno}`) <= new Date())
            v.fallo(400, 'El turno ya comenzó');
        const c =
            estado === 'Confirmado'
                ? await confirmarDatos(conexion, datos, fecha, turno.hora_turno)
                : null;
        await conexion.execute(
            'UPDATE turno SET estado_turno=?,fecha_confirmacion=?,medico_confirmacion=?,medio_confirmacion=? WHERE id_turno=?',
            [estado, c?.fecha ?? null, c?.medico ?? null, c?.medio ?? null, turno.id_turno]
        );
        return turno.id_turno;
    });
}

async function eliminar(id, usuario) {
    return transaccion(async (conexion) => {
        const turno = await acceso(conexion, id, usuario);
        await conexion.execute('DELETE FROM registra WHERE id_turno=?', [turno.id_turno]);
        await conexion.execute('DELETE FROM turno WHERE id_turno=?', [turno.id_turno]);
        return turno.id_turno;
    });
}
module.exports = { obtenerTodos, obtenerPorId, crear, actualizar, cambiarEstado, eliminar };
