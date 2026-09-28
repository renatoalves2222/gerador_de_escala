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

function isoParaData(iso) {
  return new Date(iso + "T00:00:00");
}

// Início (dia 21) do ciclo que contém a data informada.
function inicioDoCiclo(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const d = dia >= 21 ? new Date(ano, mes - 1, 21) : new Date(ano, mes - 2, 21);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-21`;
}

// ---------------------------------------------------------------- 12x36
// REGRA: "Par"/"Ímpar" vale para o MÊS DE INÍCIO da escala de referência
// (colaboradores.grupo_ref = dia 21 daquela escala). Dali em diante o plantão
// alterna dia sim / dia não SEM quebra, atravessando meses e escalas.
// Consequência: quando o mês de início tem 31 dias (31 e 1 são ambos ímpares),
// quem era "par" passa a ser "ímpar" na escala seguinte e vice-versa — mas
// nunca há dois plantões seguidos nem duas folgas seguidas.
const REF_PADRAO_PARIDADE = "2026-04-21";

// Primeiro dia de trabalho do colaborador a partir da referência (âncora fixa).
function ancoraParidade(colaborador) {
  const ref = isoParaData(colaborador.grupo_ref || REF_PADRAO_PARIDADE);
  const refEhPar = ref.getDate() % 2 === 0;
  const querPar = colaborador.grupo === "par";
  if (refEhPar === querPar) return ref;
  const d = new Date(ref);
  d.setDate(d.getDate() + 1);
  return d;
}

function trabalhaNoDia12x36(colaborador, dataISO) {
  const diff = diffDias(isoParaData(dataISO), ancoraParidade(colaborador));
  return ((diff % 2) + 2) % 2 === 0;
}

// Rótulo (par/impar) do colaborador numa escala: paridade dos dias que ele
// trabalha no mês de início dessa escala.
function grupoNaEscala(colaborador, inicioEscalaISO) {
  if (!colaborador.grupo) return null;
  const ini = isoParaData(inicioEscalaISO);
  const trabalhaNoInicio = trabalhaNoDia12x36(colaborador, inicioEscalaISO);
  const diaTrabalho = trabalhaNoInicio ? ini.getDate() : ini.getDate() + 1;
  return diaTrabalho % 2 === 0 ? "par" : "impar";
}

// Converte um "par/impar" escolhido para a escala que começa em inicioEscalaISO
// no grupo equivalente para outra referência (usado ao salvar/exibir).
function grupoRelativo(grupo, refOrigemISO, refDestinoISO) {
  return grupoNaEscala({ grupo, grupo_ref: refOrigemISO }, refDestinoISO);
}

// codigoDoDia: retorna o código (PD/PN/EXP/F/...) de um colaborador numa data específica.
function codigoDoDia(colaborador, dataISO, override) {
  if (override) return override;
  const r = REGIMES[colaborador.regime];
  if (!r) return "F";
  const data = isoParaData(dataISO);

  if (r.tipo === "paridade") {
    if (!colaborador.grupo) return "F";
    return trabalhaNoDia12x36(colaborador, dataISO) ? r.codigo : "F";
  }
  if (r.tipo === "ciclo48") {
    if (!colaborador.ciclo_inicio) return "F";
    const ref = isoParaData(colaborador.ciclo_inicio);
    const mod = ((diffDias(data, ref) % 3) + 3) % 3;
    return mod === 0 ? r.codigo : "F";
  }
  if (r.tipo === "semanal") {
    const wd = data.getDay();
    return wd >= 1 && wd <= 5 ? r.codigo : "F";
  }
  return "F";
}

module.exports = { REGIMES, mapRegime, precisaConfiguracao, codigoDoDia, grupoNaEscala, grupoRelativo, inicioDoCiclo };
