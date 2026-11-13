USE gestion_turnos;
-- La asignación de médico utiliza la tabla registra existente.
ALTER TABLE turno ADD COLUMN IF NOT EXISTS medio_confirmacion VARCHAR(50) NULL;
-- npm run preparar-db aplica además, de forma idempotente, las restricciones
-- de supervisión y un único médico asignado por turno.
