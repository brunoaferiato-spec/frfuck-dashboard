import { useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowRight, FileWarning, UserMinus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function labelFase(fase?: string | null) {
  if (fase === "preparar_documentos") return "Preparar documentos";
  if (fase === "enviar_contabilidade") return "Enviar ao portal da contabilidade";
  if (fase === "aguardando_contabilidade") return "Aguardando retorno da contabilidade";
  if (fase === "conferir_rescisao") return "Conferir rescisão";
  if (fase === "lancar_contas_pagar") return "Lançar no Contas a Pagar";
  if (fase === "anexar_comprovante_pagamento") return "Anexar comprovante de pagamento";
  if (fase === "confirmar_pagamento") return "Confirmar pagamento";
  if (fase === "operacional_concluido") return "Operacional concluído";
  return fase || "Em andamento";
}

export default function RHRescisaoAlertas() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const role = String(user?.role || "");
  const lojaId = Number(user?.lojaId || 0);
  const podeVer =
    (role === "rh" && lojaId <= 0) || role === "admin" || role === "gestor";

  const query = trpc.rhRescisoes.listar.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const resumo = useMemo(() => {
    const itens = (query.data || []) as Array<any>;
    const novos = itens.filter((item) => item.status === "aguardando_rh");
    const ativos = itens.filter(
      (item) =>
        !["cancelada", "concluida"].includes(String(item.status)) &&
        item.faseOperacional !== "operacional_concluido"
    );

    const destaques = [...novos, ...ativos.filter((item) => item.status !== "aguardando_rh")]
      .slice(0, 4);

    return {
      novos,
      ativos,
      destaques,
    };
  }, [query.data]);

  if (!podeVer || query.isLoading) return null;

  return (
    <section className="mb-5">
      <Card
        className={
          resumo.novos.length > 0
            ? "overflow-hidden border-rose-400/20 bg-gradient-to-br from-rose-950/15 via-[#0b0b0b] to-[#090909]"
            : resumo.ativos.length > 0
            ? "overflow-hidden border-amber-400/20 bg-gradient-to-br from-amber-950/10 via-[#0b0b0b] to-[#090909]"
            : "overflow-hidden border-[#D4AF37]/20 bg-[#0b0b0b]"
        }
      >
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-2.5">
                <UserMinus className="h-5 w-5 text-[#F2D675]" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-white">Rescisões</h2>

                  {resumo.novos.length > 0 && (
                    <span className="rounded-full border border-rose-400/25 bg-rose-400/[0.08] px-2.5 py-1 text-[10px] font-black text-rose-200">
                      {resumo.novos.length} novo{resumo.novos.length === 1 ? "" : "s"} pedido{resumo.novos.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs text-gray-500">
                  {resumo.ativos.length} processo{resumo.ativos.length === 1 ? "" : "s"} operacional{resumo.ativos.length === 1 ? "" : "is"} ativo{resumo.ativos.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => navigate("/rh/rescisoes")}
              className="bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
            >
              Gerenciar rescisões
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {resumo.destaques.length > 0 ? (
            <div className="grid gap-px bg-white/[0.05] lg:grid-cols-2">
              {resumo.destaques.map((item) => (
                <div key={item.id} className="bg-[#090909] p-4">
                  <div className="flex items-start gap-3">
                    <FileWarning
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        item.status === "aguardando_rh"
                          ? "text-rose-300"
                          : "text-amber-300"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {item.funcionarioNome}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.lojaNome} •{" "}
                        {item.origem === "pedido_demissao"
                          ? `pedido em ${formatarData(item.dataSolicitacao)}`
                          : `desligamento ${formatarData(item.dataPrevistaDesligamento)}`}
                      </p>

                      {item.status === "aguardando_rh" && (
                        <p className="mt-1 text-xs font-bold text-rose-200">
                          Novo pedido • aguardando recebimento do RH
                        </p>
                      )}

                      <p className="mt-1 text-xs font-bold text-[#F2D675]">
                        Caixa: {labelFase(item.faseOperacional)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-500 sm:px-5">
              Nenhuma rescisão aguardando ação neste momento.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
