import { useState, useCallback, useMemo } from "react";
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
  BarChart2,
  FlaskConical,
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
  PARAMETROS_POPULACIONAIS,
  NMOL_TO_NGDL,
  NGDL_TO_NMOL,
  type PontoCurva,
  type ResultadoMonteCarlo,
  type MetricasPK,
} from "@/lib/pk-engine";

const EUGONADAL_MIN_NGDL = 300;
const EUGONADAL_MAX_NGDL = 1000;
const EUGONADAL_MIN_NMOL = EUGONADAL_MIN_NGDL / NMOL_TO_NGDL;
const EUGONADAL_MAX_NMOL = EUGONADAL_MAX_NGDL / NMOL_TO_NGDL;

type UnidadeConc = "ngdl" | "nmol";

interface ConfigSimulador {
  doseMg: number;
  intervaloDias: number;
  nDoses: number;
  unidade: UnidadeConc;
  mostrarMonteCarlo: boolean;
  nSimulacoesMC: number;
}

const CONFIG_INICIAL: ConfigSimulador = {
  doseMg: 1000,
  intervaloDias: 84,  // 12 semanas
  nDoses: 8,
  unidade: "ngdl",
  mostrarMonteCarlo: true,
  nSimulacoesMC: 150,
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
    () => gerarCronograma(config.doseMg, config.intervaloDias, config.nDoses),
    [config.doseMg, config.intervaloDias, config.nDoses]
  );

  const horDias = Math.max(config.nDoses * config.intervaloDias + 90, 365);

  const perfilMediano = useMemo(
    () =>
      simularPerfil(doses, PARAMETROS_POPULACIONAIS, {
        passoDias: 1,
        horizonteDias: horDias,
      }),
    [doses, horDias]
  );

  const metricas: MetricasPK = useMemo(
    () => calcularMetricas(perfilMediano),
    [perfilMediano]
  );

  // Métricas clínicas adicionais: 1ª dose isolada e steady-state
  const metricasClinicas = useMemo(() => {
    if (perfilMediano.length === 0) return null;

    // Cmax 1ª dose: simular dose única isolada (sem acúmulo) por 200 dias
    const perfilDoseUnica = simularPerfil(
      [{ diaDose: 0, doseMg: doses[0]?.doseMg ?? 1000 }],
      PARAMETROS_POPULACIONAIS,
      { passoDias: 1, horizonteDias: 200 }
    );
    let cmax1a = 0, tmax1a = 0;
    for (const p of perfilDoseUnica) {
      if (p.ngdl > cmax1a) { cmax1a = p.ngdl; tmax1a = p.dia; }
    }

    // Cmin de steady-state: nadir na última janela inter-dose completa
    const ultimasDuas = doses.length >= 2 ? doses[doses.length - 2].diaDose : 0;
    const ssRegiao = perfilMediano.filter(p => p.dia >= ultimasDuas && p.dia <= ultimasDuas + config.intervaloDias);
    const cminSS = ssRegiao.length > 0 ? Math.min(...ssRegiao.map(p => p.ngdl)) : 0;
    // Cmax steady-state: pico na última janela completa
    const cmaxSS = ssRegiao.length > 0 ? Math.max(...ssRegiao.map(p => p.ngdl)) : 0;

    return { cmax1a, tmax1a, cminSS, cmaxSS };
  }, [perfilMediano, doses, config.intervaloDias]);

  const [resultadoMC, setResultadoMC] = useState<ResultadoMonteCarlo | null>(null);
  const [mcConcluido, setMcConcluido] = useState(false);

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
    const { cmaxMediaNgdl, cmaxDpNgdl } = resultadoMC.metricasPopulacionais;
    const bins = 15;
    const min = Math.max(0, cmaxMediaNgdl - 3 * cmaxDpNgdl);
    const max = cmaxMediaNgdl + 3 * cmaxDpNgdl;
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

  const xTickFormatter = (v: number) => `${Math.round(v)}w`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">Simulador PK — TU Intramuscular</h1>
            <p className="text-xs text-muted-foreground">Modelo de 2 compartimentos · Nebido 1000 mg · Monte Carlo</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <Activity className="w-3 h-3" />
          Uso educacional
        </Badge>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Painel de controles */}
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border p-4 flex flex-col gap-4 bg-card overflow-y-auto">
          <div>
            <h2 className="text-sm font-semibold mb-3 text-foreground">Esquema Posológico</h2>

            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs text-muted-foreground">Dose por injeção</Label>
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

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs text-muted-foreground">Intervalo entre doses</Label>
                  <span className="text-xs font-mono font-medium">{config.intervaloDias}d ({(config.intervaloDias / 7).toFixed(0)}sem)</span>
                </div>
                <Slider
                  data-testid="slider-intervalo"
                  min={42} max={168} step={7}
                  value={[config.intervaloDias]}
                  onValueChange={([v]) => setConfig(c => ({ ...c, intervaloDias: v }))}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>6 sem</span><span>24 sem</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs text-muted-foreground">Número de doses</Label>
                  <span className="text-xs font-mono font-medium">{config.nDoses} doses</span>
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
            <h2 className="text-sm font-semibold mb-3">Visualização</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Unidade</Label>
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

              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Monte Carlo (IIV)</Label>
                <Switch
                  data-testid="switch-mc"
                  checked={config.mostrarMonteCarlo}
                  onCheckedChange={v => setConfig(c => ({ ...c, mostrarMonteCarlo: v }))}
                />
              </div>

              {config.mostrarMonteCarlo && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs text-muted-foreground">Simulações MC</Label>
                    <span className="text-xs font-mono font-medium">{config.nSimulacoesMC}</span>
                  </div>
                  <Slider
                    data-testid="slider-mc"
                    min={50} max={500} step={50}
                    value={[config.nSimulacoesMC]}
                    onValueChange={([v]) => setConfig(c => ({ ...c, nSimulacoesMC: v }))}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>50</span><span>500</span>
                  </div>
                  <Button
                    data-testid="btn-executar-mc"
                    variant="default"
                    size="sm"
                    className="w-full mt-1"
                    onClick={executarMC}
                    disabled={isCalculating}
                  >
                    {isCalculating ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                        Calculando...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4" />
                        {mcConcluido ? "Recalcular MC" : "Executar Monte Carlo"}
                      </span>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Cronograma de doses */}
          <div>
            <h2 className="text-sm font-semibold mb-2">Cronograma</h2>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {doses.map((d, i) => (
                <div key={i} className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground">{d.rotulo}</span>
                  <span className="font-mono text-foreground">
                    dia {d.diaDose} ({(d.diaDose / 7).toFixed(0)}ª sem)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Área principal */}
        <main className="flex-1 flex flex-col overflow-y-auto">
          {/* Métricas clínicas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-border">
            {/* Cmax 1ª dose */}
            {(() => {
              const val = config.unidade === "ngdl"
                ? (metricasClinicas?.cmax1a ?? metricas.cmaxNgdl)
                : (metricasClinicas?.cmax1a ?? metricas.cmaxNgdl) * NGDL_TO_NMOL;
              const st = statusEugonadal(val, config.unidade);
              return (
                <MetricCard
                  label="Cmax (1ª dose)"
                  value={fmt(val, config.unidade)}
                  sub={`Tmax: ~dia ${Math.round(metricasClinicas?.tmax1a ?? metricas.tmaxDias)}`}
                  icon={<TrendingUp className="w-3 h-3" />}
                  statusClass={STATUS_COLOR[st]}
                />
              );
            })()}
            {/* Cmin SS */}
            {(() => {
              const val = config.unidade === "ngdl"
                ? (metricasClinicas?.cminSS ?? metricas.cminNgdl)
                : (metricasClinicas?.cminSS ?? metricas.cminNgdl) * NGDL_TO_NMOL;
              const st = statusEugonadal(val, config.unidade);
              return (
                <MetricCard
                  label="Cmin (nadir SS)"
                  value={fmt(val, config.unidade)}
                  sub={STATUS_LABEL[st]}
                  icon={STATUS_ICON[st]}
                  statusClass={STATUS_COLOR[st]}
                />
              );
            })()}
            {/* Cmax SS */}
            {(() => {
              const val = config.unidade === "ngdl"
                ? (metricasClinicas?.cmaxSS ?? metricas.cmaxNgdl)
                : (metricasClinicas?.cmaxSS ?? metricas.cmaxNgdl) * NGDL_TO_NMOL;
              const st = statusEugonadal(val, config.unidade);
              return (
                <MetricCard
                  label="Cmax (SS)"
                  value={fmt(val, config.unidade)}
                  sub="Pico em steady-state"
                  icon={<Activity className="w-3 h-3" />}
                  statusClass={STATUS_COLOR[st]}
                />
              );
            })()}
            <MetricCard
              label="Steady-state aprox."
              value={`~${metricas.steadyStateSemana} sem`}
              sub={`t½ aparente ~${Math.round(metricas.t12AparenteDias)} d`}
              icon={<Clock className="w-3 h-3" />}
            />
          </div>

          {/* Monte Carlo métricas se disponível */}
          {resultadoMC && config.mostrarMonteCarlo && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b border-border bg-muted/30">
              <div className="col-span-2 sm:col-span-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Resultados Monte Carlo — {resultadoMC.nSimulacoes} simulações (variabilidade interindividual)
                </p>
              </div>
              <MetricCard
                label="Cmax média ± DP"
                value={`${Math.round(resultadoMC.metricasPopulacionais.cmaxMediaNgdl)} ± ${Math.round(resultadoMC.metricasPopulacionais.cmaxDpNgdl)} ng/dL`}
                sub={`${(resultadoMC.metricasPopulacionais.cmaxDpNgdl / resultadoMC.metricasPopulacionais.cmaxMediaNgdl * 100).toFixed(0)}% CV`}
              />
              <MetricCard
                label="Cmin SS média ± DP"
                value={`${Math.round(resultadoMC.metricasPopulacionais.cminMediaNgdl)} ± ${Math.round(resultadoMC.metricasPopulacionais.cminDpNgdl)} ng/dL`}
                sub="Após 6 meses"
              />
              <MetricCard
                label="Tempo eugonádico"
                value={`${resultadoMC.metricasPopulacionais.percentEugonadal.toFixed(0)}%`}
                sub="300–1000 ng/dL (SS)"
                statusClass={
                  resultadoMC.metricasPopulacionais.percentEugonadal >= 70
                    ? STATUS_COLOR.normal
                    : STATUS_COLOR.baixo
                }
              />
              <MetricCard
                label="IC 90% (P5–P95)"
                value="Visível no gráfico"
                sub="Área sombreada azul"
              />
            </div>
          )}

          {/* Gráficos */}
          <div className="flex-1 p-4">
            <Tabs value={aba} onValueChange={setAba}>
              <TabsList className="mb-4">
                <TabsTrigger value="grafico" data-testid="tab-grafico">Perfil de concentração</TabsTrigger>
                <TabsTrigger value="info" data-testid="tab-info">Informações do modelo</TabsTrigger>
              </TabsList>

              <TabsContent value="grafico" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Testosterona Sérica — TU IM {config.doseMg} mg / {(config.intervaloDias / 7).toFixed(0)} sem
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Modelo de 2 compartimentos com efeito flip-flop.
                      {config.mostrarMonteCarlo && resultadoMC
                        ? " Área azul clara = IC 90% (P5–P95); área azul = P25–P75; linha = mediana."
                        : " Linha = perfil com parâmetros populacionais médios."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-2">
                    <ResponsiveContainer width="100%" height={340}>
                      <ComposedChart data={dadosGrafico} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                        <XAxis
                          dataKey="semana"
                          tickFormatter={xTickFormatter}
                          label={{ value: "Semanas", position: "insideBottomRight", offset: -10, fontSize: 11 }}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          label={{ value: unLabel, angle: -90, position: "insideLeft", fontSize: 11, offset: 10 }}
                          tick={{ fontSize: 10 }}
                          width={55}
                        />
                        <Tooltip
                          content={<CustomTooltipMC unidade={config.unidade} />}
                        />

                        {/* Zona eugonadal */}
                        <ReferenceArea
                          y1={eugMin} y2={eugMax}
                          fill="#22c55e" fillOpacity={0.07}
                          label={{ value: "Eugonádico", position: "insideTopRight", fontSize: 10, fill: "#16a34a" }}
                        />
                        <ReferenceLine y={eugMin} stroke="#16a34a" strokeDasharray="4 4" strokeWidth={1} label={{ value: `${eugMin.toFixed(config.unidade === "nmol" ? 1 : 0)}`, position: "right", fontSize: 9, fill: "#16a34a" }} />
                        <ReferenceLine y={eugMax} stroke="#16a34a" strokeDasharray="4 4" strokeWidth={1} label={{ value: `${eugMax.toFixed(config.unidade === "nmol" ? 1 : 0)}`, position: "right", fontSize: 9, fill: "#16a34a" }} />

                        {/* Marcadores de doses */}
                        {doses.map((d, i) => (
                          <ReferenceLine
                            key={i}
                            x={d.diaDose / 7}
                            stroke="#6366f1"
                            strokeWidth={1}
                            strokeDasharray="2 4"
                            opacity={0.5}
                          />
                        ))}

                        {config.mostrarMonteCarlo && resultadoMC ? (
                          <>
                            {/* IC 90%: banda P5-P95 */}
                            <Area
                              type="monotone"
                              dataKey="bandaIC90"
                              stroke="none"
                              fill="#3b82f6"
                              fillOpacity={0.12}
                              name="IC 90% (P5–P95)"
                              dot={false}
                              activeDot={false}
                              legendType="square"
                            />
                            {/* IQ 50%: banda P25-P75 */}
                            <Area
                              type="monotone"
                              dataKey="bandaIQ50"
                              stroke="none"
                              fill="#3b82f6"
                              fillOpacity={0.25}
                              name="IQ 50% (P25–P75)"
                              dot={false}
                              activeDot={false}
                              legendType="square"
                            />
                            {/* Linha mediana */}
                            <Line
                              type="monotone"
                              dataKey="conc"
                              stroke="#2563eb"
                              strokeWidth={2}
                              dot={false}
                              name="Mediana MC"
                            />
                          </>
                        ) : (
                          <Line
                            type="monotone"
                            dataKey="conc"
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            dot={false}
                            name="Concentração"
                          />
                        )}

                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Brush
                          dataKey="semana"
                          height={20}
                          stroke="hsl(var(--border))"
                          tickFormatter={xTickFormatter}
                          travellerWidth={6}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Aviso clínico */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>Aviso:</strong> Esta ferramenta é exclusivamente para fins educacionais e exploratórios.
                  Não substitui julgamento clínico, monitorização laboratorial (dosagem sérica) nem decisão médica individualizada.
                  O ajuste de dose deve ser guiado por níveis séricos reais e avaliação clínica.
                </div>
              </TabsContent>

              <TabsContent value="info">
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Modelo farmacocinético</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-3 text-muted-foreground">
                      <p>
                        <strong className="text-foreground">Modelo de 2 compartimentos</strong> com efeito flip-flop:
                        absorção do depósito IM é mais lenta que a eliminação, tornando-a o fator limitante da curva de declínio.
                      </p>
                      <div className="font-mono bg-muted rounded p-2 space-y-1 text-[11px]">
                        <p>dA_depósito/dt = −ka · A_depósito</p>
                        <p>dA_central/dt = ka · A_dep − (k10+k12) · A_c + k21 · A_p</p>
                        <p>dA_periférico/dt = k12 · A_central − k21 · A_periférico</p>
                        <p>C_plasma = A_central · Vd_fator</p>
                      </div>
                      <div className="space-y-1">
                        <p><strong className="text-foreground">Parâmetros populacionais médios (Nebido 1000mg):</strong></p>
                        <p>ka = 0,05 /dia (t½ absorção ≈ 14 dias)</p>
                        <p>k10 = 0,008 /dia (eliminação terminal)</p>
                        <p>k12 = 0,012, k21 = 0,006 /dia (distribuição)</p>
                        <p>t½ aparente ≈ 90 dias (dominado por ka)</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Variabilidade interindividual (Monte Carlo)</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-3 text-muted-foreground">
                      <p>
                        Cada simulação sorteia parâmetros individuais a partir de distribuições log-normais,
                        refletindo a variabilidade farmacogenética e fisiológica real da população.
                      </p>
                      <div className="space-y-1">
                        <p><strong className="text-foreground">Coeficientes de variação (CV%) utilizados:</strong></p>
                        <p>ka: 35% — variabilidade no volume/viscosidade do depósito</p>
                        <p>k10: 40% — variabilidade enzimática (CYP, 5α-redutase)</p>
                        <p>k12/k21: 30% — variabilidade de distribuição</p>
                        <p>Vd: 35% — composição corporal, gordura</p>
                        <p>Biodisponibilidade: 20%</p>
                      </div>
                      <p className="mt-2">
                        Os percentis P5–P95 (IC 90%) e P25–P75 (IQ 50%) são representados no gráfico como áreas sombreadas.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Faixas de referência</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                        <span><strong className="text-foreground">{"< 300 ng/dL"}</strong> — Hipogonádico (sintomas possíveis)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span><strong className="text-foreground">300–1000 ng/dL</strong> — Eugonádico (alvo terapêutico)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <span><strong className="text-foreground">{"> 1000 ng/dL"}</strong> — Suprafisiológico (risco de policitemia)</span>
                      </div>
                      <Separator className="my-2" />
                      <p>
                        <strong className="text-foreground">Steady-state:</strong> Atingido em ≈ 4–5 meias-vidas aparentes (~360–450 dias).
                        Ajustes de dose antes do SS podem resultar em acúmulo excessivo.
                      </p>
                      <p>
                        <strong className="text-foreground">Fenômeno flip-flop:</strong> A fase de declínio reflete a absorção do depósito
                        (ka), não a eliminação hepática (k10). A meia-vida aparente de ~90 dias é essencialmente a meia-vida de liberação.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Referências e limitações</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2 text-muted-foreground">
                      <p>
                        Parâmetros PK baseados em: Bhasin S et al. (2001); Behre HM, Nieschlag E (2012);
                        ficha técnica Nebido® (Bayer); Rahnema CD et al. (2014).
                      </p>
                      <p>
                        O modelo simplifica a farmacocinética real — não inclui metabolismo de ésteres,
                        ligação à SHBG, variação circadiana, nem interações farmacológicas.
                      </p>
                      <p>
                        Para decisões clínicas individualizadas, o <strong className="text-foreground">Bayesian Forecasting</strong> com
                        níveis séricos reais do paciente oferece predições muito mais precisas.
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
