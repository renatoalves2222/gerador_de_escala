const XLSX = require("xlsx");
const { mapRegime } = require("./regimes");

// Nomes de coluna EXATOS observados em QUADRO_DE_COLABORADORES_..._UPA_TF.XLSX
const COL = {
  chapa: "Chapa",
  nome: "Nome",
  cargo: "Nome Funcão",
  setor: "Descrição Seção",
  situacao: "Situação",
  horario: "Descrição do Horario",
};

function parsePlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const registros = [];
  const problemas = [];

  rows.forEach((row, i) => {
    const chapa = String(row[COL.chapa] || "").trim();
    const nome = String(row[COL.nome] || "").trim();
    const cargo = String(row[COL.cargo] || "").trim();
    const setor = String(row[COL.setor] || "").trim();
    const situacao = String(row[COL.situacao] || "").trim().toUpperCase();
    const horarioTexto = String(row[COL.horario] || "").trim();

    if (!nome || !setor) {
      problemas.push({ linha: i + 2, motivo: "sem nome ou setor" });
      return;
    }
    registros.push({
      chapa: chapa || null,
      nome: nome.toUpperCase(),
      cargo: cargo.toUpperCase(),
      setor: setor.toUpperCase(),
      situacao, // 'A' = ativo; qualquer outra coisa entra como inativo/afastado
      regime: mapRegime(horarioTexto),
      horarioTexto,
    });
  });

  return { registros, problemas };
}

module.exports = { parsePlanilha, COL };
