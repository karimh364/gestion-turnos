# Gestión de turnos médicos

Proyecto de Programación 3 de Karim Homsi, desarrollado sobre el Sistema de Gestión de Turnos Médicos de la cursada con Node.js, Express, MySQL y HTML/CSS/JavaScript.

Para el segundo parcial se presentan dos validaciones incorporadas respecto del código anterior (superposición de médico y de paciente), el manejo de perfiles y sesiones, y la cancelación de turnos como mejora funcional. No se inicia un proyecto nuevo.

## Instalar en otra PC

Requiere Node.js con npm, MySQL/MariaDB y Git. Las instrucciones siguientes usan MySQL de XAMPP en Windows. Desde la carpeta del repositorio:

```powershell
npm --version
cd backend
npm ci
Copy-Item .env.example .env
```

Editar el `.env` local y completar DB_USER, DB_PASSWORD si corresponde, una clave JWT_SECRET propia y ADMIN_EMAIL/ADMIN_PASSWORD elegidos para el administrador inicial. Mantener DB_NAME=gestion_turnos y FRONTEND_URL=http://localhost:3000. La contraseña del administrador debe tener al menos 8 caracteres y un máximo de 72 bytes.

En una instalación nueva, crear una base vacía e importar los SQL en este orden. Los comandos usan el usuario local habitual de XAMPP; ajustar el usuario y la autenticación si la instalación es diferente:

```powershell
& 'C:\xampp\mysql\bin\mysql.exe' -u root -e "CREATE DATABASE gestion_turnos CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
Get-Content -Raw -Encoding UTF8 ..\database\turnos.sql | & 'C:\xampp\mysql\bin\mysql.exe' --default-character-set=utf8mb4 -u root gestion_turnos
Get-Content -Raw -Encoding UTF8 ..\database\registro_recuperacion.sql | & 'C:\xampp\mysql\bin\mysql.exe' --default-character-set=utf8mb4 -u root gestion_turnos
npm run preparar-db
node .\scripts\crearUsuarioPrueba.js
npm start
```

Abrir `http://localhost:3000` e ingresar con las credenciales configuradas localmente. El SQL de ejemplo no distribuye cuentas ni hashes de contraseñas; el script crea el administrador con el correo verificado. Las demás cuentas se registran desde la interfaz.

El SQL original contiene instrucciones que recrean tablas: importar solamente en una base nueva. `registro_recuperacion.sql` se aplica una sola vez, después de `turnos.sql`. `preparar-db` comprueba qué ampliaciones faltan antes de agregarlas.

## Continuar en esta PC

La base y las ampliaciones ya están preparadas. Desde `backend`, ejecutar `npm start`. Si había un servidor abierto antes de los cambios, detenerlo con Ctrl+C y volver a iniciarlo. Abrir `http://localhost:3000` y actualizar con Ctrl+F5.

## Archivos privados

`.env`, `node_modules`, respaldos y resultados generados de pruebas quedan excluidos por `.gitignore`. La plantilla `.env.example` se publica con los secretos vacíos. No incluir contraseñas, tokens ni claves privadas en commits, capturas o documentos. Los scripts leen las credenciales del administrador desde `.env`; no las imprimen. Las cuentas temporales de las pruebas utilizan contraseñas generadas al ejecutarse.

## Circuitos disponibles

- Inicio: login, registro de paciente o médico existente y solicitud de recuperación.
- Correo: verificación y recuperación mediante enlaces temporales de 30 minutos y un solo uso. Se guarda el hash SHA-256 del token.
- Turnos: consulta, reserva, reprogramación, confirmación y cancelación. El DELETE del CRUD anterior se conserva para el administrador, separado de cancelar.
- Paciente: consulta de sus turnos y edición de datos personales/de contacto. El administrador puede completar los datos de los pacientes, como describe recepción en el enunciado.
- La agenda se limita a la cuenta: administrador gestiona, paciente opera sus turnos y médico consulta su agenda y registra confirmaciones. Es un único panel; el backend controla el alcance de cada petición.

## Reglas de turnos

- Fecha y hora válidas y futuras. Se valida el intervalo completo usando la duración de la práctica.
- Centro abierto lunes a viernes 08:00–20:00, sábado 08:00–14:00 y domingo cerrado.
- Médico compatible con la práctica y su servicio, disponible durante todo el intervalo; equipo compatible con la práctica y su servicio.
- Sin superposiciones para paciente, médico ni equipo. Se permiten intervalos contiguos. Los bloqueos transaccionales evitan reservar el mismo recurso de forma concurrente.
- La asignación usa `registra`; una restricción permite un solo médico por turno. No se deducen ni sobrescriben asignaciones históricas incompletas.
- Cancelar conserva el turno, cambia su estado y libera el horario. Reprogramar admite Reservado/Confirmado, conserva el ID y vuelve a Reservado, eliminando los datos de confirmación.
- Confirmar un reservado registra fecha anterior al turno y medio Teléfono/Email. `medico_confirmacion` conserva su significado y referencia; el nuevo campo `medio_confirmacion` registra el medio sin reutilizar aquella columna.
- Se validan referencias, campos, tipos, rangos y formatos. Los errores se muestran en pantalla y devuelven respuestas HTTP apropiadas.
- Las restricciones de supervisión impiden supervisarse a sí mismo y relacionar supervisor/supervisado de distintos servicios.

## Criterios para puntos abiertos del apunte

- En nuevas reservas, estado ausente/null se interpreta como Reservado y medio ausente/null como Web. Los estados válidos son Reservado, Confirmado y Cancelado.
- Se mantienen Teléfono, Email, Web y WhatsApp como medios solicitados: el JSON del apunte usa Web y la base original ya contiene Web y WhatsApp. No se implementan integraciones de mensajería.
- La API anterior que enviaba solo fecha, hora, paciente y práctica sigue siendo válida: se asignan recursos compatibles disponibles si no se especifican. El formulario permite elegirlos explícitamente.
- Los datos de ejemplo tienen relaciones de práctica/equipo entre servicios diferentes. No se inventan equipos ni se modifican esas relaciones: las reservas incompatibles se rechazan y se informa al usuario. Algunas prácticas necesitan que se corrija su catálogo con datos reales antes de poder reservarlas.
- Se conservan los turnos históricos y las cuentas existentes. Los respaldos anteriores a los cambios están fuera del proyecto, en `.respaldo-gestion-turnos` de la carpeta de trabajo, excluidos de Git.

## Pruebas

```powershell
npm test
```

El comando usa Node.js, MySQL y un servidor SMTP local de captura; no requiere nuevas dependencias del proyecto. Crea una base `gestion_turnos_prueba_tp_<marca>` copiando la base actual, realiza el circuito real por HTTP y elimina exclusivamente esa copia. Requiere permisos locales para crear bases y XAMPP en `C:/xampp`.

Se comprueban altas, verificación, recuperación, login, permisos, datos personales, CRUD, estados, disponibilidad, compatibilidad, intervalos, solicitudes concurrentes, errores y rollback ante fallo SMTP. También se comprueba que el volcado de la base original se conserve durante la prueba.

Los informes locales son `backend/tests/resultado-circuito.json`, `resultado-navegador.json` y `resultado-conservacion.json`; son resultados generados y no se versionan. La comprobación adicional de navegador se realizó con Edge en un perfil temporal, incluyendo el circuito desde los formularios y las vistas de escritorio y móvil; ese navegador de pruebas no es una dependencia de la aplicación. `npm test` ejecuta las pruebas HTTP y de base de datos. Si se configuraron ADMIN_EMAIL/ADMIN_PASSWORD, también comprueba el ingreso del administrador local.

Por defecto el correo usa Ethereal, igual que el apunte, y muestra la vista previa en la terminal. La prueba SMTP original sigue disponible con `node scripts/probarCorreo.js`. Las variables SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS permiten usar un transporte configurado; las pruebas solo las fijan dentro de su propio proceso.
