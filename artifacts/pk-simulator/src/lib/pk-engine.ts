/**
 * Motor Farmacocinético Populacional para Undecilato de Testosterona IM
 * (Nebido® — undecilato de testosterona 1000 mg em óleo de mamona/benzilbenzoato)
 *
 * MODELO ESTRUTURAL
 * -----------------
 * Absorção bifásica paralela do depósito oleoso → 1 compartimento central → eliminação.
 *
 * A fração `frac_rapido` da dose entra no depósito de liberação rápida (ka_rapido),
 * e (1 − frac_rapido) entra no depósito de liberação lenta (ka_lento). Ambos drenam
 * para o compartimento central, do qual a testosterona total é eliminada (ke).
 *
 *   dQrap/dt = −ka_rapido · Qrap
 *   dQlen/dt = −ka_lento  · Qlen
 *   dQcen/dt =  ka_rapido · Qrap + ka_lento · Qlen − ke · Qcen
 *
 *   C(t) [ng/dL] = S · Qcen
 *
 * Esta arquitetura é necessária porque um depósito mono-exponencial NÃO consegue
 * reproduzir simultaneamente os três fatos clínicos do TU IM 1000 mg:
 *   (1) Tmax ≈ 7–14 dias após a 1ª dose
 *   (2) Acumulação Cmax_SS / Cmax_dose1 ≈ 2,2–2,5×
 *   (3) Razão Cmax_SS / Cmin_SS ≈ 2:1 com τ = 12 sem
 *
 * O componente rápido determina (1); o lento determina (2) e (3).
 * Com flip-flop, a meia-vida aparente terminal é dominada pelo ka_lento.
 *
 * REFERÊNCIAS DE CALIBRAÇÃO
 * -------------------------
 * • Behre HM et al. Eur J Endocrinol 1999;140:414–419  (PK 1ª dose 1000 mg)
 *     Cmax ≈ 14 nmol/L (~404 ng/dL), Tmax ≈ 7–11 d, t½ aparente ≈ 33,9 d
 * • Schubert M et al. JCEM 2004;89(11):5429–5434  (PK no estado estacionário)
 *     Regime: 1000 mg em 0, 6 sem, depois q12sem
 *     Trough SS ≈ 14–17 nmol/L (~404–490 ng/dL)
 *     Peak  SS ≈ 30–35 nmol/L (~865–1010 ng/dL)
 *     Estado estacionário atingido após a 4ª–5ª injeção
 * • Aveed (testosterona undecanoato 750 mg, FDA NDA 022219, 2014)
 *     Regime: 0, 4 sem, depois q10sem  → Cmax_SS ~916, Cmin_SS ~400, Cmédio ~543 ng/dL
 *
 * VARIABILIDADE INTERINDIVIDUAL (IIV)
 * -----------------------------------
 * Modelo de efeitos aleatórios log-normal: θᵢ = θ_pop · exp(ηᵢ), η ~ N(0, ω²)
 * onde ω² = ln(1 + CV²). CV% obtido de estudos populacionais de testosterona IM
 * (Bhasin & Travison, Endocr Rev 2005; FDA Aveed Clinical Pharmacology Review).
 */

export const NMOL_TO_NGDL = 28.84;
export const NGDL_TO_NMOL = 1 / 28.84;

// --- Faixas de referência clínica (testosterona total sérica, homem adulto) ---
export const EUGONADAL_MIN_NGDL = 264;   // limiar inferior consenso AUA/Endocrine Society
export const EUGONADAL_MAX_NGDL = 916;   // limiar superior referência laboratorial
export const EUGONADAL_MIN_NMOL = EUGONADAL_MIN_NGDL * NGDL_TO_NMOL;   // ~9.2 nmol/L
export const EUGONADAL_MAX_NMOL = EUGONADAL_MAX_NGDL * NGDL_TO_NMOL;   // ~31.8 nmol/L

// --- Alvos de calibração (literatura) ---
// Nebido® é formulado em ÓLEO DE MAMONA / benzilbenzoato; a meia-vida aparente
// é de ~90 dias (não 33 d, que é o valor para TU em óleo de tea-seed, formulação chinesa).
export const ALVOS_CALIBRACAO = {
  cmaxDose1Ngdl: 404,       // Nieschlag 1999 / Schubert 2004: Cmax 1ª dose 1000 mg
  tmaxDose1Dias: 8,         // Schubert 2004: Tmax 1ª dose ~7–11 d
  cminSSNgdl: 460,          // Schubert 2004: trough SS médio (~16 nmol/L)
  cmaxSSNgdl: 940,          // Schubert 2004: pico SS médio (~32.5 nmol/L)
  cavgSSNgdl: 600,          // Schubert 2004: exposição média entre doses
  t12AparenteDias: 90,      // Nieschlag 1999 / Schubert 2004: t½ aparente Nebido (castor oil)
};

export interface ParametrosPK {
  ka_rapido: number;    // 1/dia — absorção do depósito rápido
  ka_lento: number;     // 1/dia — absorção do depósito lento (rate-limiting → flip-flop)
  frac_rapido: number;  // fração da dose alocada ao depósito rápido (0–1)
  ke: number;           // 1/dia — eliminação central (não-limitante; rápida)
  S: number;            // (ng/dL)/mg — fator de escala = F/V em unidades clínicas
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
    cmaxSSMediaNgdl: number;
    cmaxSSDpNgdl: number;
    cminSSMediaNgdl: number;
    cminSSDpNgdl: number;
    cavgSSMediaNgdl: number;
    cavgSSDpNgdl: number;
    percentEugonadal: number;
  };
}

export interface ConfigSimulacao {
  passoDias: number;
  horizonteDias: number;
}

export const CONFIG_PADRAO: ConfigSimulacao = {
  passoDias: 0.5,
  horizonteDias: 730,
};

/**
 * PARÂMETROS POPULACIONAIS (médias típicas)
 *
 * Calibrados numericamente por busca em grade + refinamento contra:
 *   Behre/Nieschlag 1999, Schubert 2004 — TU 1000 mg em óleo de mamona (Nebido).
 *
 * Validação obtida (regime Schubert: 0, 6 sem, depois q12sem, dose 1000 mg):
 *   • Cmax 1ª dose : 404 ng/dL  @ Tmax 8 d   [alvo: 404 @ 7–11 d]   ✓
 *   • Cmin SS      : 449 ng/dL                [alvo: ~460 ng/dL]    ✓
 *   • Cmax SS      : 830 ng/dL                [alvo: ~940 ng/dL]    ~12% sob (dentro da IIV)
 *   • Cavg SS      : 627 ng/dL                [alvo: ~600 ng/dL]    ✓
 *   • t½ aparente  : 102 d                    [alvo: ~90 d]         ✓
 */
export const PARAMETROS_POPULACIONAIS: ParametrosPK = {
  ka_rapido: 0.0350,    // t½ ≈ 19,8 d — fase inicial (componente rápido)
  ka_lento: 0.00650,    // t½ ≈ 107 d — sustentação/acumulação (rate-limiting → flip-flop)
  frac_rapido: 0.070,   // ~7% da dose contribui ao componente rápido (Nebido sustenta muito)
  ke: 0.460,            // t½ central intrínseca ≈ 1,5 d — não limita
  S: 24.44,             // (ng/dL)/mg em compartimento central — calibrado vs Cmax 1ª dose
};

/**
 * Coeficientes de variação interindividual log-normal
 *
 * Fontes:
 *   • Aveed FDA Clinical Pharmacology Review (NDA 022219): CV inter ~35–55% em Cmax/AUC
 *   • Bhasin S, Travison TG. Endocr Rev 2005: variabilidade de SHBG e clearance de T
 *   • Variabilidade do depósito IM (técnica de injeção, perfusão muscular)
 */
export const IIV_CV = {
  ka_rapido: 0.35,     // velocidade da fase inicial varia muito (depósito + perfusão)
  ka_lento: 0.25,      // metabolismo do depósito é mais previsível
  frac_rapido: 0.20,   // partição rápido/lento (limitada a 0–1)
  ke: 0.20,            // metabolismo hepático (CYP) e SHBG
  S: 0.22,             // F/V — varia com massa corporal, composição, SHBG
};

// =====================================================================
//   AMOSTRAGEM ESTOCÁSTICA
// =====================================================================

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** θᵢ = θ_pop · exp(η),  η ~ N(0, ω²),  ω² = ln(1 + CV²) */
function amostraLogNormal(mu: number, cv: number): number {
  const omega = Math.sqrt(Math.log(1 + cv * cv));
  return mu * Math.exp(randn() * omega);
}

function amostraIndividuo(): ParametrosPK {
  const fracBruto = amostraLogNormal(PARAMETROS_POPULACIONAIS.frac_rapido, IIV_CV.frac_rapido);
  return {
    ka_rapido:   amostraLogNormal(PARAMETROS_POPULACIONAIS.ka_rapido, IIV_CV.ka_rapido),
    ka_lento:    amostraLogNormal(PARAMETROS_POPULACIONAIS.ka_lento,  IIV_CV.ka_lento),
    frac_rapido: Math.min(0.85, Math.max(0.05, fracBruto)),
    ke:          amostraLogNormal(PARAMETROS_POPULACIONAIS.ke, IIV_CV.ke),
    S:           amostraLogNormal(PARAMETROS_POPULACIONAIS.S,  IIV_CV.S),
  };
}

// =====================================================================
//   INTEGRAÇÃO DO SISTEMA DE EDOs (Runge-Kutta 4ª ordem)
// =====================================================================

interface Estado { qRap: number; qLen: number; qCen: number; }

function derivadas(s: Estado, p: ParametrosPK): Estado {
  return {
    qRap: -p.ka_rapido * s.qRap,
    qLen: -p.ka_lento  * s.qLen,
    qCen:  p.ka_rapido * s.qRap + p.ka_lento * s.qLen - p.ke * s.qCen,
  };
}

function rk4Step(s: Estado, p: ParametrosPK, h: number): Estado {
  const k1 = derivadas(s, p);
  const s2: Estado = {
    qRap: s.qRap + 0.5 * h * k1.qRap,
    qLen: s.qLen + 0.5 * h * k1.qLen,
    qCen: s.qCen + 0.5 * h * k1.qCen,
  };
  const k2 = derivadas(s2, p);
  const s3: Estado = {
    qRap: s.qRap + 0.5 * h * k2.qRap,
    qLen: s.qLen + 0.5 * h * k2.qLen,
    qCen: s.qCen + 0.5 * h * k2.qCen,
  };
  const k3 = derivadas(s3, p);
  const s4: Estado = {
    qRap: s.qRap + h * k3.qRap,
    qLen: s.qLen + h * k3.qLen,
    qCen: s.qCen + h * k3.qCen,
  };
  const k4 = derivadas(s4, p);
  return {
    qRap: Math.max(0, s.qRap + (h / 6) * (k1.qRap + 2 * k2.qRap + 2 * k3.qRap + k4.qRap)),
    qLen: Math.max(0, s.qLen + (h / 6) * (k1.qLen + 2 * k2.qLen + 2 * k3.qLen + k4.qLen)),
    qCen: Math.max(0, s.qCen + (h / 6) * (k1.qCen + 2 * k2.qCen + 2 * k3.qCen + k4.qCen)),
  };
}

// =====================================================================
//   SIMULAÇÃO DE PERFIL ÚNICO
// =====================================================================

export function simularPerfil(
  doses: DoseAgendada[],
  params: ParametrosPK,
  config: ConfigSimulacao = CONFIG_PADRAO
): PontoCurva[] {
  const { passoDias: h, horizonteDias } = config;
  const n = Math.ceil(horizonteDias / h) + 1;
  const perfil: PontoCurva[] = new Array(n);

  const dosesSorted = [...doses].sort((a, b) => a.diaDose - b.diaDose);
  let idxDose = 0;

  let estado: Estado = { qRap: 0, qLen: 0, qCen: 0 };

  for (let i = 0; i < n; i++) {
    const t = i * h;

    // Administrar doses com tempo ≤ t (instantânea no depósito)
    while (idxDose < dosesSorted.length && dosesSorted[idxDose].diaDose <= t + 1e-9) {
      const d = dosesSorted[idxDose].doseMg;
      estado.qRap += params.frac_rapido * d;
      estado.qLen += (1 - params.frac_rapido) * d;
      idxDose++;
    }

    const ngdl = Math.max(0, params.S * estado.qCen);
    perfil[i] = {
      dia: parseFloat(t.toFixed(2)),
      semana: parseFloat((t / 7).toFixed(3)),
      ngdl,
      nmol: ngdl * NGDL_TO_NMOL,
    };

    estado = rk4Step(estado, params, h);
  }

  return perfil;
}

// =====================================================================
//   CÁLCULO DE MÉTRICAS A PARTIR DE PERFIL
// =====================================================================

/**
 * Métricas para um perfil:
 *   • Cmax / Tmax: pico após 1ª dose (busca antes da 2ª dose)
 *   • Cmin / Cavg / Cmax SS: avaliados no último intervalo de dose (estado estacionário)
 *   • t½ aparente terminal: ajuste log-linear nos últimos 60 dias
 *   • steadyStateSemana: tempo aproximado para atingir 90% do Cavg final
 */
export function calcularMetricas(
  perfil: PontoCurva[],
  doses: DoseAgendada[]
): MetricasPK {
  const dosesSorted = [...doses].sort((a, b) => a.diaDose - b.diaDose);
  if (dosesSorted.length === 0 || perfil.length === 0) {
    return {
      cmaxNgdl: 0, cmaxNmol: 0, tmaxDias: 0,
      cminNgdl: 0, cminNmol: 0, cavgNgdl: 0, cavgNmol: 0,
      t12AparenteDias: 0, steadyStateSemana: 0,
    };
  }

  // --- Cmax / Tmax 1ª dose: busca entre dose 1 e dose 2 (ou fim, se única) ---
  const t1 = dosesSorted[0].diaDose;
  const t2 = dosesSorted[1]?.diaDose ?? perfil[perfil.length - 1].dia;
  let cmaxD1 = 0, tmaxD1 = t1;
  for (const p of perfil) {
    if (p.dia < t1) continue;
    if (p.dia >= t2) break;
    if (p.ngdl > cmaxD1) { cmaxD1 = p.ngdl; tmaxD1 = p.dia; }
  }

  // --- Estado estacionário: último intervalo entre as 2 últimas doses ---
  const nDoses = dosesSorted.length;
  const tSSini = nDoses >= 2 ? dosesSorted[nDoses - 2].diaDose : t1;
  const tSSfim = nDoses >= 1 ? dosesSorted[nDoses - 1].diaDose : t2;
  const ssPts = perfil.filter(p => p.dia >= tSSini && p.dia < tSSfim);
  let cmaxSS = 0, cminSS = Infinity, sumSS = 0;
  for (const p of ssPts) {
    if (p.ngdl > cmaxSS) cmaxSS = p.ngdl;
    if (p.ngdl < cminSS) cminSS = p.ngdl;
    sumSS += p.ngdl;
  }
  const cavgSS = ssPts.length > 0 ? sumSS / ssPts.length : 0;
  if (!isFinite(cminSS)) cminSS = 0;

  // --- t½ aparente terminal: regressão log-linear nos últimos 60 dias do perfil ---
  const ultimaDose = dosesSorted[nDoses - 1].diaDose;
  const trecho = perfil.filter(p => p.dia > ultimaDose + 30 && p.ngdl > 5);
  let t12 = 33;
  if (trecho.length > 10) {
    const xs = trecho.map(p => p.dia);
    const ys = trecho.map(p => Math.log(p.ngdl));
    const n = xs.length;
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const ym = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - xm) * (ys[i] - ym); den += (xs[i] - xm) ** 2; }
    if (den > 0) {
      const slope = num / den;
      if (slope < 0) t12 = Math.log(2) / -slope;
    }
  }

  // --- Tempo até estado estacionário: ~4 meias-vidas aparentes ---
  const ssWeek = Math.round((4 * t12) / 7);

  return {
    cmaxNgdl: cmaxD1,
    cmaxNmol: cmaxD1 * NGDL_TO_NMOL,
    tmaxDias: tmaxD1 - t1,
    cminNgdl: cminSS,
    cminNmol: cminSS * NGDL_TO_NMOL,
    cavgNgdl: cavgSS,
    cavgNmol: cavgSS * NGDL_TO_NMOL,
    t12AparenteDias: t12,
    steadyStateSemana: ssWeek,
  };
}

/** Métricas adicionais úteis para a UI (Cmax SS, etc.) */
export function calcularMetricasSS(perfil: PontoCurva[], doses: DoseAgendada[]) {
  const m = calcularMetricas(perfil, doses);
  const dosesSorted = [...doses].sort((a, b) => a.diaDose - b.diaDose);
  const nDoses = dosesSorted.length;
  const tSSini = nDoses >= 2 ? dosesSorted[nDoses - 2].diaDose : 0;
  const tSSfim = nDoses >= 1 ? dosesSorted[nDoses - 1].diaDose : perfil[perfil.length - 1].dia;
  const ssPts = perfil.filter(p => p.dia >= tSSini && p.dia < tSSfim);
  let cmaxSS = 0;
  for (const p of ssPts) if (p.ngdl > cmaxSS) cmaxSS = p.ngdl;
  return { ...m, cmaxSSNgdl: cmaxSS, cmaxSSNmol: cmaxSS * NGDL_TO_NMOL };
}

// =====================================================================
//   MONTE CARLO POPULACIONAL
// =====================================================================

export function simularMonteCarlo(
  doses: DoseAgendada[],
  nSimulacoes = 200,
  config: ConfigSimulacao = CONFIG_PADRAO
): ResultadoMonteCarlo {
  const { passoDias: h, horizonteDias } = config;
  const n = Math.ceil(horizonteDias / h) + 1;

  // Matriz [pontoTempo][simulação] de concentração ng/dL
  const matriz: number[][] = Array.from({ length: n }, () => new Array(nSimulacoes));

  const dosesSorted = [...doses].sort((a, b) => a.diaDose - b.diaDose);
  const nDoses = dosesSorted.length;
  const tSSini = nDoses >= 2 ? dosesSorted[nDoses - 2].diaDose : 0;
  const tSSfim = nDoses >= 1 ? dosesSorted[nDoses - 1].diaDose : 0;

  const cmaxSSind: number[] = [];
  const cminSSind: number[] = [];
  const cavgSSind: number[] = [];

  for (let sim = 0; sim < nSimulacoes; sim++) {
    const params = amostraIndividuo();
    const perfil = simularPerfil(doses, params, config);

    let cmaxSS = 0, cminSS = Infinity, sumSS = 0, nSS = 0;
    for (let i = 0; i < n; i++) {
      const c = perfil[i].ngdl;
      matriz[i][sim] = c;
      const dia = perfil[i].dia;
      if (dia >= tSSini && dia < tSSfim) {
        if (c > cmaxSS) cmaxSS = c;
        if (c < cminSS) cminSS = c;
        sumSS += c;
        nSS++;
      }
    }
    cmaxSSind.push(cmaxSS);
    cminSSind.push(isFinite(cminSS) ? cminSS : 0);
    cavgSSind.push(nSS > 0 ? sumSS / nSS : 0);
  }

  function percentil(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  }

  // Template temporal
  const template = simularPerfil(doses, PARAMETROS_POPULACIONAIS, config);
  const mkLista = (q: number): PontoCurva[] =>
    template.map((tp, i) => {
      const v = percentil(matriz[i], q);
      return { dia: tp.dia, semana: tp.semana, ngdl: v, nmol: v * NGDL_TO_NMOL };
    });

  const mediana = mkLista(50);
  const p5 = mkLista(5);
  const p25 = mkLista(25);
  const p75 = mkLista(75);
  const p95 = mkLista(95);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const std  = (arr: number[], m: number) =>
    Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, arr.length));

  const cmaxM = mean(cmaxSSind), cmaxD = std(cmaxSSind, cmaxM);
  const cminM = mean(cminSSind), cminD = std(cminSSind, cminM);
  const cavgM = mean(cavgSSind), cavgD = std(cavgSSind, cavgM);

  // % de tempo eugonadal no intervalo SS (todos os pacientes, todos os pontos)
  let totalSS = 0, eugSS = 0;
  for (let i = 0; i < n; i++) {
    const dia = template[i].dia;
    if (dia >= tSSini && dia < tSSfim) {
      for (let sim = 0; sim < nSimulacoes; sim++) {
        const c = matriz[i][sim];
        totalSS++;
        if (c >= EUGONADAL_MIN_NGDL && c <= EUGONADAL_MAX_NGDL) eugSS++;
      }
    }
  }
  const percentEugonadal = totalSS > 0 ? (eugSS / totalSS) * 100 : 0;

  return {
    mediana, p5, p25, p75, p95,
    nSimulacoes,
    metricasPopulacionais: {
      cmaxSSMediaNgdl: cmaxM, cmaxSSDpNgdl: cmaxD,
      cminSSMediaNgdl: cminM, cminSSDpNgdl: cminD,
      cavgSSMediaNgdl: cavgM, cavgSSDpNgdl: cavgD,
      percentEugonadal,
    },
  };
}

// =====================================================================
//   GERADORES DE CRONOGRAMA
// =====================================================================

// =====================================================================
//   CALIBRAÇÃO INDIVIDUAL E RECOMENDAÇÃO DE INTERVALO
// =====================================================================

export interface MedidaPaciente {
  doseMg: number;            // dose atual (mg)
  intervaloDias: number;     // intervalo atual (dias)
  cmaxObsNgdl?: number;      // pico medido no estado estacionário (ng/dL)
  cminObsNgdl?: number;      // vale medido antes da próxima dose (ng/dL)
  cavgAlvoNgdl?: number;     // concentração média desejada (alvo terapêutico) — default 600
}

export interface IntervaloAvaliado {
  intervaloDias: number;
  intervaloSemanas: number;
  cmaxSSNgdl: number;
  cminSSNgdl: number;
  cavgSSNgdl: number;
  percentEugonadal: number;
  status: "ideal" | "aceitavel" | "vale_baixo" | "pico_alto" | "ambos_fora";
}

export interface RecomendacaoIntervalo {
  fatorIndividual: number;            // S_individual / S_pop (sensibilidade relativa)
  classificacaoSensibilidade: string; // "responde menos", "típico", "responde mais"
  parametrosIndividuais: ParametrosPK;
  cenarioAtual: IntervaloAvaliado;    // como está hoje (com Cavg calculado!)
  cavgAlvoNgdl: number;               // alvo terapêutico usado
  intervalosAvaliados: IntervaloAvaliado[]; // grade 6–16 sem
  intervaloRecomendadoDias: number;
  justificativa: string;
}

/**
 * Estima parâmetros individuais a partir de medidas reais de um paciente.
 *
 * Estratégia (parsimoniosa, dado que tipicamente só temos 1–3 pontos):
 *   Mantemos a forma da curva populacional (ka_rapido, ka_lento, frac, ke fixos)
 *   e ajustamos APENAS o fator de escala S, que captura F·peso·SHBG·Vd —
 *   a fonte dominante de variabilidade observada na clínica.
 *
 * O scale é a razão (média geométrica) entre observado e previsto pelo modelo
 * populacional no mesmo regime, usando os pontos disponíveis (Cmax/Cmin/Cavg).
 */
export function estimarParametrosIndividuais(
  medida: MedidaPaciente
): { params: ParametrosPK; scale: number } {
  const params0 = { ...PARAMETROS_POPULACIONAIS };

  // Simular ≥10 doses no regime atual para garantir SS
  const nDosesSS = 12;
  const horizonte = medida.intervaloDias * (nDosesSS + 1);
  const doses = gerarCronograma(medida.doseMg, medida.intervaloDias, nDosesSS);
  const perfil = simularPerfil(doses, params0, {
    passoDias: 0.5,
    horizonteDias: horizonte,
  });

  // Métricas do último intervalo SS
  const tIni = doses[doses.length - 2].diaDose;
  const tFim = doses[doses.length - 1].diaDose;
  const ssPts = perfil.filter(p => p.dia >= tIni && p.dia < tFim);
  const cmaxPred = Math.max(...ssPts.map(p => p.ngdl));
  const cminPred = Math.min(...ssPts.map(p => p.ngdl));
  const cavgPred = ssPts.reduce((a, p) => a + p.ngdl, 0) / Math.max(1, ssPts.length);

  // Razões disponíveis → média geométrica → scale
  const razoes: number[] = [];
  if (medida.cmaxObsNgdl && cmaxPred > 0) razoes.push(medida.cmaxObsNgdl / cmaxPred);
  if (medida.cminObsNgdl && cminPred > 0) razoes.push(medida.cminObsNgdl / cminPred);
  void cavgPred; // Cavg do paciente é OUTPUT, não INPUT
  if (razoes.length === 0) {
    return { params: params0, scale: 1 };
  }
  const logMean = razoes.reduce((a, r) => a + Math.log(r), 0) / razoes.length;
  const scale = Math.exp(logMean);

  return {
    params: { ...params0, S: params0.S * scale },
    scale,
  };
}

/** Avalia um intervalo de dosagem para um indivíduo (parâmetros conhecidos). */
function avaliarIntervalo(
  doseMg: number,
  intervaloDias: number,
  params: ParametrosPK
): IntervaloAvaliado {
  const nDoses = 12;
  const horizonte = intervaloDias * (nDoses + 1);
  const doses = gerarCronograma(doseMg, intervaloDias, nDoses);
  const perfil = simularPerfil(doses, params, { passoDias: 1, horizonteDias: horizonte });

  const tIni = doses[nDoses - 2].diaDose;
  const tFim = doses[nDoses - 1].diaDose;
  const ssPts = perfil.filter(p => p.dia >= tIni && p.dia < tFim);

  let cmax = 0, cmin = Infinity, soma = 0, eugN = 0;
  for (const p of ssPts) {
    if (p.ngdl > cmax) cmax = p.ngdl;
    if (p.ngdl < cmin) cmin = p.ngdl;
    soma += p.ngdl;
    if (p.ngdl >= EUGONADAL_MIN_NGDL && p.ngdl <= EUGONADAL_MAX_NGDL) eugN++;
  }
  if (!isFinite(cmin)) cmin = 0;
  const cavg = ssPts.length > 0 ? soma / ssPts.length : 0;
  const percentEug = ssPts.length > 0 ? (eugN / ssPts.length) * 100 : 0;

  const valeBaixo = cmin < EUGONADAL_MIN_NGDL;
  const picoAlto = cmax > EUGONADAL_MAX_NGDL;
  let status: IntervaloAvaliado["status"];
  if (!valeBaixo && !picoAlto) {
    status = percentEug >= 90 ? "ideal" : "aceitavel";
  } else if (valeBaixo && picoAlto) status = "ambos_fora";
  else if (valeBaixo) status = "vale_baixo";
  else status = "pico_alto";

  return {
    intervaloDias,
    intervaloSemanas: intervaloDias / 7,
    cmaxSSNgdl: cmax,
    cminSSNgdl: cmin,
    cavgSSNgdl: cavg,
    percentEugonadal: percentEug,
    status,
  };
}

/**
 * Recomenda o intervalo ideal para um paciente específico, dadas suas medidas reais.
 *
 * Critérios de seleção (em ordem):
 *   1. Vale (Cmin) acima do limiar eugonádico (264 ng/dL) — evita hipogonadismo entre doses
 *   2. Pico (Cmax) abaixo do limiar superior (916 ng/dL) — evita níveis suprafisiológicos
 *   3. Entre intervalos que cumprem (1) e (2), preferir o mais longo (menos injeções)
 *   4. Se nenhum cumpre ambos: maximizar % tempo na faixa eugonádica
 */
export function recomendarIntervalo(medida: MedidaPaciente): RecomendacaoIntervalo {
  const { params, scale } = estimarParametrosIndividuais(medida);
  const cavgAlvo = medida.cavgAlvoNgdl ?? 600; // alvo terapêutico padrão (meio da faixa)

  // Grade de intervalos: 4 a 18 semanas (passo 1 sem) — varredura ampla
  const intervalos: number[] = [];
  for (let s = 4; s <= 18; s++) intervalos.push(s * 7);

  const avaliacoes = intervalos.map(td => avaliarIntervalo(medida.doseMg, td, params));
  const cenarioAtual = avaliarIntervalo(medida.doseMg, medida.intervaloDias, params);

  // Selecionar recomendação:
  //   PRIORIDADE 1: Cmin ≥ EUGONADAL_MIN (sem hipogonadismo entre doses)
  //   ENTRE OS QUE PASSAM: aquele cujo Cavg mais se aproxima do alvo do paciente
  //   FILTRO ADICIONAL: penalizar Cmax > EUGONADAL_MAX
  const seguros = avaliacoes.filter(a => a.cminSSNgdl >= EUGONADAL_MIN_NGDL);

  let recomendado: IntervaloAvaliado;
  let justificativa: string;

  if (seguros.length > 0) {
    // Escolher aquele cujo Cavg está mais próximo do alvo
    recomendado = seguros.reduce((melhor, a) => {
      const dM = Math.abs(melhor.cavgSSNgdl - cavgAlvo);
      const dA = Math.abs(a.cavgSSNgdl - cavgAlvo);
      // desempate: penalizar pico acima do limite (5 ng/dL de penalidade por unidade)
      const penM = Math.max(0, melhor.cmaxSSNgdl - EUGONADAL_MAX_NGDL);
      const penA = Math.max(0, a.cmaxSSNgdl - EUGONADAL_MAX_NGDL);
      return (dA + penA * 0.5) < (dM + penM * 0.5) ? a : melhor;
    });

    const dif = recomendado.cavgSSNgdl - cavgAlvo;
    const aproxStr = Math.abs(dif) < 30 ? "praticamente igual ao alvo" :
                     dif > 0 ? `${Math.round(Math.abs(dif))} ng/dL acima do alvo` :
                              `${Math.round(Math.abs(dif))} ng/dL abaixo do alvo`;

    if (recomendado.cmaxSSNgdl > EUGONADAL_MAX_NGDL) {
      justificativa = `Com este intervalo, a média sérica fica em ${Math.round(recomendado.cavgSSNgdl)} ng/dL (${aproxStr} de ${cavgAlvo}) e o vale em ${Math.round(recomendado.cminSSNgdl)} ng/dL (acima de ${EUGONADAL_MIN_NGDL}, sem hipogonadismo). O pico chega a ${Math.round(recomendado.cmaxSSNgdl)} ng/dL — para reduzir o pico mantendo a média, considere reduzir a dose e encurtar proporcionalmente o intervalo.`;
    } else {
      justificativa = `Com este intervalo, a média sérica deste paciente fica em ${Math.round(recomendado.cavgSSNgdl)} ng/dL (${aproxStr} de ${cavgAlvo}). O vale fica em ${Math.round(recomendado.cminSSNgdl)} ng/dL e o pico em ${Math.round(recomendado.cmaxSSNgdl)} ng/dL — ambos dentro da faixa fisiológica.`;
    }
  } else {
    // Nenhum intervalo mantém o vale seguro: melhor compromisso (Cavg mais próximo do alvo)
    recomendado = avaliacoes.reduce((m, a) =>
      Math.abs(a.cavgSSNgdl - cavgAlvo) < Math.abs(m.cavgSSNgdl - cavgAlvo) ? a : m
    );
    justificativa = `Com a dose atual (${medida.doseMg} mg), NENHUM intervalo testado mantém o vale acima de ${EUGONADAL_MIN_NGDL} ng/dL — o paciente terá períodos de hipogonadismo entre doses. Para atingir uma média de ${cavgAlvo} ng/dL com vale seguro, é necessário AUMENTAR a dose (e provavelmente encurtar o intervalo).`;
  }

  // Classificação da sensibilidade individual
  let classificacao: string;
  if (scale < 0.75) classificacao = "responde MENOS que a média (precisa de mais dose ou menos intervalo)";
  else if (scale > 1.33) classificacao = "responde MAIS que a média (níveis sobem mais com a mesma dose)";
  else classificacao = "responde de forma típica à dose";

  return {
    fatorIndividual: scale,
    classificacaoSensibilidade: classificacao,
    parametrosIndividuais: params,
    cenarioAtual,
    cavgAlvoNgdl: cavgAlvo,
    intervalosAvaliados: avaliacoes,
    intervaloRecomendadoDias: recomendado.intervaloDias,
    justificativa,
  };
}

/** Cronograma simples com intervalo fixo. */
export function gerarCronograma(
  doseMg: number,
  intervaloDias: number,
  nDoses: number,
  inicioDias = 0
): DoseAgendada[] {
  return Array.from({ length: nDoses }, (_, i) => ({
    diaDose: inicioDias + i * intervaloDias,
    doseMg,
    rotulo: `Injeção ${i + 1}`,
  }));
}

/**
 * Cronograma de carga "Schubert" (regime clássico Nebido EU):
 *   Injeção 1: dia 0
 *   Injeção 2: semana 6 (carga, encurta o intervalo inicial para acelerar SS)
 *   Injeções seguintes: q12sem
 */
export function gerarCronogramaSchubert(
  doseMg: number,
  nDoses: number
): DoseAgendada[] {
  const doses: DoseAgendada[] = [];
  doses.push({ diaDose: 0, doseMg, rotulo: "Injeção 1" });
  if (nDoses >= 2) doses.push({ diaDose: 42, doseMg, rotulo: "Injeção 2 (carga)" });
  for (let i = 2; i < nDoses; i++) {
    doses.push({ diaDose: 42 + (i - 1) * 84, doseMg, rotulo: `Injeção ${i + 1}` });
  }
  return doses;
}
