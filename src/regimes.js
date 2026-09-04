// Regimes de trabalho encontrados no export de RH (coluna "Descrição do Horario").
// IMPORTANTE: o RH não informa Par/Ímpar nem o dia de início do ciclo 12x48 —
// isso é uma decisão operacional do gestor, guardada em colaboradores.grupo / ciclo_inicio.

const REGIMES = {
  doze36Diurno: { label: "12x36 Diurno", tipo: "paridade", horario: "07:00–19:00", codigo: "PD" },
  doze36Noturno: { label: "12x36 Noturno", tipo: "paridade", horario: "19:00–07:00", codigo: "PN" },
  doze48Diurno: { label: "12x48 Diurno", tipo: "ciclo48", horario: "07:00–19:00", codigo: "PD48" },
  doze48Noturno: { label: "12x48 Noturno", tipo: "ciclo48", horario: "19:00–07:00", codigo: "PN48" },
  administrativo: { label: "Administrativo (40h)", tipo: "semanal", codigo: "EXP" },
  parcial4h: { label: "Parcial (4h/dia)", tipo: "semanal", codigo: "EXP4" },
};

function mapRegime(horarioTexto) {
  const s = (horarioTexto || "").toUpperCase();
  if (s.includes("12/48") && s.includes("DIURNO")) return "doze48Diurno";
  if (s.includes("12/48") && s.includes("NOTURNO")) return "doze48Noturno";
  if (s.includes("12/36") && s.includes("DIURNO")) return "doze36Diurno";
  if (s.includes("12/36") && s.includes("NOTURNO")) return "doze36Noturno";
  if (s.includes("04/DIA") || s.includes("4H")) return "parcial4h";
  return "administrativo";
}

// precisaConfiguracao: regimes que exigem uma decisão do gestor (grupo ou ciclo_inicio)
// antes do colaborador poder entrar numa escala.
function precisaConfiguracao(colaborador) {
  const r = REGIMES[colaborador.regime];
  if (!r) return true;
  if (r.tipo === "paridade") return !colaborador.grupo;
  if (r.tipo === "ciclo48") return !colaborador.ciclo_inicio;
  return false;
}

function diffDias(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

// codigoDoDia: retorna o código (PD/PN/EXP/F/...) de um colaborador numa data específica.
function codigoDoDia(colaborador, dataISO, override) {
  if (override) return override;
  const r = REGIMES[colaborador.regime];
  if (!r) return "F";
  const data = new Date(dataISO + "T00:00:00");

  if (r.tipo === "paridade") {
    const isEven = data.getDate() % 2 === 0;
    const trabalha = colaborador.grupo === "par" ? isEven : !isEven;
    return trabalha ? r.codigo : "F";
  }
  if (r.tipo === "ciclo48") {
    if (!colaborador.ciclo_inicio) return "F";
    const ref = new Date(colaborador.ciclo_inicio + "T00:00:00");
    const mod = ((diffDias(data, ref) % 3) + 3) % 3;
    return mod === 0 ? r.codigo : "F";
  }
  if (r.tipo === "semanal") {
    const wd = data.getDay();
    return wd >= 1 && wd <= 5 ? r.codigo : "F";
  }
  return "F";
}

module.exports = { REGIMES, mapRegime, precisaConfiguracao, codigoDoDia };
