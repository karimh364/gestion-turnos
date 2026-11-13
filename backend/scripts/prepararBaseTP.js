const db = require('../config/database');

async function prepararBaseTP() {
    const [[columna]] = await db.query(
        "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='turno' AND COLUMN_NAME='medio_confirmacion'"
    );
    if (!columna.n)
        await db.query('ALTER TABLE turno ADD COLUMN medio_confirmacion VARCHAR(50) NULL');
    const reglas = [
        [
            'medico',
            'uk_medico_servicio_tp',
            'ALTER TABLE medico ADD CONSTRAINT uk_medico_servicio_tp UNIQUE (matricula_medico,id_servicio)'
        ],
        [
            'medico',
            'chk_supervisor_distinto_tp',
            'ALTER TABLE medico ADD CONSTRAINT chk_supervisor_distinto_tp CHECK (matricula_supervisor IS NULL OR matricula_supervisor <> matricula_medico)'
        ],
        [
            'medico',
            'fk_supervisor_servicio_tp',
            'ALTER TABLE medico ADD CONSTRAINT fk_supervisor_servicio_tp FOREIGN KEY (matricula_supervisor,id_servicio) REFERENCES medico (matricula_medico,id_servicio)'
        ],
        [
            'registra',
            'uk_registra_turno_tp',
            'ALTER TABLE registra ADD CONSTRAINT uk_registra_turno_tp UNIQUE (id_turno)'
        ]
    ];
    for (const [tabla, nombre, sql] of reglas) {
        const [[r]] = await db.execute(
            'SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?',
            [tabla, nombre]
        );
        if (!r.n) await db.query(sql);
    }
}

if (require.main === module)
    prepararBaseTP()
        .then(() =>
            console.log(
                'Base preparada: medio de confirmación y reglas de supervisión del Trabajo Práctico.'
            )
        )
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        })
        .finally(() => db.end());
module.exports = prepararBaseTP;
