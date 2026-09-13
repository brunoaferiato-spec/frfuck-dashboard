import { useMemo } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CalendarClock } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Processo = {
  id: number;
  lojaNome: string;
  funcionarioNome: string;
  dataInicio: string;
  dataRetorno: string;
  status: string;
  avisoPendente: boolean;
  pagamentoSolicitado: boolean;
  pagamentoPendente: boolean;
};

function parseData(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

function diasAte(valor?: string | null) {
  const alvo = parseData(valor);
  if (!alvo) return null;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

export default function RHFeriasAlertas() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const role = String(user?.role || "");
  const lojaId = Number(user?.lojaId || 0);
  const podeVer = (role === "rh" && lojaId <= 0) || role === "admin" || role === "gestor";

  const query = trpc.rhFerias.listar.useQuery(
    { lojaId: null, funcionarioId: null, status: null },
    { enabled: podeVer, retry: false, refetchOnWindowFocus: true }
  );

  const vencimentosQuery = trpc.rhFerias.vencimentos.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const itens = useMemo(() => {
    const processos = (query.data || []) as Processo[];
    const vencimentos = (vencimentosQuery.data || []) as Array<any>;
    const lista: Array<{
      id: string;
      titulo: string;
      funcionario: string;
      loja: string;
      detalhe: string;
      prioridade: number;
    }> = [];

    for (const item of vencimentos) {
      const dias = Number(item.diasAteLimiteRetorno);
      const diasInicio30 = Number(item.diasAteUltimoInicio30);

      if (dias <= 120) {
        let titulo = "Planejar férias";
        let prioridade = 4;

        if (dias < 0) {
          titulo = "Limite de férias ultrapassado";
          prioridade = 1;
        } else if (diasInicio30 <= 0) {
          titulo = "Prazo crítico para programar férias";
          prioridade = 1;
        } else if (diasInicio30 <= 30) {
          titulo = "Programar férias imediatamente";
          prioridade = 1;
        } else if (diasInicio30 <= 45) {
          titulo = "Férias em situação crítica";
          prioridade = 2;
        } else if (diasInicio30 <= 60) {
          titulo = "Prioridade no planejamento de férias";
          prioridade = 2;
        } else if (diasInicio30 <= 90) {
          titulo = "Atenção ao planejamento de férias";
          prioridade = 3;
        }

        lista.push({
          id: `vencimento-${item.funcionarioId}-${item.periodoAquisitivoInicio}`,
          titulo,
          funcionario: item.funcionarioNome,
          loja: item.lojaNome,
          detalhe:
            dias < 0
              ? `Limite era ${formatarData(item.dataLimiteRetorno)}`
              : `Retorno até ${formatarData(item.dataLimiteRetorno)}`,
          prioridade,
        });
      }
    }

    for (const processo of processos) {
      if (processo.status === "cancelada" || processo.status === "concluida") continue;
      const inicio = diasAte(processo.dataInicio);
      const retorno = diasAte(processo.dataRetorno);

      if (processo.avisoPendente && inicio !== null && inicio <= 30) {
        lista.push({
          id: `${processo.id}-aviso`,
          titulo: inicio === 30 ? "Aviso de férias vence hoje" : "Aviso de férias em atenção",
          funcionario: processo.funcionarioNome,
          loja: processo.lojaNome,
          detalhe: `Início ${formatarData(processo.dataInicio)}`,
          prioridade: 1,
        });
      }

      if (!processo.avisoPendente && !processo.pagamentoSolicitado && inicio !== null && inicio <= 5) {
        lista.push({
          id: `${processo.id}-liberar`,
          titulo: "Liberar pagamento para a Caixa",
          funcionario: processo.funcionarioNome,
          loja: processo.lojaNome,
          detalhe: `Início ${formatarData(processo.dataInicio)}`,
          prioridade: inicio <= 2 ? 1 : 2,
        });
      }

      if (processo.pagamentoSolicitado && processo.pagamentoPendente && inicio !== null && inicio <= 2) {
        lista.push({
          id: `${processo.id}-pagamento`,
          titulo: "Pagamento de férias pendente",
          funcionario: processo.funcionarioNome,
          loja: processo.lojaNome,
          detalhe: `Início ${formatarData(processo.dataInicio)}`,
          prioridade: 1,
        });
      }

      if (processo.status === "em_ferias" && retorno !== null && retorno >= 0 && retorno <= 1) {
        lista.push({
          id: `${processo.id}-retorno`,
          titulo: retorno === 0 ? "Retorno de férias hoje" : "Retorno de férias amanhã",
          funcionario: processo.funcionarioNome,
          loja: processo.lojaNome,
          detalhe: `Retorno ${formatarData(processo.dataRetorno)}`,
          prioridade: 3,
        });
      }
    }

    return lista.sort((a, b) => a.prioridade - b.prioridade).slice(0, 8);
  }, [query.data, vencimentosQuery.data]);

  if (
    !podeVer ||
    query.isLoading ||
    vencimentosQuery.isLoading ||
    itens.length === 0
  ) {
    return null;
  }

  return (
    <section className="mb-5">
      <Card className="overflow-hidden border-amber-400/20 bg-gradient-to-br from-amber-950/20 via-[#100d08] to-[#090909]">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-amber-400/15 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-2.5">
                <CalendarClock className="h-5 w-5 text-amber-200" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-white">Alertas de férias</h2>
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1 text-[10px] font-black text-amber-200">
                    {itens.length} atenção{itens.length === 1 ? "" : "ões"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Prazos e documentos que precisam de ação.</p>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => navigate("/rh/ferias/planejamento")}
              className="shrink-0 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
            >
              Planejamento
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-px bg-white/[0.05] lg:grid-cols-2">
            {itens.map((item) => (
              <div key={item.id} className="bg-[#0a0907] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-amber-200">{item.titulo}</p>
                    <p className="mt-1 truncate text-sm font-black text-white">{item.funcionario}</p>
                    <p className="mt-1 text-xs text-gray-500">{item.loja} • {item.detalhe}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
