const express = require('express');
const path = require('node:path');
require('dotenv').config();
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api/turnos', require('./routes/turnoRoutes'));
console.log('Rutas de turnos cargadas correctamente');
app.use('/api/auth', require('./routes/authRoutes'));
console.log('Rutas de autenticación cargadas correctamente');
const catalogo = require('./controllers/catalogoController');
const verificarToken = require('./middlewares/authMiddleware');
app.get('/api/catalogos', verificarToken, catalogo.catalogos);
app.put(
    '/api/pacientes/:dni',
    verificarToken,
    require('./middlewares/autorizarRol')(1, 3),
    catalogo.actualizarPaciente
);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(require('./middlewares/errorHandler'));
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Servidor funcionando en http://localhost:${PORT}`));
}
module.exports = app;
