const db = require('./config/database');

async function probarTurnos() {
    try {
        const [turnos] = await db.query(`
            SELECT *
            FROM turno
            LIMIT 10
        `);

        console.table(turnos);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

probarTurnos();
