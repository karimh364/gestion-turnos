const porId = (id) => document.getElementById(id);
let usuario,
    catalogos,
    turnos = [],
    editando = null,
    accionPendiente = null;
const roles = { 1: 'Administrador', 2: 'Médico', 3: 'Paciente' };
const fechaSimple = (valor) => String(valor || '').slice(0, 10);
const fechaVisible = (valor) => fechaSimple(valor).split('-').reverse().join('/');
function hoyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mensaje(id, texto, error = false) {
    porId(id).textContent = texto;
    porId(id).classList.toggle('error', error);
}
function falloPanel(error, id = 'mensajeTurnos') {
    if (error.status === 401) {
        sessionStorage.removeItem('token');
        location.href = '../index.html';
        return;
    }
    mensaje(id, error.message, true);
}
function opciones(id, filas, valor, etiqueta, inicial) {
    const select = porId(id);
    select.replaceChildren();
    for (const fila of filas) select.add(new Option(etiqueta(fila), String(valor(fila))));
    if (inicial != null) select.value = String(inicial);
}
function mostrarSeccion(nombre) {
    for (const [seccion, enlace] of [
        ['inicio', 'enlaceInicio'],
        ['turnos', 'enlaceTurnos'],
        ['datos', 'enlaceDatos']
    ]) {
        porId(seccion).hidden = seccion !== nombre;
        porId(enlace).classList.toggle('activo', seccion === nombre);
        if (seccion === nombre) porId(enlace).setAttribute('aria-current', 'page');
        else porId(enlace).removeAttribute('aria-current');
    }
}
function horarioMedico() {
    const ids = catalogos.medico_disponibilidad
        .filter((d) => d.matricula_medico === Number(porId('turnoMedico').value))
        .map((d) => d.id_disponibilidad);
    const franjas = catalogos.disponibilidad.filter((d) => ids.includes(d.id_disponibilidad));
    porId('horariosMedico').textContent = franjas.length
        ? 'Disponibilidad: ' +
          franjas
              .map((d) => `${d.dia} ${d.hora_desde.slice(0, 5)}–${d.hora_hasta.slice(0, 5)}`)
              .join(' · ')
        : 'No hay disponibilidad registrada para este médico.';
}
function recursos(medico, equipo) {
    const practica = catalogos.practica.find(
        (p) => p.id_practica === Number(porId('turnoPractica').value)
    );
    const medicos = catalogos.medico.filter(
        (m) =>
            m.id_servicio === practica?.id_servicio &&
            catalogos.practica_medico.some(
                (r) =>
                    r.matricula_medico === m.matricula_medico &&
                    r.id_practica === practica?.id_practica
            )
    );
    const equipos = catalogos.equipo.filter(
        (e) =>
            e.id_servicio === practica?.id_servicio &&
            catalogos.practica_equipo.some(
                (r) => r.id_equipo === e.id_equipo && r.id_practica === practica?.id_practica
            )
    );
    opciones(
        'turnoMedico',
        medicos,
        (m) => m.matricula_medico,
        (m) => `${m.apellido_medico}, ${m.nombre_medico}`,
        medico
    );
    opciones(
        'turnoEquipo',
        equipos,
        (e) => e.id_equipo,
        (e) => e.nombre_equipo,
        equipo
    );
    horarioMedico();
    porId('guardarTurno').disabled = !medicos.length || !equipos.length;
    if (!equipos.length)
        mensaje('mensajeTurnos', 'Esta práctica no tiene equipos compatibles registrados.', true);
}
function abrirFormulario(turno) {
    editando = turno?.id_turno || null;
    porId('formTurno').reset();
    porId('formTurno').hidden = false;
    porId('confirmacionAccion').hidden = true;
    porId('tituloFormulario').textContent = editando ? 'Reprogramar turno' : 'Reservar turno';
    porId('guardarTurno').textContent = editando ? 'Guardar reprogramación' : 'Reservar turno';
    porId('turnoPaciente').disabled = !!editando || usuario.id_rol === 3;
    porId('turnoPractica').disabled = !!editando;
    porId('turnoMedio').disabled = !!editando;
    if (turno) {
        porId('turnoPaciente').value = turno.dni_paciente;
        porId('turnoPractica').value = turno.id_practica;
        porId('turnoFecha').value = fechaSimple(turno.fecha_turno);
        porId('turnoHora').value = turno.hora_turno.slice(0, 5);
        porId('turnoMedio').value = turno.medio_solicitado || 'Web';
    } else if (usuario.id_rol === 3) porId('turnoPaciente').value = usuario.dni_paciente;
    mensaje('mensajeTurnos', '');
    recursos(turno?.matricula_medico, turno?.id_equipo);
    porId('formTurno').scrollIntoView({ block: 'nearest' });
}
function botonAccion(fila, id, accion, texto) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = texto;
    boton.dataset.id = id;
    boton.dataset.accion = accion;
    fila.appendChild(boton);
}
async function cargarTurnos() {
    turnos = await obtenerTurnos();
    porId('cuerpoTurnos').replaceChildren();
    for (const t of turnos) {
        const fila = document.createElement('tr');
        for (const valor of [
            t.id_turno,
            fechaVisible(t.fecha_turno),
            t.hora_turno.slice(0, 5),
            t.paciente,
            t.nombre_practica,
            t.medico || 'Sin asignar',
            t.nombre_equipo || 'Sin asignar',
            t.estado_turno || 'Sin estado'
        ]) {
            const td = document.createElement('td');
            td.textContent = valor;
            fila.appendChild(td);
        }
        const acciones = document.createElement('td');
        acciones.className = 'acciones';
        const futura = new Date(`${fechaSimple(t.fecha_turno)}T${t.hora_turno}`) > new Date();
        if (
            futura &&
            ['Reservado', 'Confirmado'].includes(t.estado_turno) &&
            usuario.id_rol !== 2
        ) {
            botonAccion(acciones, t.id_turno, 'editar', 'Reprogramar');
            botonAccion(acciones, t.id_turno, 'cancelar', 'Cancelar');
        }
        if (futura && t.estado_turno === 'Reservado')
            botonAccion(acciones, t.id_turno, 'confirmar', 'Confirmar');
        if (usuario.id_rol === 1) botonAccion(acciones, t.id_turno, 'eliminar', 'Eliminar');
        fila.appendChild(acciones);
        porId('cuerpoTurnos').appendChild(fila);
    }
    porId('tablaTurnos').hidden = !turnos.length;
    mensaje(
        'mensajeTurnos',
        turnos.length ? `Turnos encontrados: ${turnos.length}.` : 'No hay turnos registrados.'
    );
}
function perfil() {
    const p = catalogos.paciente.find(
        (p) => p.dni_paciente === Number(porId('perfilPaciente').value)
    );
    if (!p) {
        porId('formPaciente').hidden = true;
        return;
    }
    for (const [id, campo] of [
        ['perfilNombre', 'nombre_paciente'],
        ['perfilApellido', 'apellido_paciente'],
        ['perfilTelefono', 'tel_paciente'],
        ['perfilEmail', 'email_paciente'],
        ['perfilAfiliado', 'nro_afiliado_paciente']
    ])
        porId(id).value = p[campo] ?? '';
    porId('perfilNacimiento').value = fechaSimple(p.fec_nac_paciente);
    porId('perfilObra').value = p.id_os ?? '';
    porId('perfilAfiliado').disabled = !porId('perfilObra').value;
}
async function iniciarPanel() {
    if (!sessionStorage.getItem('token')) {
        location.href = '../index.html';
        return;
    }
    try {
        usuario = await obtenerSesion();
        catalogos = await obtenerCatalogos();
        porId('datosUsuario').textContent = `${usuario.email} · ${roles[usuario.id_rol]}`;
        porId('nuevoTurno').hidden = usuario.id_rol === 2;
        porId('nuevoTurno').disabled = false;
        porId('enlaceDatos').hidden = usuario.id_rol === 2;
        opciones(
            'turnoPaciente',
            catalogos.paciente,
            (p) => p.dni_paciente,
            (p) => `${p.apellido_paciente}, ${p.nombre_paciente} · DNI ${p.dni_paciente}`
        );
        opciones(
            'perfilPaciente',
            catalogos.paciente,
            (p) => p.dni_paciente,
            (p) => `${p.apellido_paciente}, ${p.nombre_paciente} · DNI ${p.dni_paciente}`
        );
        opciones(
            'turnoPractica',
            catalogos.practica,
            (p) => p.id_practica,
            (p) => `${p.nombre_practica} (${p.duracion} min)`
        );
        opciones(
            'perfilObra',
            [{ id_os: '', nombre_os: 'Sin obra social' }, ...catalogos.obra_social],
            (o) => o.id_os,
            (o) => o.nombre_os
        );
        porId('turnoFecha').min = hoyLocal();
        porId('perfilNacimiento').max = hoyLocal();
        perfil();
        await cargarTurnos();
        mostrarSeccion('inicio');
    } catch (error) {
        falloPanel(error, 'mensajePanel');
    }
}
porId('enlaceInicio').addEventListener('click', (event) => {
    event.preventDefault();
    mostrarSeccion('inicio');
});
porId('enlaceTurnos').addEventListener('click', async (event) => {
    event.preventDefault();
    mostrarSeccion('turnos');
    try {
        await cargarTurnos();
    } catch (error) {
        falloPanel(error);
    }
});
porId('enlaceDatos').addEventListener('click', (event) => {
    event.preventDefault();
    mostrarSeccion('datos');
});
porId('cerrarSesion').addEventListener('click', () => {
    sessionStorage.removeItem('token');
    location.href = '../index.html';
});
porId('nuevoTurno').addEventListener('click', () => abrirFormulario());
porId('descartarTurno').addEventListener('click', () => (porId('formTurno').hidden = true));
porId('turnoPractica').addEventListener('change', () => {
    mensaje('mensajeTurnos', '');
    recursos();
});
porId('turnoMedico').addEventListener('change', horarioMedico);
porId('formTurno').addEventListener('submit', async (event) => {
    event.preventDefault();
    const boton = porId('guardarTurno');
    boton.disabled = true;
    try {
        const datos = {
            fecha_turno: porId('turnoFecha').value,
            hora_turno: porId('turnoHora').value,
            matricula_medico: Number(porId('turnoMedico').value),
            id_equipo: Number(porId('turnoEquipo').value)
        };
        let resultado;
        if (editando) resultado = await actualizarTurno(editando, datos);
        else
            resultado = await crearTurno({
                ...datos,
                dni_paciente: Number(porId('turnoPaciente').value),
                id_practica: Number(porId('turnoPractica').value),
                medio_solicitado: porId('turnoMedio').value
            });
        porId('formTurno').hidden = true;
        await cargarTurnos();
        mensaje('mensajeTurnos', resultado.mensaje);
    } catch (error) {
        falloPanel(error);
    } finally {
        boton.disabled = false;
    }
});
porId('cuerpoTurnos').addEventListener('click', (event) => {
    const boton = event.target.closest('button[data-accion]');
    if (!boton) return;
    const turno = turnos.find((t) => t.id_turno === Number(boton.dataset.id));
    if (boton.dataset.accion === 'editar') {
        abrirFormulario(turno);
        return;
    }
    accionPendiente = { id: turno.id_turno, accion: boton.dataset.accion };
    porId('formTurno').hidden = true;
    porId('confirmacionAccion').hidden = false;
    porId('textoAccion').textContent =
        `¿Querés ${boton.dataset.accion} el turno ${turno.id_turno}?`;
    porId('campoMedioConfirmacion').hidden = boton.dataset.accion !== 'confirmar';
    porId('aceptarAccion').textContent = boton.textContent;
    porId('confirmacionAccion').scrollIntoView({ block: 'nearest' });
});
porId('descartarAccion').addEventListener('click', () => {
    accionPendiente = null;
    porId('confirmacionAccion').hidden = true;
});
porId('aceptarAccion').addEventListener('click', async () => {
    if (!accionPendiente) return;
    const boton = porId('aceptarAccion');
    boton.disabled = true;
    try {
        const { id, accion } = accionPendiente;
        const resultado =
            accion === 'cancelar'
                ? await cancelarTurno(id)
                : accion === 'eliminar'
                  ? await eliminarTurno(id)
                  : await confirmarTurno(id, {
                        medio_confirmacion: porId('medioConfirmacion').value,
                        ...(usuario.id_rol === 2
                            ? { medico_confirmacion: usuario.matricula_medico }
                            : {})
                    });
        porId('confirmacionAccion').hidden = true;
        accionPendiente = null;
        await cargarTurnos();
        mensaje('mensajeTurnos', resultado.mensaje);
    } catch (error) {
        falloPanel(error);
    } finally {
        boton.disabled = false;
    }
});
porId('perfilPaciente').addEventListener('change', perfil);
porId('perfilObra').addEventListener('change', () => {
    porId('perfilAfiliado').disabled = !porId('perfilObra').value;
    if (!porId('perfilObra').value) porId('perfilAfiliado').value = '';
});
porId('formPaciente').addEventListener('submit', async (event) => {
    event.preventDefault();
    const boton = event.currentTarget.querySelector('button');
    boton.disabled = true;
    try {
        const datos = {
            nombre_paciente: porId('perfilNombre').value,
            apellido_paciente: porId('perfilApellido').value,
            fec_nac_paciente: porId('perfilNacimiento').value,
            tel_paciente: porId('perfilTelefono').value,
            email_paciente: porId('perfilEmail').value,
            id_os: porId('perfilObra').value || null,
            nro_afiliado_paciente: porId('perfilAfiliado').value || null
        };
        const resultado = await actualizarPaciente(porId('perfilPaciente').value, datos);
        mensaje('mensajePaciente', resultado.mensaje);
        Object.assign(
            catalogos.paciente.find(
                (p) => p.dni_paciente === Number(porId('perfilPaciente').value)
            ),
            datos
        );
    } catch (error) {
        falloPanel(error, 'mensajePaciente');
    } finally {
        boton.disabled = false;
    }
});
iniciarPanel();
