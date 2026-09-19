import { useMemo } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CalendarClock, PackageCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ITENS_EPI: Record<string, string> = {
  luva: "Luva",
  protetor_ouvido: "Protetor de ouvido",
  creme_protecao: "Creme de proteção",
  oculos_protecao: "Óculos de proteção",
  oculos: "Óculos",
  botina: "Botina",
  uniforme: "Uniforme",
};

type EntregaEpiAlerta = {
  id: number;
  lojaId: number;
  lojaNome: string;
  funcionarioId: number;
  funcionarioNome: string;
  item: string;
  dataEntrega: string;
  proximaTroca?: string | null;
};

function dataCivilHoje() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function dataParaNumero(valor?: string | null) {
  if (!valor) return 0;
  return Number(String(valor).slice(0, 10).replace(/-/g, "")) || 0;
}

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}`;
}

function diasVencido(valor?: string | null) {
  if (!valor) return 0;

  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return 0;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const vencimento = new Date(ano, mes - 1, dia);

  return Math.floor((inicioHoje.getTime() - vencimento.getTime()) / 86_400_000);
}

function situacaoPrazo(valor?: string | null) {
  const atraso = diasVencido(valor);

  if (atraso >= 1) {
    return {
      faixa: "vencido",
      label: `${atraso} dia${atraso === 1 ? "" : "s"} vencido${atraso === 1 ? "" : "s"}`,
      classe: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200",
    };
  }

  if (atraso === 0) {
    return {
      faixa: "ate7",
      label: "Troca hoje",
      classe: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200",
    };
  }

  const faltam = Math.abs(atraso);

  if (faltam <= 7) {
    return {
      faixa: "ate7",
      label: `Troca em ${faltam} dia${faltam === 1 ? "" : "s"}`,
      classe: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
    };
  }

  if (faltam <= 15) {
    return {
      faixa: "ate15",
      label: `Troca em ${faltam} dias`,
      classe: "border-orange-400/20 bg-orange-400/[0.06] text-orange-200",
    };
  }

  return {
    faixa: "ate30",
    label: `Troca em ${faltam} dias`,
    classe: "border-sky-400/20 bg-sky-400/[0.05] text-sky-200",
  };
}


export default function RHEpiAlertas() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);

  const caixaLider = role === "rh" && lojaUsuario > 0;
  const liderRh = role === "rh" && lojaUsuario <= 0;
  const adminOuGestor = role === "admin" || role === "gestor";
  const podeVer = caixaLider || liderRh || adminOuGestor;

  const query = trpc.rhEpis.listar.useQuery(
    {
      lojaId: caixaLider ? lojaUsuario : null,
      funcionarioId: null,
      item: null,
      dataInicio: null,
      dataFim: null,
    },
    {
      enabled: podeVer,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  const alertas = useMemo(() => {
    const entregas = (query.data || []) as EntregaEpiAlerta[];
    const maisRecente = new Map<string, EntregaEpiAlerta>();

    for (const entrega of entregas) {
      if (!entrega.proximaTroca) continue;

      const chave = `${entrega.lojaId}:${entrega.funcionarioId}:${entrega.item}`;
      const atual = maisRecente.get(chave);

      if (
        !atual ||
        dataParaNumero(entrega.dataEntrega) > dataParaNumero(atual.dataEntrega) ||
        (
          dataParaNumero(entrega.dataEntrega) === dataParaNumero(atual.dataEntrega) &&
          Number(entrega.id) > Number(atual.id)
        )
      ) {
        maisRecente.set(chave, entrega);
      }
    }

    return Array.from(maisRecente.values())
      .filter((entrega) => diasVencido(entrega.proximaTroca) >= -30)
      .sort((a, b) => {
        const atrasoA = diasVencido(a.proximaTroca);
        const atrasoB = diasVencido(b.proximaTroca);
        if (atrasoA !== atrasoB) return atrasoB - atrasoA;
        return a.funcionarioNome.localeCompare(b.funcionarioNome, "pt-BR");
      });
  }, [query.data]);

  const resumoPrazos = alertas.reduce(
    (resumo, entrega) => {
      const situacao = situacaoPrazo(entrega.proximaTroca);

      if (situacao.faixa === "vencido") resumo.vencidos += 1;
      else if (situacao.faixa === "ate7") resumo.ate7 += 1;
      else if (situacao.faixa === "ate15") resumo.ate15 += 1;
      else resumo.ate30 += 1;

      return resumo;
    },
    { vencidos: 0, ate7: 0, ate15: 0, ate30: 0 }
  );

  if (!podeVer || query.isLoading || alertas.length === 0) {
    return null;
  }

  const porLoja = new Map<number, number>();
  for (const alerta of alertas) {
    porLoja.set(alerta.lojaId, (porLoja.get(alerta.lojaId) || 0) + 1);
  }

  return (
    <section className="mb-5">
      <Card className="overflow-hidden border-rose-400/25 bg-gradient-to-br from-rose-950/30 via-[#11090b] to-[#090909]">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 border-b border-rose-400/15 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.08] p-2.5">
                <AlertTriangle className="h-5 w-5 text-rose-300" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-white">Alertas de troca de EPI</h2>
                  <span className="rounded-full border border-rose-400/25 bg-rose-400/[0.08] px-2.5 py-1 text-[10px] font-black text-rose-200">
                    {alertas.length} pendente{alertas.length === 1 ? "" : "s"}
                  </span>
                </div>

                <p className="mt-1 text-xs leading-5 text-rose-100/65">
                  Acompanhamento preventivo de 30, 15 e 7 dias. O alerta some automaticamente quando uma nova entrega do mesmo EPI é registrada.
                </p>
                <p className="mt-2 text-[11px] font-bold text-gray-400">
                  {resumoPrazos.vencidos} vencido{resumoPrazos.vencidos === 1 ? "" : "s"}
                  {" • "}
                  {resumoPrazos.ate7} até 7 dias
                  {" • "}
                  {resumoPrazos.ate15} em 8–15 dias
                  {" • "}
                  {resumoPrazos.ate30} em 16–30 dias
                </p>

                {!caixaLider && porLoja.size > 1 && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {porLoja.size} lojas com troca de EPI atrasada.
                  </p>
                )}
              </div>
            </div>

            <Button
              type="button"
              onClick={() => navigate("/rh/epis")}
              className="shrink-0 bg-rose-300 font-black text-black hover:bg-rose-200"
            >
              Regularizar EPIs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[290px] overflow-y-auto">
            {alertas.map((alerta) => {
              const situacao = situacaoPrazo(alerta.proximaTroca);

              return (
                <div
                  key={`${alerta.lojaId}-${alerta.funcionarioId}-${alerta.item}`}
                  className="flex flex-col gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-white">
                        {alerta.funcionarioNome}
                      </p>

                      {!caixaLider && (
                        <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-bold text-gray-400">
                          {alerta.lojaNome}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1.5 text-[#F2D675]">
                        <PackageCheck className="h-3.5 w-3.5" />
                        {ITENS_EPI[alerta.item] || alerta.item}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Troca prevista: {formatarData(alerta.proximaTroca)}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${situacao.classe}`}
                  >
                    {situacao.label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
