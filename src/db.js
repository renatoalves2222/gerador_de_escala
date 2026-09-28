const { Pool, types } = require("pg");

// DATE (oid 1082) vem do Postgres como 'YYYY-MM-DD' puro, sem virar objeto Date —
// evita bugs de fuso horário e concatenação de string em toda a aplicação.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS gestores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text UNIQUE NOT NULL,
  senha_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  setores text[] NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapa text UNIQUE,
  nome text NOT NULL,
  setor text NOT NULL,
  cargo text NOT NULL,
  regime text NOT NULL,
  horario_texto text,
  grupo text,
  ciclo_inicio date,
  situacao text NOT NULL DEFAULT 'A',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setor text NOT NULL,
  inicio date NOT NULL,
  fim date NOT NULL,
  responsavel text NOT NULL,
  criado_por uuid REFERENCES gestores(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_id uuid REFERENCES escalas(id) ON DELETE CASCADE,
  colaborador_id uuid REFERENCES colaboradores(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alocacao_id uuid REFERENCES alocacoes(id) ON DELETE CASCADE,
  dia date NOT NULL,
  codigo text NOT NULL,
  UNIQUE (alocacao_id, dia)
);
`;

async function initSchema() {
  await pool.query(SCHEMA);
  // 12x36: grupo_ref = dia 21 da escala em que o "par/ímpar" foi definido.
  await pool.query("ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS grupo_ref date");
  // Migração única: quem já tinha grupo sem referência passa a usar a escala
  // mais recente em que foi alocado (a que o gestor conferiu); sem escala,
  // usa o ciclo vigente. Assim a última escala gerada continua igual.
  const hoje = new Date();
  const ciclo = hoje.getDate() >= 21
    ? new Date(hoje.getFullYear(), hoje.getMonth(), 21)
    : new Date(hoje.getFullYear(), hoje.getMonth() - 1, 21);
  const cicloISO = `${ciclo.getFullYear()}-${String(ciclo.getMonth() + 1).padStart(2, "0")}-21`;
  await pool.query(
    `UPDATE colaboradores c SET grupo_ref = COALESCE(
        (SELECT max(e.inicio) FROM alocacoes a JOIN escalas e ON e.id = a.escala_id WHERE a.colaborador_id = c.id),
        $1::date)
     WHERE c.grupo IS NOT NULL AND c.grupo_ref IS NULL`,
    [cicloISO]
  );
}

module.exports = { pool, initSchema };
