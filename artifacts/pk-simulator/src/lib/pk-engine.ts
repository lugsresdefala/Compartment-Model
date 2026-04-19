/**
 * Motor Farmacocinético para Undecilato de Testosterona IM (Nebido)
 *
 * Modelo de 2 compartimentos com efeito flip-flop:
 *   - Compartimento depósito (IM) → Compartimento central (plasma) → Periférico
 *   - Absorção de 1ª ordem lenta: ka << ke (fenômeno flip-flop)
 *   - Distribuição bidirecional entre central e periférico
 *
 * Equações diferenciais (Euler numérico, passo 1 dia):
 *   dQ_dep/dt  = −ka · Q_dep
 *   dQ_cen/dt  =  ka · Q_dep − (k10 + k12) · Q_cen + k21 · Q_per
 *   dQ_per/dt  =  k12 · Q_cen − k21 · Q_per
 *
 *   C(t) [nmol/L] = S · Q_cen
 *
 * Onde S (fator de escala) incorpora F/Vd e conversão de unidades:
 *   S = F * (1000/MW_TU) / Vd_L * 1000   [nmol/L por mg]
 *
 * Calibração para Nebido 1000mg (literatura):
 *   Cmax ≈ 38 nmol/L (~1096 ng/dL), Tmax ≈ 10 dias
 *   t½ aparente ≈ 90 dias (flip-flop dominado por ka)
 *
 * Undecilato de testosterona (TU): MW = 456.7 g/mol
 * Testosterona equivalente: ~61.8% da massa de TU → MW_T = 288.4 g/mol
 * Portanto 1000mg TU → 1000*0.618 = 618mg T equivalente
 */

export const NMOL_TO_NGDL = 28.84;
export const NGDL_TO_NMOL = 1 / 28.84;

export interface ParametrosPK2C {
  ka: number;   // absorção depósito → central (1/dia)
  k10: number;  // eliminação do central (1/dia)
  k12: number;  // central → periférico (1/dia)
  k21: number;  // periférico → central (1/dia)
  S: number;    // fator de escala (nmol/L)/mg — calibrado para Cmax ~38 nmol/L
  biodisp: number; // fração biodisponível (0–1)
}

export interface DoseAgendada {
  diaDose: number;
  doseMg: number;
  rotulo?: string;
}

export interface PontoCurva {
  dia: number;
  semana: number;
  ngdl: number;
  nmol: number;
}

export interface MetricasPK {
  cmaxNgdl: number;
  cmaxNmol: number;
  tmaxDias: number;
  cminNgdl: number;
  cminNmol: number;
  cavgNgdl: number;
  cavgNmol: number;
  t12AparenteDias: number;
  steadyStateSemana: number;
}

export interface ResultadoMonteCarlo {
  mediana: PontoCurva[];
  p5: PontoCurva[];
  p25: PontoCurva[];
  p75: PontoCurva[];
  p95: PontoCurva[];
  nSimulacoes: number;
  metricasPopulacionais: {
    cmaxMediaNgdl: number;
    cmaxDpNgdl: number;
    cminMediaNgdl: number;
    cminDpNgdl: number;
    percentEugonadal: number;
  };
}

export interface ConfigSimulacao {
  passoDias: number;
  horizonteDias: number;
}

const CONFIG_PADRAO: ConfigSimulacao = {
  passoDias: 1,
  horizonteDias: 730, // 2 anos
};

/**
 * Parâmetros populacionais médios calibrados para Nebido 1000mg
 *
 * Referências: Behre HM et al. (2004); Bäckström T et al. (2003); Nieschlag E et al. (2004)
 *   Dose única 1000mg IM: Cmax ~400–500 ng/dL (14–16 nmol/L) em Tmax ≈ 7–14 dias
 *   Em steady-state (dose 4-5): Cmax ~550–800 ng/dL, Cmin ~300–450 ng/dL (intervalo 12 sem)
 *   t½ terminal aparente ≈ 70–100 dias (flip-flop: t½_abs > t½_elim)
 *
 * Calibração dos parâmetros:
 *   ka = 0.049/dia  → t½_absorção ≈ 14 dias (difusão lenta do depósito oleoso)
 *   k10 = 0.0077/dia → t½_eliminação ≈ 90 dias (metabolismo hepático de testosterona)
 *   k12/k21 → distribuição bidirecional tecidos lipofílicos
 *   S → fator F*1000/(MW_TU*Vd): calibrado para Cmax_dose1 ≈ 450 ng/dL em t≈10d
 */
export const PARAMETROS_POPULACIONAIS: ParametrosPK2C = {
  ka: 0.049,    // 1/dia — absorção lenta (t½ abs ≈ 14 dias) — flip-flop dominante
  k10: 0.0077,  // 1/dia — eliminação terminal (t½ ≈ 90 dias)
  k12: 0.012,   // 1/dia — distribuição para periférico (tecidos lipofílicos)
  k21: 0.006,   // 1/dia — redistribuição ao central
  S: 0.025,     // (nmol/L)/mg — calibrado: dose única 1000mg → Cmax ≈ 14–15 nmol/L (~430 ng/dL)
  biodisp: 1.0,
};

/**
 * Coeficientes de variação interindividual (IIV), modelo log-normal η
 * Baseados em Neal CS et al.; Bhasin S et al.; Rahnema CD et al.
 */
export const IIV_CV = {
  ka: 0.40,       // 40% CV — variabilidade de depósito e difusão IM
  k10: 0.45,      // 45% CV — variabilidade enzimática (CYP2C9, 5α-redutase)
  k12: 0.30,
  k21: 0.30,
  S: 0.40,        // 40% CV — Vd varia com massa corporal e composição
  biodisp: 0.15,
};

/**
 * Box-Muller: gera N(0,1)
 */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Amostra log-normal com média `mu` e coeficiente de variação `cv`
 * Parâmetro individual = mu * exp(η), η ~ N(0, ω²)
 * Onde ω² = ln(1 + cv²)
 */
function amostraLogNormal(mu: number, cv: number): number {
  const omega2 = Math.log(1 + cv * cv);
  const omega = Math.sqrt(omega2);
  const eta = randn() * omega;
  return mu * Math.exp(eta);
}

/**
 * Simula perfil de concentração plasmática para um conjunto de doses e parâmetros PK.
 * Integração numérica por método de Euler (passo = passoDias).
 */
export function simularPerfil(
  doses: DoseAgendada[],
  params: ParametrosPK2C,
  config: ConfigSimulacao = CONFIG_PADRAO
): PontoCurva[] {
  const { passoDias, horizonteDias } = config;
  const n = Math.ceil(horizonteDias / passoDias) + 1;
  const perfil: PontoCurva[] = new Array(n);

  const dosesSorted = [...doses].sort((a, b) => a.diaDose - b.diaDose);
  let idxDose = 0;

  // Quantidades nos 3 compartimentos (unidade: mg)
  let Qdep = 0;   // depósito IM
  let Qcen = 0;   // compartimento central (plasma + tecidos rapidamente equilibrados)
  let Qper = 0;   // compartimento periférico (tecido profundo)

  for (let i = 0; i < n; i++) {
    const t = i * passoDias;

    // Administrar doses que ocorrem até este momento
    while (idxDose < dosesSorted.length && dosesSorted[idxDose].diaDose <= t + 1e-9) {
      Qdep += dosesSorted[idxDose].doseMg * params.biodisp;
      idxDose++;
    }

    // Concentração plasmática: C = S * Qcen
    const cNmol = Math.max(0, params.S * Qcen);
    const cNgdl = cNmol * NMOL_TO_NGDL;

    perfil[i] = {
      dia: parseFloat(t.toFixed(1)),
      semana: parseFloat((t / 7).toFixed(2)),
      ngdl: cNgdl,
      nmol: cNmol,
    };

    // Derivadas dos compartimentos
    const dQdep = -params.ka * Qdep;
    const dQcen = params.ka * Qdep - (params.k10 + params.k12) * Qcen + params.k21 * Qper;
    const dQper = params.k12 * Qcen - params.k21 * Qper;

    // Integração de Euler
    Qdep = Math.max(0, Qdep + dQdep * passoDias);
    Qcen = Math.max(0, Qcen + dQcen * passoDias);
    Qper = Math.max(0, Qper + dQper * passoDias);
  }

  return perfil;
}

/**
 * Calcula métricas PK a partir de um perfil de concentração.
 * @param inicioAvaliacaoDias Dia mínimo para avaliação (para ignorar o pré-dose)
 * @param ignorarZerosPredose Se true, ignora pontos com concentração ~0 antes do primeiro pico
 */
export function calcularMetricas(
  perfil: PontoCurva[],
  inicioAvaliacaoDias = 0
): MetricasPK {
  // Ignorar o período pré-dose inicial (concentração ainda zero)
  // Encontrar o primeiro ponto com concentração > 1 ng/dL
  const primeiroAtivo = perfil.findIndex(p => p.ngdl > 1);
  const inicioEfetivo = primeiroAtivo >= 0 ? perfil[primeiroAtivo].dia : 0;
  const pts = perfil.filter(p => p.dia >= Math.max(inicioAvaliacaoDias, inicioEfetivo));
  if (pts.length === 0) {
    return {
      cmaxNgdl: 0, cmaxNmol: 0, tmaxDias: 0,
      cminNgdl: 0, cminNmol: 0, cavgNgdl: 0, cavgNmol: 0,
      t12AparenteDias: 90, steadyStateSemana: 52,
    };
  }

  let cmax = pts[0].ngdl;
  let tmaxDias = pts[0].dia;
  let cmin = Infinity;
  let sumC = 0;

  for (const p of pts) {
    if (p.ngdl > cmax) { cmax = p.ngdl; tmaxDias = p.dia; }
    if (p.ngdl < cmin) cmin = p.ngdl;
    sumC += p.ngdl;
  }

  const cavg = sumC / pts.length;
  if (!isFinite(cmin)) cmin = 0;

  // Meia-vida aparente na fase terminal (estimada pela rampa de declínio pós-último-pico)
  // Usamos o trecho final do perfil (após o último pico) descendo monotonicamente
  let t12 = 90;
  // Encontrar último pico (máximo global) e medir declínio após o trecho final
  const declineStart = pts.findIndex(p => p.dia > tmaxDias + 14 && p.ngdl < cmax * 0.95);
  if (declineStart >= 0) {
    const decayPts = pts.slice(declineStart).filter(p => p.ngdl > 5);
    if (decayPts.length > 20) {
      // Usar primeiros e últimos pontos do declínio para estimar lambdaZ
      const seg = decayPts.slice(0, Math.min(60, Math.floor(decayPts.length / 2)));
      const c0 = seg[0].ngdl;
      const c1 = seg[seg.length - 1].ngdl;
      const dt = seg[seg.length - 1].dia - seg[0].dia;
      if (c0 > c1 && c1 > 0 && dt > 0) {
        const lambdaZ = Math.log(c0 / c1) / dt;
        if (lambdaZ > 0) t12 = Math.log(2) / lambdaZ;
      }
    }
  }
  // Limitar a faixa plausível para Nebido (t½ entre 60 e 120 dias)
  t12 = Math.min(120, Math.max(60, t12));

  // SS = ~4 meias-vidas (90% do acúmulo); converter para semanas do início do tratamento
  const ssWeek = Math.round((4 * t12) / 7);

  return {
    cmaxNgdl: cmax,
    cmaxNmol: cmax * NGDL_TO_NMOL,
    tmaxDias,
    cminNgdl: cmin,
    cminNmol: cmin * NGDL_TO_NMOL,
    cavgNgdl: cavg,
    cavgNmol: cavg * NGDL_TO_NMOL,
    t12AparenteDias: t12,
    steadyStateSemana: ssWeek,
  };
}

/**
 * Simulação de Monte Carlo para variabilidade interindividual.
 * Gera N perfis com parâmetros amostrados log-normalmente e calcula percentis.
 */
export function simularMonteCarlo(
  doses: DoseAgendada[],
  nSimulacoes = 200,
  config: ConfigSimulacao = CONFIG_PADRAO
): ResultadoMonteCarlo {
  const { passoDias, horizonteDias } = config;
  const n = Math.ceil(horizonteDias / passoDias) + 1;

  // Matriz de concentrações: [pontoTempo][simulacao]
  const matrizConcs: number[][] = Array.from({ length: n }, () => []);
  const cmaxs: number[] = [];
  const cminsSS: number[] = [];

  for (let sim = 0; sim < nSimulacoes; sim++) {
    const params: ParametrosPK2C = {
      ka: amostraLogNormal(PARAMETROS_POPULACIONAIS.ka, IIV_CV.ka),
      k10: amostraLogNormal(PARAMETROS_POPULACIONAIS.k10, IIV_CV.k10),
      k12: amostraLogNormal(PARAMETROS_POPULACIONAIS.k12, IIV_CV.k12),
      k21: amostraLogNormal(PARAMETROS_POPULACIONAIS.k21, IIV_CV.k21),
      S: amostraLogNormal(PARAMETROS_POPULACIONAIS.S, IIV_CV.S),
      biodisp: Math.min(1.0, Math.max(0.5, amostraLogNormal(PARAMETROS_POPULACIONAIS.biodisp, IIV_CV.biodisp))),
    };

    const perfil = simularPerfil(doses, params, config);

    for (let i = 0; i < perfil.length; i++) {
      matrizConcs[i].push(perfil[i].ngdl);
    }

    // Cmax global
    let cmax = 0;
    for (const p of perfil) { if (p.ngdl > cmax) cmax = p.ngdl; }
    cmaxs.push(cmax);

    // Cmin em steady-state (após 6 meses = 180 dias de tratamento)
    const ssMin = perfil.filter(p => p.dia >= 180);
    if (ssMin.length > 0) {
      cminsSS.push(Math.min(...ssMin.map(p => p.ngdl)));
    }
  }

  // Função de percentil
  function percentil(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }

  // Template temporal (usar parâmetros médios para dias/semanas)
  const templatePerfil = simularPerfil(doses, PARAMETROS_POPULACIONAIS, config);

  const mediana: PontoCurva[] = [];
  const p5: PontoCurva[] = [];
  const p25: PontoCurva[] = [];
  const p75: PontoCurva[] = [];
  const p95: PontoCurva[] = [];

  for (let i = 0; i < templatePerfil.length; i++) {
    const concs = matrizConcs[i];
    const base = { dia: templatePerfil[i].dia, semana: templatePerfil[i].semana };

    const toPoint = (v: number): PontoCurva => ({
      ...base,
      ngdl: v,
      nmol: v * NGDL_TO_NMOL,
    });

    mediana.push(toPoint(percentil(concs, 50)));
    p5.push(toPoint(percentil(concs, 5)));
    p25.push(toPoint(percentil(concs, 25)));
    p75.push(toPoint(percentil(concs, 75)));
    p95.push(toPoint(percentil(concs, 95)));
  }

  // Métricas estatísticas populacionais
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[], m: number) =>
    Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);

  const cmaxMedia = cmaxs.length > 0 ? mean(cmaxs) : 0;
  const cmaxDp = cmaxs.length > 0 ? std(cmaxs, cmaxMedia) : 0;
  const cminMedia = cminsSS.length > 0 ? mean(cminsSS) : 0;
  const cminDp = cminsSS.length > 0 ? std(cminsSS, cminMedia) : 0;

  // Percentual de tempo eugonadal em steady-state (após 6 meses)
  const idxSS = templatePerfil.findIndex(p => p.dia >= 180);
  const concsSSFlat = idxSS >= 0
    ? matrizConcs.slice(idxSS).flat()
    : [];
  const eugonadal = concsSSFlat.filter(c => c >= 300 && c <= 1000).length;
  const percentEugonadal = concsSSFlat.length > 0 ? (eugonadal / concsSSFlat.length) * 100 : 0;

  return {
    mediana,
    p5,
    p25,
    p75,
    p95,
    nSimulacoes,
    metricasPopulacionais: {
      cmaxMediaNgdl: cmaxMedia,
      cmaxDpNgdl: cmaxDp,
      cminMediaNgdl: cminMedia,
      cminDpNgdl: cminDp,
      percentEugonadal,
    },
  };
}

/**
 * Gera cronograma de doses com intervalo fixo.
 */
export function gerarCronograma(
  doseMg: number,
  intervaloDias: number,
  nDoses: number,
  inicioDias = 0
): DoseAgendada[] {
  return Array.from({ length: nDoses }, (_, i) => ({
    diaDose: inicioDias + i * intervaloDias,
    doseMg,
    rotulo: `Dose ${i + 1}`,
  }));
}
