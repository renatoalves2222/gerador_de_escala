const { Pool } = require("pg");

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
}

module.exports = { pool, initSchema };
