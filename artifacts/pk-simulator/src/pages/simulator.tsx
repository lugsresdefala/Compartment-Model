import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceArea,
  Brush,
} from "recharts";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Clock,
} from "lucide-react";
import {
  simularPerfil,
  simularMonteCarlo,
  calcularMetricas,
  gerarCronograma,
  gerarCronogramaSchubert,
  recomendarIntervalo,
  PARAMETROS_POPULACIONAIS,
  ALVOS_CALIBRACAO,
  EUGONADAL_MIN_NGDL,
  EUGONADAL_MAX_NGDL,
  EUGONADAL_MIN_NMOL,
  EUGONADAL_MAX_NMOL,
  NMOL_TO_NGDL,
  NGDL_TO_NMOL,
  type PontoCurva,
  type ResultadoMonteCarlo,
  type MetricasPK,
  type RecomendacaoIntervalo,
} from "@/lib/pk-engine";
import { UserCog } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LodiLogo } from "@/components/LodiLogo";

type UnidadeConc = "ngdl" | "nmol";

interface ConfigSimulador {
  doseMg: number;
  intervaloDias: number;
  nDoses: number;
  unidade: UnidadeConc;
  mostrarMonteCarlo: boolean;
  nSimulacoesMC: number;
  cargaSchubert: boolean;  // regime de carga clássico EU: 0, 6 sem, q12sem
}

const CONFIG_INICIAL: ConfigSimulador = {
  doseMg: 1000,
  intervaloDias: 84,  // 12 semanas
  nDoses: 8,
  unidade: "ngdl",
  mostrarMonteCarlo: true,
  nSimulacoesMC: 150,
  cargaSchubert: true,
};

function fmt(v: number, u: UnidadeConc): string {
  if (u === "ngdl") return `${Math.round(v)} ng/dL`;
  return `${v.toFixed(1)} nmol/L`;
}

function statusEugonadal(c: number, u: UnidadeConc): "baixo" | "normal" | "alto" {
  const cNgdl = u === "ngdl" ? c : c * NMOL_TO_NGDL;
  if (cNgdl < EUGONADAL_MIN_NGDL) return "baixo";
  if (cNgdl > EUGONADAL_MAX_NGDL) return "alto";
  return "normal";
}

const STATUS_COLOR = {
  baixo: "text-amber-600 dark:text-amber-400",
  normal: "text-emerald-600 dark:text-emerald-400",
  alto: "text-rose-600 dark:text-rose-400",
};

const STATUS_ICON = {
  baixo: <AlertTriangle className="w-4 h-4" />,
  normal: <CheckCircle2 className="w-4 h-4" />,
  alto: <AlertTriangle className="w-4 h-4" />,
};

const STATUS_LABEL = {
  baixo: "Hipogonádico",
  normal: "Eugonádico",
  alto: "Suprafisiológico",
};

function MetricCard({
  label,
  value,
  sub,
  icon,
  statusClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  statusClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-card border border-card-border">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${statusClass ?? ""}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function CustomTooltipMC({ active, payload, label, unidade }: {
  active?: boolean;
  payload?: { value: number; name: string; color?: string }[];
  label?: number;
  unidade: UnidadeConc;
}) {
  if (!active || !payload || !payload.length) return null;
  const key = unidade === "ngdl" ? "ngdl" : "nmol";
  const unit = unidade === "ngdl" ? "ng/dL" : "nmol/L";
  const semana = label !== undefined ? Math.round(label) : "-";
  return (
    <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg text-xs min-w-[160px]">
      <div className="font-medium text-foreground mb-2">Semana {semana}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-3 text-muted-foreground">
          <span>{p.name}</span>
          <span className="font-mono text-foreground">{typeof p.value === "number" ? p.value.toFixed(unidade === "nmol" ? 1 : 0) : "-"} {unit}</span>
        </div>
      ))}
    </div>
  );
}

export default function Simulator() {
  const [config, setConfig] = useState<ConfigSimulador>(CONFIG_INICIAL);
  const [isCalculating, setIsCalculating] = useState(false);
  const [aba, setAba] = useState("grafico");

  const doses = useMemo(
    () => config.cargaSchubert
      ? gerarCronogramaSchubert(config.doseMg, config.nDoses)
      : gerarCronograma(config.doseMg, config.intervaloDias, config.nDoses),
    [config.doseMg, config.intervaloDias, config.nDoses, config.cargaSchubert]
  );

  const horDias = useMemo(() => {
    const ultimaDose = doses[doses.length - 1]?.diaDose ?? 0;
    return Math.max(ultimaDose + 120, 365);
  }, [doses]);

  const perfilMediano = useMemo(
    () =>
      simularPerfil(doses, PARAMETROS_POPULACIONAIS, {
        passoDias: 0.5,
        horizonteDias: horDias,
      }),
    [doses, horDias]
  );

  const metricas: MetricasPK = useMemo(
    () => calcularMetricas(perfilMediano, doses),
    [perfilMediano, doses]
  );

  // Métricas clínicas adicionais: 1ª dose isolada e steady-state
  const metricasClinicas = useMemo(() => {
    if (perfilMediano.length === 0) return null;

    // Cmax 1ª dose: simular dose única isolada (sem acúmulo) por 200 dias
    const perfilDoseUnica = simularPerfil(
      [{ diaDose: 0, doseMg: doses[0]?.doseMg ?? 1000 }],
      PARAMETROS_POPULACIONAIS,
      { passoDias: 0.5, horizonteDias: 200 }
    );
    let cmax1a = 0, tmax1a = 0;
    for (const p of perfilDoseUnica) {
      if (p.ngdl > cmax1a) { cmax1a = p.ngdl; tmax1a = p.dia; }
    }

    // Cmin / Cmax SS: último intervalo entre as 2 últimas doses
    const nD = doses.length;
    const tIni = nD >= 2 ? doses[nD - 2].diaDose : 0;
    const tFim = nD >= 1 ? doses[nD - 1].diaDose : 0;
    const ssRegiao = perfilMediano.filter(p => p.dia >= tIni && p.dia < tFim);
    const cminSS = ssRegiao.length > 0 ? Math.min(...ssRegiao.map(p => p.ngdl)) : 0;
    const cmaxSS = ssRegiao.length > 0 ? Math.max(...ssRegiao.map(p => p.ngdl)) : 0;

    return { cmax1a, tmax1a, cminSS, cmaxSS };
  }, [perfilMediano, doses]);

  const [resultadoMC, setResultadoMC] = useState<ResultadoMonteCarlo | null>(null);
  const [mcConcluido, setMcConcluido] = useState(false);

  // ----- Calibração individual (aba "Ajustar para um paciente") -----
  const [pacienteIn, setPacienteIn] = useState({
    doseMg: "1000",
    intervaloSemanas: "12",
    cmaxObs: "",
    cminObs: "",
    cavgAlvo: "600",
  });
  const [recomendacao, setRecomendacao] = useState<RecomendacaoIntervalo | null>(null);

  const calcularRecomendacao = useCallback(() => {
    const dose = parseFloat(pacienteIn.doseMg);
    const intSem = parseFloat(pacienteIn.intervaloSemanas);
    const cmax = parseFloat(pacienteIn.cmaxObs);
    const cmin = parseFloat(pacienteIn.cminObs);
    const alvo = parseFloat(pacienteIn.cavgAlvo);
    if (!isFinite(dose) || dose <= 0) return;
    if (!isFinite(intSem) || intSem <= 0) return;
    const haAlguma = isFinite(cmax) || isFinite(cmin);
    if (!haAlguma) return;
    const r = recomendarIntervalo({
      doseMg: dose,
      intervaloDias: intSem * 7,
      cmaxObsNgdl: isFinite(cmax) ? cmax : undefined,
      cminObsNgdl: isFinite(cmin) ? cmin : undefined,
      cavgAlvoNgdl: isFinite(alvo) && alvo > 0 ? alvo : 600,
    });
    setRecomendacao(r);
  }, [pacienteIn]);

  const executarMC = useCallback(async () => {
    setIsCalculating(true);
    setMcConcluido(false);
    await new Promise(r => setTimeout(r, 10));
    const resultado = simularMonteCarlo(doses, config.nSimulacoesMC, {
      passoDias: 1,
      horizonteDias: horDias,
    });
    setResultadoMC(resultado);
    setIsCalculating(false);
    setMcConcluido(true);
  }, [doses, config.nSimulacoesMC, horDias]);

  // Auto-executar simulação de variação quando ativada ou quando parâmetros mudam (debounced)
  useEffect(() => {
    if (!config.mostrarMonteCarlo) {
      setResultadoMC(null);
      setMcConcluido(false);
      return;
    }
    const t = setTimeout(() => { void executarMC(); }, 200);
    return () => clearTimeout(t);
  }, [config.mostrarMonteCarlo, doses, config.nSimulacoesMC, executarMC]);

  const chave = config.unidade === "ngdl" ? "ngdl" : "nmol";
  const unLabel = config.unidade === "ngdl" ? "ng/dL" : "nmol/L";
  const eugMin = config.unidade === "ngdl" ? EUGONADAL_MIN_NGDL : EUGONADAL_MIN_NMOL;
  const eugMax = config.unidade === "ngdl" ? EUGONADAL_MAX_NGDL : EUGONADAL_MAX_NMOL;

  // Preparar dados do gráfico (decimar a cada 3 pontos para performance)
  // Para bandas de IC com Recharts, usamos pares [low, high] em cada dataKey de Area
  const dadosGrafico = useMemo(() => {
    if (!config.mostrarMonteCarlo || !resultadoMC) {
      return perfilMediano
        .filter((_, i) => i % 3 === 0)
        .map(pt => ({ semana: pt.semana, dia: pt.dia, conc: pt[chave] }));
    }

    // Para bandas: area com dataKey=[low, high] onde low é o valor baixo e high o alto
    return resultadoMC.mediana
      .filter((_, i) => i % 3 === 0)
      .map((pt, j) => {
        const idx = j * 3;
        const getV = (arr: PontoCurva[], i: number) => arr[i]?.[chave] ?? 0;
        return {
          semana: pt.semana,
          dia: pt.dia,
          conc: pt[chave],
          bandaIC90: [getV(resultadoMC.p5, idx), getV(resultadoMC.p95, idx)] as [number, number],
          bandaIQ50: [getV(resultadoMC.p25, idx), getV(resultadoMC.p75, idx)] as [number, number],
        };
      });
  }, [perfilMediano, resultadoMC, config.mostrarMonteCarlo, chave]);

  // Dados histograma de distribuição de Cmax (último MC)
  const histCmax = useMemo(() => {
    if (!resultadoMC) return [];
    const { cmaxSSMediaNgdl, cmaxSSDpNgdl } = resultadoMC.metricasPopulacionais;
    const bins = 15;
    const min = Math.max(0, cmaxSSMediaNgdl - 3 * cmaxSSDpNgdl);
    const max = cmaxSSMediaNgdl + 3 * cmaxSSDpNgdl;
    const step = (max - min) / bins;
    return Array.from({ length: bins }, (_, i) => ({
      range: `${Math.round(min + i * step)}`,
      count: 0,
      pct: 0,
    }));
  }, [resultadoMC]);

  const statusCmax = statusEugonadal(
    config.unidade === "ngdl" ? metricas.cmaxNgdl : metricas.cmaxNmol,
    config.unidade
  );
  const statusCmin = statusEugonadal(
    config.unidade === "ngdl" ? metricas.cminNgdl : metricas.cminNmol,
    config.unidade
  );

  const xTickFormatter = (v: number) => `sem ${Math.round(v)}`;

  // Ticks de eixo X: a cada 12 semanas (≈ 3 meses) para legibilidade
  const xTicks = useMemo(() => {
    const maxSemana = Math.ceil(horDias / 7);
    const step = maxSemana > 80 ? 24 : maxSemana > 40 ? 12 : 6;
    const arr: number[] = [];
    for (let s = 0; s <= maxSemana; s += step) arr.push(s);
    return arr;
  }, [horDias]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card/40 backdrop-blur">
        <div className="flex items-center gap-4 flex-wrap">
          <LodiLogo size="md" showTagline={false} />
          <div>
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] font-display text-muted-foreground leading-snug">
              Lógica da Dose Individualizada para Hormonização
            </p>
            <p className="text-[11px] sm:text-xs text-muted-foreground/80 mt-0.5 hidden sm:block">
              Simulação farmacocinética de undecilato de testosterona (Nebido)
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] gap-1 border-accent/40 text-accent uppercase tracking-wider">
          <Activity className="w-3 h-3" />
          Uso educacional
        </Badge>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Painel de controles */}
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border p-4 flex flex-col gap-4 bg-card overflow-y-auto">
          <div>
            <h2 className="text-sm font-semibold mb-3 text-foreground">Esquema de doses</h2>

            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs text-muted-foreground">Quantidade por injeção</Label>
                  <span className="text-xs font-mono font-medium">{config.doseMg} mg</span>
                </div>
                <Slider
                  data-testid="slider-dose"
                  min={250} max={1000} step={50}
                  value={[config.doseMg]}
                  onValueChange={([v]) => setConfig(c => ({ ...c, doseMg: v, }))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>250 mg</span><span>1000 mg</span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground">Regime de carga (Schubert)</Label>
                  <Switch
                    data-testid="switch-carga"
                    checked={config.cargaSchubert}
                    onCheckedChange={v => setConfig(c => ({ ...c, cargaSchubert: v }))}
                  />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Protocolo clínico padrão do Nebido: 1ª injeção, 2ª em 6 semanas (carga), depois a cada 12 semanas. Acelera o estado estacionário (Schubert et al., JCEM 2004).
                </p>
              </div>

              <div className={`space-y-2 ${config.cargaSchubert ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="flex justify-between">
                  <Label className="text-xs text-muted-foreground">Tempo entre injeções</Label>
                  <span className="text-xs font-mono font-medium">
                    {config.cargaSchubert ? "12 semanas (Schubert)" : `${(config.intervaloDias / 7).toFixed(0)} semanas`}
                  </span>
                </div>
                <Slider
                  data-testid="slider-intervalo"
                  min={42} max={168} step={7}
                  value={[config.intervaloDias]}
                  onValueChange={([v]) => setConfig(c => ({ ...c, intervaloDias: v }))}
                  disabled={config.cargaSchubert}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>6 sem</span><span>24 sem</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs text-muted-foreground">Quantas injeções simular</Label>
                  <span className="text-xs font-mono font-medium">{config.nDoses}</span>
                </div>
                <Slider
                  data-testid="slider-ndoses"
                  min={2} max={12} step={1}
                  value={[config.nDoses]}
                  onValueChange={([v]) => setConfig(c => ({ ...c, nDoses: v }))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>2</span><span>12</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="text-sm font-semibold mb-3">Como exibir</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Unidade de medida</Label>
                <div className="flex items-center gap-2 text-xs">
                  <span className={config.unidade === "ngdl" ? "text-foreground font-medium" : "text-muted-foreground"}>ng/dL</span>
                  <Switch
                    data-testid="switch-unidade"
                    checked={config.unidade === "nmol"}
                    onCheckedChange={v => setConfig(c => ({ ...c, unidade: v ? "nmol" : "ngdl" }))}
                  />
                  <span className={config.unidade === "nmol" ? "text-foreground font-medium" : "text-muted-foreground"}>nmol/L</span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground">Mostrar variação entre pacientes</Label>
                  <Switch
                    data-testid="switch-mc"
                    checked={config.mostrarMonteCarlo}
                    onCheckedChange={v => setConfig(c => ({ ...c, mostrarMonteCarlo: v }))}
                  />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Pessoas diferentes respondem de forma diferente à mesma dose. Ative para ver a faixa esperada na população (de quem responde menos a quem responde mais).
                </p>
                {config.mostrarMonteCarlo && (
                  <div className="pt-2 space-y-2 border-t border-border">
                    <div className="flex justify-between">
                      <Label className="text-[11px] text-muted-foreground">Quantos pacientes simular</Label>
                      <span className="text-[11px] font-mono font-medium">{config.nSimulacoesMC}</span>
                    </div>
                    <Slider
                      data-testid="slider-mc"
                      min={50} max={500} step={50}
                      value={[config.nSimulacoesMC]}
                      onValueChange={([v]) => setConfig(c => ({ ...c, nSimulacoesMC: v }))}
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>50</span>
                      {isCalculating ? (
                        <span className="flex items-center gap-1 text-primary">
                          <span className="inline-block w-2 h-2 rounded-full border border-primary border-t-transparent animate-spin" />
                          calculando…
                        </span>
                      ) : mcConcluido ? (
                        <span className="text-emerald-600 dark:text-emerald-400">pronto</span>
                      ) : null}
                      <span>500</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Cronograma de doses */}
          <div>
            <h2 className="text-sm font-semibold mb-2">Calendário de injeções</h2>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {doses.map((d, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground">Injeção {i + 1}</span>
                  <span className="font-mono text-foreground">
                    semana {(d.diaDose / 7).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Área principal */}
        <main className="flex-1 flex flex-col overflow-y-auto">
          {/* Métricas clínicas — linguagem clara */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-border">
            {(() => {
              const val = config.unidade === "ngdl"
                ? (metricasClinicas?.cmax1a ?? metricas.cmaxNgdl)
                : (metricasClinicas?.cmax1a ?? metricas.cmaxNgdl) * NGDL_TO_NMOL;
              const st = statusEugonadal(val, config.unidade);
              return (
                <MetricCard
                  label="Pico após a 1ª injeção"
                  value={fmt(val, config.unidade)}
                  sub={`atingido em ~${Math.round(metricasClinicas?.tmax1a ?? metricas.tmaxDias)} dias`}
                  icon={<TrendingUp className="w-3 h-3" />}
                  statusClass={STATUS_COLOR[st]}
                />
              );
            })()}
            {(() => {
              const val = config.unidade === "ngdl"
                ? (metricasClinicas?.cminSS ?? metricas.cminNgdl)
                : (metricasClinicas?.cminSS ?? metricas.cminNgdl) * NGDL_TO_NMOL;
              const st = statusEugonadal(val, config.unidade);
              return (
                <MetricCard
                  label="Vale entre doses (estabilizado)"
                  value={fmt(val, config.unidade)}
                  sub={`menor valor antes da próxima injeção · ${STATUS_LABEL[st]}`}
                  icon={STATUS_ICON[st]}
                  statusClass={STATUS_COLOR[st]}
                />
              );
            })()}
            {(() => {
              const val = config.unidade === "ngdl"
                ? (metricasClinicas?.cmaxSS ?? metricas.cmaxNgdl)
                : (metricasClinicas?.cmaxSS ?? metricas.cmaxNgdl) * NGDL_TO_NMOL;
              const st = statusEugonadal(val, config.unidade);
              return (
                <MetricCard
                  label="Pico entre doses (estabilizado)"
                  value={fmt(val, config.unidade)}
                  sub={`maior valor após injeções repetidas · ${STATUS_LABEL[st]}`}
                  icon={<Activity className="w-3 h-3" />}
                  statusClass={STATUS_COLOR[st]}
                />
              );
            })()}
            <MetricCard
              label="Tempo até estabilizar"
              value={`~${metricas.steadyStateSemana} semanas`}
              sub={`a partir daí, picos e vales se repetem em padrão constante`}
              icon={<Clock className="w-3 h-3" />}
            />
          </div>

          {/* Variação entre pacientes — métricas se disponível */}
          {resultadoMC && config.mostrarMonteCarlo && (
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-foreground">
                  Variação entre pacientes — {resultadoMC.nSimulacoes} pacientes simulados
                </p>
                <span className="text-[11px] text-muted-foreground">média ± desvio</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Pico SS (Cmax)"
                  value={`${Math.round(resultadoMC.metricasPopulacionais.cmaxSSMediaNgdl)} ± ${Math.round(resultadoMC.metricasPopulacionais.cmaxSSDpNgdl)} ng/dL`}
                  sub={`Schubert 2004: ~${ALVOS_CALIBRACAO.cmaxSSNgdl} ng/dL · CV ${(resultadoMC.metricasPopulacionais.cmaxSSDpNgdl / Math.max(1, resultadoMC.metricasPopulacionais.cmaxSSMediaNgdl) * 100).toFixed(0)}%`}
                />
                <MetricCard
                  label="Vale SS (Cmin)"
                  value={`${Math.round(resultadoMC.metricasPopulacionais.cminSSMediaNgdl)} ± ${Math.round(resultadoMC.metricasPopulacionais.cminSSDpNgdl)} ng/dL`}
                  sub={`Schubert 2004: ~${ALVOS_CALIBRACAO.cminSSNgdl} ng/dL · antes da próxima dose`}
                />
                <MetricCard
                  label="Cmédio SS (Cavg)"
                  value={`${Math.round(resultadoMC.metricasPopulacionais.cavgSSMediaNgdl)} ± ${Math.round(resultadoMC.metricasPopulacionais.cavgSSDpNgdl)} ng/dL`}
                  sub="exposição média entre doses no estado estacionário"
                />
                <MetricCard
                  label="% tempo na faixa normal"
                  value={`${resultadoMC.metricasPopulacionais.percentEugonadal.toFixed(0)}%`}
                  sub={`entre ${EUGONADAL_MIN_NGDL}–${EUGONADAL_MAX_NGDL} ng/dL no estado estacionário`}
                  statusClass={
                    resultadoMC.metricasPopulacionais.percentEugonadal >= 70
                      ? STATUS_COLOR.normal
                      : STATUS_COLOR.baixo
                  }
                />
              </div>
            </div>
          )}

          {/* Gráficos */}
          <div className="flex-1 p-4">
            <Tabs value={aba} onValueChange={setAba}>
              <TabsList className="mb-4">
                <TabsTrigger value="grafico" data-testid="tab-grafico">Gráfico ao longo do tempo</TabsTrigger>
                <TabsTrigger value="paciente" data-testid="tab-paciente">
                  <UserCog className="w-3.5 h-3.5 mr-1.5" />
                  Ajustar para um paciente
                </TabsTrigger>
                <TabsTrigger value="info" data-testid="tab-info">Como funciona</TabsTrigger>
              </TabsList>

              <TabsContent value="grafico" className="space-y-4">
                <Card className="lodi-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Testosterona no sangue — {config.doseMg} mg a cada {(config.intervaloDias / 7).toFixed(0)} semanas
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Cada injeção causa uma subida e depois uma descida. Repetidas, vão se sobrepondo até atingir um padrão estável.
                      A faixa <span className="text-emerald-400 font-medium">verde</span> mostra os valores normais para um homem adulto ({EUGONADAL_MIN_NGDL}–{EUGONADAL_MAX_NGDL} ng/dL · referência harmonizada CDC).
                      Linhas tracejadas magenta marcam o dia de cada injeção.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-2">
                    {/* Legenda customizada do gráfico */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-2 text-[11px] text-muted-foreground">
                      {config.mostrarMonteCarlo && resultadoMC ? (
                        <>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-2 rounded-sm bg-violet-500/20" />
                            faixa onde caem 9 em cada 10 pacientes
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-2 rounded-sm bg-violet-500/40" />
                            faixa onde caem 5 em cada 10 (a metade típica)
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-0.5 bg-cyan-400" />
                            paciente médio
                          </span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-3 h-0.5 bg-cyan-400" />
                          concentração de testosterona
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-2 rounded-sm bg-emerald-500/20" />
                        faixa normal ({EUGONADAL_MIN_NGDL}–{EUGONADAL_MAX_NGDL} ng/dL)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-0.5 h-3 border-l border-dashed border-pink-400" />
                        injeção
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={380}>
                      <ComposedChart data={dadosGrafico} margin={{ top: 10, right: 50, left: 0, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                        <XAxis
                          dataKey="semana"
                          tickFormatter={xTickFormatter}
                          label={{ value: "Tempo (semanas desde a 1ª injeção)", position: "insideBottom", offset: -15, fontSize: 11 }}
                          tick={{ fontSize: 10 }}
                          interval={Math.max(0, Math.floor(dadosGrafico.length / 8))}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          width={60}
                          label={{ value: `Testosterona (${unLabel})`, angle: -90, position: "insideLeft", fontSize: 11, offset: 12 }}
                        />
                        <Tooltip
                          content={<CustomTooltipMC unidade={config.unidade} />}
                        />

                        {/* Zona eugonadal */}
                        <ReferenceArea
                          y1={eugMin} y2={eugMax}
                          fill="#10b981" fillOpacity={0.10}
                        />
                        <ReferenceLine y={eugMin} stroke="#34d399" strokeDasharray="4 4" strokeWidth={1} label={{ value: `mín. normal (${eugMin.toFixed(config.unidade === "nmol" ? 1 : 0)})`, position: "right", fontSize: 9, fill: "#34d399" }} />
                        <ReferenceLine y={eugMax} stroke="#34d399" strokeDasharray="4 4" strokeWidth={1} label={{ value: `máx. normal (${eugMax.toFixed(config.unidade === "nmol" ? 1 : 0)})`, position: "right", fontSize: 9, fill: "#34d399" }} />

                        {/* Marcadores de doses */}
                        {doses.map((d, i) => (
                          <ReferenceLine
                            key={i}
                            x={d.diaDose / 7}
                            stroke="#ec4899"
                            strokeWidth={1}
                            strokeDasharray="2 4"
                            opacity={0.45}
                          />
                        ))}

                        {config.mostrarMonteCarlo && resultadoMC && (
                          <Area
                            type="monotone"
                            dataKey="bandaIC90"
                            stroke="none"
                            fill="#a855f7"
                            fillOpacity={0.14}
                            name="9 em 10 pacientes"
                            isAnimationActive={false}
                            dot={false}
                            activeDot={false}
                          />
                        )}
                        {config.mostrarMonteCarlo && resultadoMC && (
                          <Area
                            type="monotone"
                            dataKey="bandaIQ50"
                            stroke="none"
                            fill="#a855f7"
                            fillOpacity={0.28}
                            name="metade típica"
                            isAnimationActive={false}
                            dot={false}
                            activeDot={false}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="conc"
                          stroke="#22d3ee"
                          strokeWidth={2.2}
                          dot={false}
                          isAnimationActive={false}
                          name={config.mostrarMonteCarlo && resultadoMC ? "paciente médio" : "testosterona"}
                        />

                        <Brush
                          dataKey="semana"
                          height={16}
                          stroke="hsl(var(--border))"
                          tickFormatter={xTickFormatter}
                          travellerWidth={6}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Como ler o gráfico */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1.5">
                  <p className="font-semibold">Como ler este gráfico</p>
                  <ul className="list-disc list-inside space-y-1 leading-relaxed">
                    <li><strong>Subidas e descidas:</strong> cada injeção faz a testosterona subir até um pico, depois cair lentamente até a próxima dose.</li>
                    <li><strong>Acúmulo:</strong> as primeiras injeções não atingem o nível normal; com doses repetidas, os valores se acumulam até estabilizar.</li>
                    <li><strong>Faixa verde:</strong> intervalo de testosterona considerado normal para um homem adulto. O ideal é a curva ficar dentro dela.</li>
                    {config.mostrarMonteCarlo && (
                      <li><strong>Áreas violeta:</strong> mostram que pacientes diferentes respondem de forma diferente — alguns ficam mais altos, outros mais baixos com a mesma dose.</li>
                    )}
                  </ul>
                </div>

                {/* Aviso clínico */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>Importante:</strong> esta ferramenta é apenas educacional. Não substitui consulta médica, exames de sangue, nem ajuste individualizado de tratamento. O ajuste real de dose deve ser feito com base em exames laboratoriais reais e avaliação médica.
                </div>
              </TabsContent>

              <TabsContent value="paciente" className="space-y-4">
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                  {/* Coluna 1: formulário */}
                  <Card className="lg:col-span-1 lodi-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-accent" />
                        Dados do paciente
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Informe a dose atual, o intervalo entre injeções e <strong>pelo menos um valor laboratorial</strong> (pico ou vale) medido após o paciente já estar estabilizado (a partir da 4ª-5ª injeção).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Dose atual (mg)</Label>
                          <Input
                            data-testid="input-dose"
                            type="number" inputMode="decimal" min={50} step={50}
                            value={pacienteIn.doseMg}
                            onChange={e => setPacienteIn(p => ({ ...p, doseMg: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Intervalo atual (semanas)</Label>
                          <Input
                            data-testid="input-intervalo"
                            type="number" inputMode="decimal" min={4} step={1}
                            value={pacienteIn.intervaloSemanas}
                            onChange={e => setPacienteIn(p => ({ ...p, intervaloSemanas: e.target.value }))}
                          />
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                          1) Exames do paciente (ng/dL)
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Informe pelo menos UM dos dois valores abaixo (preferencialmente os dois). O sistema usa essas medidas para identificar o metabolismo individual deste paciente.
                        </p>

                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center justify-between">
                            <span>Pico medido (Cmax)</span>
                            <span className="text-[10px] text-muted-foreground">~1 sem após injeção</span>
                          </Label>
                          <Input
                            data-testid="input-cmax"
                            type="number" inputMode="decimal" min={0} step={10}
                            placeholder="ex.: 950"
                            value={pacienteIn.cmaxObs}
                            onChange={e => setPacienteIn(p => ({ ...p, cmaxObs: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center justify-between">
                            <span>Vale medido (Cmin)</span>
                            <span className="text-[10px] text-muted-foreground">imediatamente antes da próxima dose</span>
                          </Label>
                          <Input
                            data-testid="input-cmin"
                            type="number" inputMode="decimal" min={0} step={10}
                            placeholder="ex.: 380"
                            value={pacienteIn.cminObs}
                            onChange={e => setPacienteIn(p => ({ ...p, cminObs: e.target.value }))}
                          />
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                          2) Concentração média desejada
                        </p>
                        <Label className="text-xs flex items-center justify-between">
                          <span>Cavg-alvo (ng/dL)</span>
                          <span className="text-[10px] text-muted-foreground">faixa: {EUGONADAL_MIN_NGDL}–{EUGONADAL_MAX_NGDL}</span>
                        </Label>
                        <Input
                          data-testid="input-cavg-alvo"
                          type="number" inputMode="decimal" min={EUGONADAL_MIN_NGDL} max={EUGONADAL_MAX_NGDL} step={10}
                          placeholder="600"
                          value={pacienteIn.cavgAlvo}
                          onChange={e => setPacienteIn(p => ({ ...p, cavgAlvo: e.target.value }))}
                        />
                        <div className="flex gap-1.5 flex-wrap pt-1">
                          {[400, 500, 600, 700, 800].map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setPacienteIn(p => ({ ...p, cavgAlvo: String(v) }))}
                              className={`text-[10px] px-2 py-0.5 rounded-md border transition-all ${
                                pacienteIn.cavgAlvo === String(v)
                                  ? "lodi-chip-active bg-primary text-primary-foreground border-primary"
                                  : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-accent/50"
                              }`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Meta de testosterona média no sangue deste paciente. Faixa fisiológica média: 500–700 ng/dL. O sistema vai escolher o intervalo que mais se aproxima desta meta mantendo o vale acima de {EUGONADAL_MIN_NGDL}.
                        </p>
                      </div>

                      <Button
                        data-testid="button-recomendar"
                        className="w-full lodi-button-primary font-display tracking-wide"
                        onClick={calcularRecomendacao}
                      >
                        Calcular intervalo ideal
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Coluna 2-3: resultado */}
                  <div className="lg:col-span-2 space-y-4">
                    {!recomendacao ? (
                      <Card className="border-dashed">
                        <CardContent className="py-12 text-center text-sm text-muted-foreground">
                          <UserCog className="w-10 h-10 mx-auto mb-3 opacity-30" />
                          <p>Preencha os dados do paciente à esquerda e clique em <strong className="text-foreground">"Calcular intervalo ideal"</strong>.</p>
                          <p className="text-xs mt-2">É necessário pelo menos uma medida (pico, vale ou média).</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        {/* Recomendação principal */}
                        <Card className="border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/10">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              Intervalo recomendado para este paciente
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="flex items-baseline gap-3">
                              <span className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                {(recomendacao.intervaloRecomendadoDias / 7).toFixed(0)}
                              </span>
                              <span className="text-base text-muted-foreground">semanas</span>
                              <span className="text-sm text-muted-foreground">
                                ({recomendacao.intervaloRecomendadoDias} dias) — dose {parseFloat(pacienteIn.doseMg)} mg
                              </span>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{recomendacao.justificativa}</p>

                            {(() => {
                              const rec = recomendacao.intervalosAvaliados.find(
                                a => a.intervaloDias === recomendacao.intervaloRecomendadoDias
                              )!;
                              return (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                                  <div className="rounded-lg bg-background border border-border p-2">
                                    <div className="text-[10px] text-muted-foreground">Pico previsto</div>
                                    <div className="text-sm font-semibold tabular-nums">{Math.round(rec.cmaxSSNgdl)} ng/dL</div>
                                  </div>
                                  <div className="rounded-lg bg-background border border-border p-2">
                                    <div className="text-[10px] text-muted-foreground">Vale previsto</div>
                                    <div className="text-sm font-semibold tabular-nums">{Math.round(rec.cminSSNgdl)} ng/dL</div>
                                  </div>
                                  <div className="rounded-lg bg-background border border-border p-2">
                                    <div className="text-[10px] text-muted-foreground">Média prevista</div>
                                    <div className="text-sm font-semibold tabular-nums">{Math.round(rec.cavgSSNgdl)} ng/dL</div>
                                  </div>
                                  <div className="rounded-lg bg-background border border-border p-2">
                                    <div className="text-[10px] text-muted-foreground">Tempo na faixa</div>
                                    <div className={`text-sm font-semibold tabular-nums ${rec.percentEugonadal >= 90 ? "text-emerald-600" : rec.percentEugonadal >= 70 ? "text-amber-600" : "text-rose-600"}`}>
                                      {rec.percentEugonadal.toFixed(0)}%
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </CardContent>
                        </Card>

                        {/* Perfil individual: metabolismo + Cavg atual calculado */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Perfil deste paciente — metabolismo e situação atual</CardTitle>
                            <CardDescription className="text-xs">
                              Calculado a partir das medidas laboratoriais informadas, no regime atual ({parseFloat(pacienteIn.doseMg)} mg a cada {parseFloat(pacienteIn.intervaloSemanas)} semanas).
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {/* Cavg calculado — destaque principal */}
                            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-baseline gap-3">
                              <div className="flex-1">
                                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                  Concentração média atual (calculada)
                                </div>
                                <div className="text-2xl font-bold tabular-nums text-primary">
                                  {Math.round(recomendacao.cenarioAtual.cavgSSNgdl)} <span className="text-sm font-normal text-muted-foreground">ng/dL</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[11px] text-muted-foreground">alvo desejado</div>
                                <div className="text-base font-semibold tabular-nums">
                                  {Math.round(recomendacao.cavgAlvoNgdl)} ng/dL
                                </div>
                                <div className={`text-[11px] font-medium ${
                                  Math.abs(recomendacao.cenarioAtual.cavgSSNgdl - recomendacao.cavgAlvoNgdl) < 50
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : recomendacao.cenarioAtual.cavgSSNgdl > recomendacao.cavgAlvoNgdl
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-amber-600 dark:text-amber-400"
                                }`}>
                                  {(() => {
                                    const d = recomendacao.cenarioAtual.cavgSSNgdl - recomendacao.cavgAlvoNgdl;
                                    if (Math.abs(d) < 50) return "no alvo";
                                    return `${d > 0 ? "+" : ""}${Math.round(d)} ng/dL`;
                                  })()}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="rounded-lg border border-border bg-background p-2">
                                <div className="text-[10px] text-muted-foreground">Pico atual</div>
                                <div className="font-mono font-semibold">{Math.round(recomendacao.cenarioAtual.cmaxSSNgdl)} ng/dL</div>
                              </div>
                              <div className="rounded-lg border border-border bg-background p-2">
                                <div className="text-[10px] text-muted-foreground">Vale atual</div>
                                <div className="font-mono font-semibold">{Math.round(recomendacao.cenarioAtual.cminSSNgdl)} ng/dL</div>
                              </div>
                              <div className="rounded-lg border border-border bg-background p-2">
                                <div className="text-[10px] text-muted-foreground">Tempo na faixa</div>
                                <div className={`font-mono font-semibold ${recomendacao.cenarioAtual.percentEugonadal >= 90 ? "text-emerald-600" : recomendacao.cenarioAtual.percentEugonadal >= 70 ? "text-amber-600" : "text-rose-600"}`}>
                                  {recomendacao.cenarioAtual.percentEugonadal.toFixed(0)}%
                                </div>
                              </div>
                            </div>

                            <Separator />

                            <div className="text-xs">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-muted-foreground">Sensibilidade à dose deste paciente</span>
                                <span className="font-mono font-semibold">
                                  {(recomendacao.fatorIndividual * 100).toFixed(0)}% da média
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Este paciente {recomendacao.classificacaoSensibilidade}. Cada miligrama de undecilato
                                gera <strong className="text-foreground">{recomendacao.fatorIndividual.toFixed(2)}×</strong> a
                                concentração que geraria em um paciente de resposta típica.
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Tabela comparativa de intervalos */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Comparação de intervalos (para este paciente)</CardTitle>
                            <CardDescription className="text-xs">
                              Predição de pico, vale e tempo na faixa eugonádica para diferentes espaçamentos entre as doses, mantendo a dose atual.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-0">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50 text-muted-foreground">
                                  <tr>
                                    <th className="text-left p-2 font-medium">Intervalo</th>
                                    <th className="text-right p-2 font-medium">Pico (Cmax)</th>
                                    <th className="text-right p-2 font-medium">Vale (Cmin)</th>
                                    <th className="text-right p-2 font-medium">Média (Cavg)</th>
                                    <th className="text-right p-2 font-medium">% na faixa</th>
                                    <th className="text-center p-2 font-medium">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recomendacao.intervalosAvaliados.map(a => {
                                    const eRecomendado = a.intervaloDias === recomendacao.intervaloRecomendadoDias;
                                    const statusBadge =
                                      a.status === "ideal" ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">ideal</Badge> :
                                      a.status === "aceitavel" ? <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">aceitável</Badge> :
                                      a.status === "vale_baixo" ? <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">vale baixo</Badge> :
                                      a.status === "pico_alto" ? <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30">pico alto</Badge> :
                                      <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30">fora</Badge>;
                                    return (
                                      <tr
                                        key={a.intervaloDias}
                                        className={`border-t border-border ${eRecomendado ? "bg-emerald-500/5" : ""}`}
                                      >
                                        <td className="p-2 font-medium">
                                          {eRecomendado && <span className="text-emerald-600 dark:text-emerald-400 mr-1">→</span>}
                                          {a.intervaloSemanas.toFixed(0)} sem
                                        </td>
                                        <td className={`text-right p-2 font-mono ${a.cmaxSSNgdl > EUGONADAL_MAX_NGDL ? "text-rose-600 dark:text-rose-400" : ""}`}>
                                          {Math.round(a.cmaxSSNgdl)}
                                        </td>
                                        <td className={`text-right p-2 font-mono ${a.cminSSNgdl < EUGONADAL_MIN_NGDL ? "text-amber-600 dark:text-amber-400" : ""}`}>
                                          {Math.round(a.cminSSNgdl)}
                                        </td>
                                        <td className="text-right p-2 font-mono">{Math.round(a.cavgSSNgdl)}</td>
                                        <td className="text-right p-2 font-mono">{a.percentEugonadal.toFixed(0)}%</td>
                                        <td className="p-2 text-center">{statusBadge}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
                              Faixa eugonádica de referência: {EUGONADAL_MIN_NGDL}–{EUGONADAL_MAX_NGDL} ng/dL · Vale acima de {EUGONADAL_MIN_NGDL} = sem hipogonadismo entre doses.
                            </div>
                          </CardContent>
                        </Card>

                        <div className="rounded-xl border border-amber-500/20 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                          <strong>Importante:</strong> a recomendação assume que as medidas informadas foram colhidas em estado estacionário (após a 4ª–5ª injeção) e usando o regime atual. Antes do estado estacionário, os valores ainda estão subindo e não refletem a sensibilidade real. Esta ferramenta é educacional — qualquer ajuste deve ser validado com novos exames e avaliação médica.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="info">
                <div className="mb-4 flex flex-col items-center text-center gap-3 py-6">
                  <LodiLogo size="lg" showTagline={true} />
                  <p className="text-xs text-muted-foreground max-w-xl mt-2">
                    Plataforma educacional de simulação farmacocinética para terapia hormonal com undecilato de testosterona (Nebido) — modelo de 2 compartimentos com absorção de 1ª ordem e variação populacional Monte Carlo.
                  </p>
                </div>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  <Card className="lodi-card">
                    <CardHeader>
                      <CardTitle className="text-sm">O que esta simulação faz?</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3 text-muted-foreground leading-relaxed">
                      <p>
                        Quando você toma uma injeção de undecilato de testosterona (Nebido), o medicamento fica
                        depositado no músculo e é liberado <strong className="text-foreground">muito devagar</strong> para a corrente sanguínea
                        — durante semanas, não minutos.
                      </p>
                      <p>
                        Esta ferramenta calcula, dia por dia, qual a concentração esperada de testosterona no sangue,
                        considerando:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>quanto entra (a injeção)</li>
                        <li>quanto se distribui pelo corpo (gordura, músculos)</li>
                        <li>quanto é eliminado (pelo fígado)</li>
                      </ul>
                      <p>
                        O resultado é a <strong className="text-foreground">curva neon ciano</strong> que você vê no gráfico.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="lodi-card">
                    <CardHeader>
                      <CardTitle className="text-sm">O que é "variação entre pacientes"?</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3 text-muted-foreground leading-relaxed">
                      <p>
                        Duas pessoas que tomam <strong className="text-foreground">a mesma dose</strong> não têm a mesma
                        concentração no sangue. Algumas atingem valores mais altos, outras mais baixos.
                      </p>
                      <p>Isso depende de fatores como:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>peso e composição corporal</li>
                        <li>velocidade do fígado em eliminar o hormônio</li>
                        <li>local da injeção, técnica, tipo de tecido</li>
                      </ul>
                      <p>
                        Quando a opção <em>"Mostrar variação entre pacientes"</em> está ativa, o programa simula
                        centenas de pacientes virtuais e mostra a faixa onde a maioria cai. As <strong className="text-foreground">áreas
                        violeta sombreadas</strong> no gráfico mostram essa variação.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="lodi-card">
                    <CardHeader>
                      <CardTitle className="text-sm">O que significam as cores?</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
                        <span><strong className="text-foreground">Abaixo de {EUGONADAL_MIN_NGDL} ng/dL — Hipogonádico:</strong> testosterona baixa demais. Pode causar fadiga, baixa libido, perda muscular.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />
                        <span><strong className="text-foreground">Entre {EUGONADAL_MIN_NGDL} e {EUGONADAL_MAX_NGDL} ng/dL — Faixa normal:</strong> valores típicos de um homem adulto saudável (referência harmonizada CDC / Endocrine Society). Esta é a zona-alvo do tratamento.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-500 mt-1 flex-shrink-0" />
                        <span><strong className="text-foreground">Acima de 1000 ng/dL — Acima do normal:</strong> pode causar efeitos adversos como aumento de hematócrito, retenção, alteração de humor.</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lodi-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Por que demora tanto a estabilizar?</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3 text-muted-foreground leading-relaxed">
                      <p>
                        O Nebido é um <strong className="text-foreground">depósito de liberação lenta</strong>. Cada injeção
                        leva cerca de 3 meses para terminar de ser absorvida pelo músculo.
                      </p>
                      <p>
                        Por isso, nas <strong className="text-foreground">primeiras 2–4 injeções</strong>, os níveis ainda não atingem o
                        platô final — a concentração vai aumentando gradualmente até estabilizar (geralmente entre o 3º e o 5º ano de
                        tratamento, dependendo do intervalo entre doses).
                      </p>
                      <p>
                        Por isso também, ajustes de dose só devem ser feitos depois de medir a testosterona em um momento
                        já estabilizado, normalmente <strong className="text-foreground">imediatamente antes da próxima injeção</strong> (no vale).
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="md:col-span-2 lodi-card">
                    <CardHeader>
                      <CardTitle className="text-sm">Detalhes técnicos (para quem quer entender mais)</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-3 text-muted-foreground">
                      <p>
                        Modelo farmacocinético de <strong className="text-foreground">2 compartimentos com absorção de 1ª ordem</strong>
                        e <em>efeito flip-flop</em>: a absorção (ka) é mais lenta que a eliminação (k10), tornando-se o fator limitante da curva.
                      </p>
                      <div className="font-mono bg-muted rounded p-2 space-y-1 text-[11px]">
                        <p>dA_depósito/dt = −ka · A_depósito</p>
                        <p>dA_central/dt = ka · A_dep − (k10+k12) · A_c + k21 · A_p</p>
                        <p>dA_periférico/dt = k12 · A_central − k21 · A_periférico</p>
                      </div>
                      <p>
                        Parâmetros (Nebido 1000 mg): ka = 0,049/dia (t½ absorção ≈ 14 dias);
                        k10 = 0,0077/dia; k12 = 0,012/dia; k21 = 0,006/dia.
                      </p>
                      <p>
                        Variação entre pacientes simulada por <strong className="text-foreground">método de Monte Carlo</strong>:
                        para cada paciente virtual, sorteia-se um conjunto de parâmetros a partir de distribuições log-normais
                        (CV de 30–45%) calibradas com dados de Behre, Nieschlag e Bhasin et al.
                      </p>
                      <p className="opacity-80">
                        Limitações: não inclui SHBG, variação circadiana, interações medicamentosas nem aromatização.
                        Para decisões clínicas reais, use exames laboratoriais do próprio paciente.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
