const PDFDocument = require("pdfkit");
const path = require("path");
const { REGIMES } = require("./regimes");

const ASSETS = path.join(__dirname, "..", "assets");
const LOGO_BELEM = path.join(ASSETS, "image3.png");
const LOGO_ASELC = path.join(ASSETS, "image1.jpeg");
const LOGO_UPA = path.join(ASSETS, "image2.png");

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MESES = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];

const COR_DOMINGO = "#FF3B30";
const COR_SABADO = "#FF9F1C";
const COR_CINZA_GRUPO = "#D9D9D9";
const COR_CINZA_CLARO = "#F2F2F2";
const COR_BORDA = "#000000";

const REGIME_TITULO = {
  administrativo: "ADMINISTRATIVO",
  parcial4h: "PARCIAL",
};
function tituloGrupo(regime, grupo) {
  if (regime === "doze36Diurno") return grupo === "par" ? "DIURNO 02" : "DIURNO 01";
  if (regime === "doze36Noturno") return grupo === "par" ? "NOTURNO 02" : "NOTURNO 01";
  if (regime === "doze48Diurno") return "DIURNO 12x48";
  if (regime === "doze48Noturno") return "NOTURNO 12x48";
  return REGIME_TITULO[regime] || regime;
}
const REGIME_ORDEM = ["doze36Diurno","doze36Noturno","doze48Diurno","doze48Noturno","administrativo","parcial4h"];
const GRUPO_ORDEM = ["impar", "par"];

function fmtBR(iso) { const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; }

function gerarPdfEscala({ escala, dias, linhas }, res) {
  const colNome = 140, colCargo = 100, colHorario = 62, colDia = 20, colAssinatura = 90;
  const nDias = dias.length;
  const larguraGrade = nDias * colDia;
  const larguraTabela = colNome + colCargo + colHorario + larguraGrade + colAssinatura;
  const margin = 24;
  const pageWidth = larguraTabela + margin * 2;

  // agrupa por cargo, depois por regime+grupo (par/ímpar), mesma lógica da tela
  const cargos = [...new Set(linhas.map((l) => l.colaborador.cargo))];
  let totalLinhasComGrupo = 0;
  const grupos = [];
  cargos.forEach((cargo) => {
    REGIME_ORDEM.forEach((regime) => {
      const precisaSplitParImpar = regime === "doze36Diurno" || regime === "doze36Noturno";
      const subgrupos = precisaSplitParImpar ? GRUPO_ORDEM : [null];
      subgrupos.forEach((grupo) => {
        const doGrupo = linhas.filter((l) => l.colaborador.cargo === cargo && l.colaborador.regime === regime && (grupo === null || l.colaborador.grupo === grupo));
        if (doGrupo.length === 0) return;
        grupos.push({ cargo, regime, grupo, titulo: tituloGrupo(regime, grupo), linhas: doGrupo });
        totalLinhasComGrupo += 1 + doGrupo.length; // 1 = linha do cabeçalho do grupo
      });
    });
  });

  const alturaTopo = 96;
  const alturaFaixa = 16;
  const alturaSetorMes = 24;
  const alturaCabecalhoDias = 26;
  const alturaLinha = 14;
  const alturaCorpo = totalLinhasComGrupo * alturaLinha;
  const alturaLegendaAssinaturas = 120;
  const pageHeight = margin * 2 + alturaTopo + alturaFaixa + alturaSetorMes + alturaCabecalhoDias + alturaCorpo + alturaLegendaAssinaturas;

  const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin: 0 });
  doc.pipe(res);

  let y = margin;
  const x0 = margin;

  // ---------- bloco de topo: logos + título ----------
  const largLogoEsq = 150, largLogoDir = 90;
  const largTitulo = larguraTabela - largLogoEsq - largLogoDir;
  doc.rect(x0, y, larguraTabela, alturaTopo).stroke(COR_BORDA);
  doc.rect(x0, y, largLogoEsq, alturaTopo).stroke(COR_BORDA);
  doc.rect(x0 + larguraTabela - largLogoDir, y, largLogoDir, alturaTopo).stroke(COR_BORDA);
  try {
    doc.image(LOGO_BELEM, x0 + 5, y + 12, { fit: [66, 30] });
    doc.image(LOGO_ASELC, x0 + 82, y + 10, { fit: [62, 34] });
  } catch (e) { /* segue sem logo se o arquivo não existir */ }
  try { doc.image(LOGO_UPA, x0 + larguraTabela - largLogoDir + 8, y + 8, { fit: [largLogoDir - 16, alturaTopo - 16] }); } catch (e) {}

  const xTitulo = x0 + largLogoEsq;
  doc.moveTo(xTitulo, y).lineTo(xTitulo, y + alturaTopo).stroke(COR_BORDA);
  doc.font("Helvetica-Bold").fontSize(11).text("FORMULÁRIO - DEPARTAMENTO PESSOAL - DP", xTitulo, y + 6, { width: largTitulo, align: "center" });
  doc.moveTo(xTitulo, y + 22).lineTo(xTitulo + largTitulo, y + 22).stroke(COR_BORDA);
  doc.font("Helvetica-Bold").fontSize(10).text("Escala de Trabalho", xTitulo, y + 27, { width: largTitulo, align: "center" });
  doc.moveTo(xTitulo, y + 44).lineTo(xTitulo + largTitulo, y + 44).stroke(COR_BORDA);
  const terco = largTitulo / 3;
  doc.moveTo(xTitulo + terco, y + 44).lineTo(xTitulo + terco, y + alturaTopo).stroke(COR_BORDA);
  doc.moveTo(xTitulo + 2 * terco, y + 44).lineTo(xTitulo + 2 * terco, y + alturaTopo).stroke(COR_BORDA);
  doc.font("Helvetica").fontSize(8);
  doc.text("Código: FO.UPATF.DP.001", xTitulo, y + 52, { width: terco, align: "center" });
  doc.text("Versão: 001", xTitulo + terco, y + 52, { width: terco, align: "center" });
  doc.text("Página 1 de 1", xTitulo + 2 * terco, y + 52, { width: terco, align: "center" });
  y += alturaTopo;

  // ---------- faixa "ESCALA DE TRABALHO DA EQUIPE APOIO" ----------
  doc.rect(x0, y, larguraTabela, alturaFaixa).fillAndStroke(COR_CINZA_CLARO, COR_BORDA);
  doc.fillColor("black").font("Helvetica-Bold").fontSize(9).text("ESCALA DE TRABALHO DA EQUIPE APOIO", x0, y + 4, { width: larguraTabela, align: "center" });
  y += alturaFaixa;

  // ---------- SETOR / MÊS ----------
  const largSetor = colNome + colCargo;
  doc.rect(x0, y, larguraTabela, alturaSetorMes).stroke(COR_BORDA);
  doc.moveTo(x0 + largSetor, y).lineTo(x0 + largSetor, y + alturaSetorMes).stroke(COR_BORDA);
  doc.moveTo(x0 + largSetor + colHorario, y).lineTo(x0 + largSetor + colHorario, y + alturaSetorMes).stroke(COR_BORDA);
  doc.moveTo(x0 + colNome + colCargo + colHorario + larguraGrade, y).lineTo(x0 + colNome + colCargo + colHorario + larguraGrade, y + alturaSetorMes + alturaCabecalhoDias).stroke(COR_BORDA);
  doc.font("Helvetica-Bold").fontSize(8).text(`SETOR: ${escala.setor}`, x0 + 4, y + 5, { width: largSetor - 8 });
  const periodoTexto = `${fmtBR(dias[0])} A ${fmtBR(dias[dias.length - 1])} - ${MESES[new Date(dias[dias.length - 1] + "T00:00:00").getMonth()]}`;
  doc.font("Helvetica-Bold").fontSize(7).text("MÊS", x0 + largSetor + colHorario, y + 2, { width: larguraGrade, align: "center" });
  doc.font("Helvetica").fontSize(7).text(periodoTexto, x0 + largSetor + colHorario, y + 10, { width: larguraGrade, align: "center" });
  y += alturaSetorMes;

  // ---------- cabeçalho dos dias (dia da semana + número) ----------
  const yCabDias = y;
  doc.rect(x0, yCabDias, colNome + colCargo + colHorario, alturaCabecalhoDias).stroke(COR_BORDA);
  doc.font("Helvetica-Bold").fontSize(7);
  doc.text("NOME DO FUNCIONÁRIO", x0 + 2, yCabDias + 4, { width: colNome - 4 });
  doc.text("HORÁRIO", x0 + colNome + colCargo, yCabDias + 9, { width: colHorario, align: "center" });
  doc.moveTo(x0 + colNome, yCabDias).lineTo(x0 + colNome, yCabDias + alturaCabecalhoDias).stroke(COR_BORDA);
  doc.moveTo(x0 + colNome + colCargo, yCabDias).lineTo(x0 + colNome + colCargo, yCabDias + alturaCabecalhoDias).stroke(COR_BORDA);

  dias.forEach((dia, i) => {
    const wd = new Date(dia + "T00:00:00").getDay();
    const xd = x0 + colNome + colCargo + colHorario + i * colDia;
    const bg = wd === 0 ? COR_DOMINGO : wd === 6 ? COR_SABADO : "#FFFFFF";
    const fg = wd === 0 || wd === 6 ? "#FFFFFF" : "#000000";
    doc.rect(xd, yCabDias, colDia, alturaCabecalhoDias / 2).fillAndStroke(bg, COR_BORDA);
    doc.fillColor(fg).font("Helvetica-Bold").fontSize(6).text(WEEKDAYS[wd], xd, yCabDias + 3, { width: colDia, align: "center" });
    doc.rect(xd, yCabDias + alturaCabecalhoDias / 2, colDia, alturaCabecalhoDias / 2).fillAndStroke(bg, COR_BORDA);
    doc.fillColor(fg).font("Helvetica-Bold").fontSize(6).text(String(new Date(dia + "T00:00:00").getDate()), xd, yCabDias + alturaCabecalhoDias / 2 + 3, { width: colDia, align: "center" });
  });
  doc.fillColor("black");

  const xAssinatura = x0 + colNome + colCargo + colHorario + larguraGrade;
  doc.rect(xAssinatura, yCabDias, colAssinatura, alturaCabecalhoDias).stroke(COR_BORDA);
  doc.font("Helvetica-Bold").fontSize(7).text("ASSINATURA", xAssinatura, yCabDias + 9, { width: colAssinatura, align: "center" });
  y += alturaCabecalhoDias;

  // ---------- corpo: grupos + linhas ----------
  grupos.forEach((grupo) => {
    doc.rect(x0, y, larguraTabela - colAssinatura, alturaLinha).fillAndStroke(COR_CINZA_GRUPO, COR_BORDA);
    doc.rect(xAssinatura, y, colAssinatura, alturaLinha).stroke(COR_BORDA);
    doc.fillColor("black").font("Helvetica-Bold").fontSize(7).text(grupo.titulo, x0, y + 3, { width: larguraTabela - colAssinatura, align: "center" });
    y += alturaLinha;

    grupo.linhas.forEach((linha) => {
      const r = REGIMES[linha.colaborador.regime];
      doc.rect(x0, y, colNome, alturaLinha).stroke(COR_BORDA);
      doc.rect(x0 + colNome, y, colCargo, alturaLinha).stroke(COR_BORDA);
      doc.rect(x0 + colNome + colCargo, y, colHorario, alturaLinha).stroke(COR_BORDA);
      doc.font("Helvetica").fontSize(6.5);
      doc.text(linha.colaborador.nome, x0 + 3, y + 3.5, { width: colNome - 6, ellipsis: true });
      doc.text(linha.colaborador.cargo, x0 + colNome + 2, y + 3.5, { width: colCargo - 4, ellipsis: true });
      doc.text(r.horario || "", x0 + colNome + colCargo + 2, y + 3.5, { width: colHorario - 4, align: "center" });

      dias.forEach((dia, i) => {
        const wd = new Date(dia + "T00:00:00").getDay();
        const xd = x0 + colNome + colCargo + colHorario + i * colDia;
        const codigo = linha.dias[i];
        const weekend = wd === 0 || wd === 6;
        const bg = weekend ? (wd === 0 ? COR_DOMINGO : COR_SABADO) : "#FFFFFF";
        doc.rect(xd, y, colDia, alturaLinha).fillAndStroke(bg, COR_BORDA);
        doc.fillColor(weekend ? "#FFFFFF" : "#000000").font("Helvetica-Bold").fontSize(6).text(codigo, xd, y + 3.5, { width: colDia, align: "center" });
      });
      doc.fillColor("black");
      doc.rect(xAssinatura, y, colAssinatura, alturaLinha).stroke(COR_BORDA);
      y += alturaLinha;
    });
  });

  // ---------- legenda ----------
  y += 10;
  doc.font("Helvetica-Bold").fontSize(7).text("Legenda:", x0, y);
  y += 10;
  const legendaTexto = [
    "F = FOLGA", "FF = FOLGA FERIADO", "FE = FÉRIAS",
    "PD = Período Diurno   PN = Período Noturno   PD48/PN48 = 12x48   EXP = Administrativo   EXP4 = Parcial",
  ];
  doc.font("Helvetica").fontSize(6.5);
  legendaTexto.forEach((linha) => { doc.text(linha, x0, y); y += 8; });

  const swatches = [
    { cor: COR_DOMINGO, texto: "Domingo" },
    { cor: COR_SABADO, texto: "Sábado" },
  ];
  let xs = x0;
  swatches.forEach((s) => {
    doc.rect(xs, y, 8, 8).fillAndStroke(s.cor, COR_BORDA);
    doc.fillColor("black").font("Helvetica").fontSize(6.5).text(s.texto, xs + 11, y + 1);
    xs += 60;
  });
  doc.fillColor("black");

  // ---------- assinaturas ----------
  const yAss = y + 26;
  const rotulos = ["RESPONSÁVEL PELO SETOR", "COORDENAÇÃO GERAL DE ENFERMAGEM", "COORD. ADM. DE PESSOAL", "DIRETOR IMEDIATO/GERAL"];
  const larguraAss = larguraTabela / rotulos.length;
  rotulos.forEach((rotulo, i) => {
    const xr = x0 + i * larguraAss;
    doc.moveTo(xr + 15, yAss).lineTo(xr + larguraAss - 15, yAss).stroke(COR_BORDA);
    doc.font("Helvetica").fontSize(6.5).text(rotulo, xr, yAss + 3, { width: larguraAss, align: "center" });
  });

  doc.font("Helvetica").fontSize(6).text("Avenida Perimetral, s/n – Terra Firme, Belém - PA", x0, yAss + 24, { width: larguraTabela, align: "center" });
  doc.text("Cep: 66.095-780", x0, yAss + 33, { width: larguraTabela, align: "center" });

  doc.end();
}

module.exports = { gerarPdfEscala };
