const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { pool, initSchema } = require("./db");
const { parsePlanilha } = require("./importer");
const { REGIMES, precisaConfiguracao, codigoDoDia } = require("./regimes");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// rede de segurança: um erro dentro de uma rota async não deve mais derrubar
// o processo inteiro (foi isso que causou os 502 em cascata).
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const JWT_SECRET = process.env.JWT_SECRET || "troque-este-segredo-em-producao";
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------- auth
function assinar(gestor) {
  return jwt.sign(
    { id: gestor.id, nome: gestor.nome, is_admin: gestor.is_admin, setores: gestor.setores },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}
function autenticar(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erro: "Não autenticado." });
  try {
    req.gestor = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: "Sessão inválida ou expirada." });
  }
}
function podeEditarSetor(gestor, setor) {
  return gestor.is_admin || gestor.setores.includes(setor);
}
function exigirAdmin(req, res, next) {
  if (!req.gestor.is_admin) return res.status(403).json({ erro: "Somente administradores." });
  next();
}

app.post("/api/auth/login", ah(async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ erro: "Informe email e senha." });
  const { rows } = await pool.query("SELECT * FROM gestores WHERE email = $1", [String(email).toLowerCase()]);
  const gestor = rows[0];
  if (!gestor || !(await bcrypt.compare(senha, gestor.senha_hash))) {
    return res.status(401).json({ erro: "Email ou senha incorretos." });
  }
  res.json({ token: assinar(gestor), gestor: { id: gestor.id, nome: gestor.nome, is_admin: gestor.is_admin, setores: gestor.setores } });
}));

app.get("/api/me", autenticar, (req, res) => res.json(req.gestor));

// ------------------------------------------------------------ gestores
app.get("/api/gestores", autenticar, exigirAdmin, ah(async (req, res) => {
  const { rows } = await pool.query("SELECT id, nome, email, is_admin, setores, criado_em FROM gestores ORDER BY nome");
  res.json(rows);
}));

app.post("/api/gestores", autenticar, exigirAdmin, ah(async (req, res) => {
  const { nome, email, senha, setores, is_admin } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: "Nome, email e senha são obrigatórios." });
  const senha_hash = await bcrypt.hash(senha, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO gestores (nome, email, senha_hash, is_admin, setores)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, nome, email, is_admin, setores`,
      [nome.toUpperCase(), String(email).toLowerCase(), senha_hash, !!is_admin, setores || []]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ erro: "Já existe um gestor com esse email." });
    throw e;
  }
}));

app.patch("/api/gestores/:id/setores", autenticar, exigirAdmin, ah(async (req, res) => {
  const { setores } = req.body || {};
  const { rows } = await pool.query(
    "UPDATE gestores SET setores = $1 WHERE id = $2 RETURNING id, nome, email, is_admin, setores",
    [setores || [], req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ erro: "Gestor não encontrado." });
  res.json(rows[0]);
}));

// --------------------------------------------------------- colaboradores
app.get("/api/colaboradores", autenticar, ah(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM colaboradores ORDER BY setor, cargo, nome");
  res.json(rows.map((c) => ({ ...c, precisaConfiguracao: precisaConfiguracao(c) })));
}));

app.post("/api/colaboradores", autenticar, ah(async (req, res) => {
  const { nome, setor, cargo, regime, grupo, ciclo_inicio } = req.body || {};
  if (!nome || !setor || !cargo || !regime) return res.status(400).json({ erro: "Nome, setor, cargo e regime são obrigatórios." });
  const setorU = setor.toUpperCase();
  if (!podeEditarSetor(req.gestor, setorU)) return res.status(403).json({ erro: `Você não é responsável por ${setorU}.` });
  if (!REGIMES[regime]) return res.status(400).json({ erro: "Regime inválido." });
  const { rows } = await pool.query(
    `INSERT INTO colaboradores (nome, setor, cargo, regime, grupo, ciclo_inicio, situacao)
     VALUES ($1,$2,$3,$4,$5,$6,'A') RETURNING *`,
    [nome.toUpperCase(), setorU, cargo.toUpperCase(), regime, grupo || null, ciclo_inicio || null]
  );
  res.status(201).json(rows[0]);
}));

// usado tanto para editar dados quanto para o gestor definir grupo (par/impar) / ciclo_inicio
app.patch("/api/colaboradores/:id", autenticar, ah(async (req, res) => {
  const { rows: existentes } = await pool.query("SELECT * FROM colaboradores WHERE id = $1", [req.params.id]);
  const atual = existentes[0];
  if (!atual) return res.status(404).json({ erro: "Colaborador não encontrado." });
  if (!podeEditarSetor(req.gestor, atual.setor)) return res.status(403).json({ erro: "Você não é responsável por este setor." });

  const campos = ["nome", "cargo", "grupo", "ciclo_inicio", "situacao"];
  const sets = [];
  const valores = [];
  campos.forEach((campo) => {
    if (req.body[campo] !== undefined) {
      valores.push(req.body[campo]);
      sets.push(`${campo} = $${valores.length}`);
    }
  });
  if (sets.length === 0) return res.json(atual);
  valores.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE colaboradores SET ${sets.join(", ")}, atualizado_em = now() WHERE id = $${valores.length} RETURNING *`,
    valores
  );
  res.json(rows[0]);
}));

app.delete("/api/colaboradores/:id", autenticar, ah(async (req, res) => {
  const { rows: existentes } = await pool.query("SELECT setor FROM colaboradores WHERE id = $1", [req.params.id]);
  if (!existentes[0]) return res.status(404).end();
  if (!podeEditarSetor(req.gestor, existentes[0].setor)) return res.status(403).json({ erro: "Você não é responsável por este setor." });
  const { rows: emUso } = await pool.query("SELECT 1 FROM alocacoes WHERE colaborador_id = $1 LIMIT 1", [req.params.id]);
  if (emUso[0]) return res.status(409).json({ erro: "Colaborador já alocado em uma escala — remova a alocação primeiro." });
  await pool.query("DELETE FROM colaboradores WHERE id = $1", [req.params.id]);
  res.status(204).end();
}));

// Importação em massa — mapeada às colunas reais do export de RH. Só admin importa
// (é a base mestra da unidade inteira, não de um setor só). Faz upsert por "chapa":
// reenviar o arquivo atualiza quem já existe (setor/cargo/regime/situação) sem
// apagar grupo/ciclo_inicio já configurados pelo gestor.
app.post("/api/colaboradores/importar", autenticar, exigirAdmin, upload.single("arquivo"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: "Envie o arquivo no campo 'arquivo'." });
  let parsed;
  try {
    parsed = parsePlanilha(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ erro: "Não foi possível ler o arquivo. Confirme que é o export do RH em .xlsx." });
  }

  let novos = 0, atualizados = 0, inativados = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of parsed.registros) {
      const situacaoNormalizada = r.situacao === "A" ? "A" : "inativo";
      if (r.chapa) {
        const { rows: existentes } = await client.query("SELECT id, situacao FROM colaboradores WHERE chapa = $1", [r.chapa]);
        if (existentes[0]) {
          await client.query(
            `UPDATE colaboradores SET nome=$1, setor=$2, cargo=$3, regime=$4, horario_texto=$5, situacao=$6, atualizado_em=now()
             WHERE id = $7`,
            [r.nome, r.setor, r.cargo, r.regime, r.horarioTexto, situacaoNormalizada, existentes[0].id]
          );
          if (situacaoNormalizada !== "A" && existentes[0].situacao === "A") inativados++;
          else atualizados++;
          continue;
        }
      }
      if (situacaoNormalizada !== "A") continue; // não cria registro novo já inativo
      await client.query(
        `INSERT INTO colaboradores (chapa, nome, setor, cargo, regime, horario_texto, situacao)
         VALUES ($1,$2,$3,$4,$5,$6,'A')`,
        [r.chapa, r.nome, r.setor, r.cargo, r.regime, r.horarioTexto]
      );
      novos++;
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  res.json({ novos, atualizados, inativados, problemas: parsed.problemas, totalLinhas: parsed.registros.length });
}));

app.get("/api/setores", autenticar, ah(async (req, res) => {
  const { rows } = await pool.query("SELECT DISTINCT setor FROM colaboradores ORDER BY setor");
  res.json(rows.map((r) => r.setor));
}));

// -------------------------------------------------------------- escalas
function periodosSobrepoem(aIni, aFim, bIni, bFim) {
  return !(aFim < bIni || bFim < aIni);
}

app.post("/api/escalas", autenticar, ah(async (req, res) => {
  const { setor, inicio, responsavel, excluidos } = req.body || {};
  if (!setor || !inicio || !responsavel) return res.status(400).json({ erro: "Setor, início e responsável são obrigatórios." });
  const setorU = setor.toUpperCase();
  if (!podeEditarSetor(req.gestor, setorU)) return res.status(403).json({ erro: "Você não é responsável por este setor." });

  const fim = new Date(inicio + "T00:00:00");
  fim.setDate(fim.getDate() + 30);
  const fimISO = fim.toISOString().slice(0, 10);

  const { rows: doSetor } = await pool.query("SELECT * FROM colaboradores WHERE setor = $1 AND situacao = 'A'", [setorU]);
  const excluidosSet = new Set(excluidos || []);

  const { rows: alocadosAntes } = await pool.query(
    `SELECT a.colaborador_id, e.inicio, e.fim FROM alocacoes a JOIN escalas e ON e.id = a.escala_id`
  );
  const indisponiveis = new Set(
    alocadosAntes
      .filter((a) => periodosSobrepoem(a.inicio, a.fim, inicio, fimISO))
      .map((a) => a.colaborador_id)
  );

  const incluidos = doSetor.filter((c) => !excluidosSet.has(c.id) && !indisponiveis.has(c.id) && !precisaConfiguracao(c));
  const pendentesConfiguracao = doSetor.filter((c) => !excluidosSet.has(c.id) && !indisponiveis.has(c.id) && precisaConfiguracao(c));

  if (incluidos.length === 0) {
    return res.status(400).json({ erro: "Nenhum colaborador disponível e configurado para entrar nesta escala.", pendentesConfiguracao });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: escRows } = await client.query(
      `INSERT INTO escalas (setor, inicio, fim, responsavel, criado_por) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [setorU, inicio, fimISO, responsavel.toUpperCase(), req.gestor.id]
    );
    const escala = escRows[0];
    for (const c of incluidos) {
      await client.query("INSERT INTO alocacoes (escala_id, colaborador_id) VALUES ($1,$2)", [escala.id, c.id]);
    }
    await client.query("COMMIT");
    res.status(201).json({ escala, incluidos: incluidos.length, pendentesConfiguracao });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}));

app.get("/api/escalas", autenticar, ah(async (req, res) => {
  const { setor } = req.query;
  const { rows } = await pool.query(
    setor ? "SELECT * FROM escalas WHERE setor = $1 ORDER BY inicio DESC" : "SELECT * FROM escalas ORDER BY inicio DESC",
    setor ? [setor.toUpperCase()] : []
  );
  res.json(rows);
}));

app.delete("/api/escalas/:id", autenticar, ah(async (req, res) => {
  const { rows } = await pool.query("SELECT setor FROM escalas WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ erro: "Escala não encontrada." });
  if (!podeEditarSetor(req.gestor, rows[0].setor)) return res.status(403).json({ erro: "Você não é responsável por este setor." });
  await pool.query("DELETE FROM escalas WHERE id = $1", [req.params.id]);
  res.status(204).end();
}));

// grade pronta: dias x colaboradores, já com os códigos calculados
app.get("/api/escalas/:id/grade", autenticar, ah(async (req, res) => {
  const { rows: escRows } = await pool.query("SELECT * FROM escalas WHERE id = $1", [req.params.id]);
  const escala = escRows[0];
  if (!escala) return res.status(404).json({ erro: "Escala não encontrada." });

  const { rows: alocacoes } = await pool.query(
    `SELECT a.id AS alocacao_id, c.* FROM alocacoes a JOIN colaboradores c ON c.id = a.colaborador_id WHERE a.escala_id = $1`,
    [escala.id]
  );
  const { rows: overrides } = await pool.query(
    `SELECT o.* FROM overrides o JOIN alocacoes a ON a.id = o.alocacao_id WHERE a.escala_id = $1`,
    [escala.id]
  );
  const overrideMap = {};
  overrides.forEach((o) => { overrideMap[`${o.alocacao_id}|${o.dia}`] = o.codigo; });

  const dias = [];
  const inicio = new Date(escala.inicio + "T00:00:00");
  for (let i = 0; i < 31; i++) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    dias.push(d.toISOString().slice(0, 10));
  }

  const linhas = alocacoes.map((a) => ({
    alocacaoId: a.alocacao_id,
    colaborador: { id: a.id, nome: a.nome, cargo: a.cargo, regime: a.regime, grupo: a.grupo },
    dias: dias.map((dia) => codigoDoDia(a, dia, overrideMap[`${a.alocacao_id}|${dia}`])),
  }));

  res.json({ escala, dias, linhas });
}));

app.put("/api/alocacoes/:id/override", autenticar, ah(async (req, res) => {
  const { dia, codigo } = req.body || {};
  if (!dia) return res.status(400).json({ erro: "Informe o dia (YYYY-MM-DD)." });
  const { rows: aloc } = await pool.query(
    `SELECT a.id, e.setor FROM alocacoes a JOIN escalas e ON e.id = a.escala_id WHERE a.id = $1`,
    [req.params.id]
  );
  if (!aloc[0]) return res.status(404).json({ erro: "Alocação não encontrada." });
  if (!podeEditarSetor(req.gestor, aloc[0].setor)) return res.status(403).json({ erro: "Você não é responsável por este setor." });

  if (!codigo) {
    await pool.query("DELETE FROM overrides WHERE alocacao_id = $1 AND dia = $2", [req.params.id, dia]);
    return res.status(204).end();
  }
  await pool.query(
    `INSERT INTO overrides (alocacao_id, dia, codigo) VALUES ($1,$2,$3)
     ON CONFLICT (alocacao_id, dia) DO UPDATE SET codigo = EXCLUDED.codigo`,
    [req.params.id, dia, codigo]
  );
  res.status(204).end();
}));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// qualquer rota que não seja /api/* devolve o frontend (single-page app)
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

// qualquer erro que escape das rotas cai aqui — nunca mais derruba o processo
app.use((err, req, res, next) => {
  console.error("Erro na rota", req.method, req.path, ":", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

initSchema()
  .then(async () => {
    // semeia o primeiro admin se ainda não existir nenhum gestor (login inicial)
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM gestores");
    if (rows[0].n === 0 && process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
      const senha_hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 10);
      await pool.query(
        "INSERT INTO gestores (nome, email, senha_hash, is_admin, setores) VALUES ($1,$2,$3,true,'{}')",
        [process.env.SEED_ADMIN_NOME || "ADMIN", process.env.SEED_ADMIN_EMAIL.toLowerCase(), senha_hash]
      );
      console.log("Admin inicial criado:", process.env.SEED_ADMIN_EMAIL);
    }
    app.listen(PORT, () => console.log(`API no ar na porta ${PORT}`));
  })
  .catch((e) => {
    console.error("Falha ao iniciar (schema/DB):", e);
    process.exit(1);
  });
