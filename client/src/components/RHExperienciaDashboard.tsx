import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, Clock3, UserCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Item = {
  funcionarioId: number;
  funcionarioNome: string;
  lojaId: number;
  lojaNome: string;
  dataAdmissao: string;
  fimPrimeiroPeriodo: string;
  fimSegundoPeriodo: string;
  primeiraDecisao?: "prorrogar" | "encerrar" | null;
  segundaDecisao?: "efetivar" | "encerrar" | null;
};

const LOJAS_RH = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

function nomeLoja(lojaId: number, fallback?: string | null) {
  return LOJAS_RH.find((loja) => loja.id === Number(lojaId))?.nome || fallback || `Loja ${lojaId}`;
}

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

export default function RHExperienciaDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const role = String(user?.role || "");
  const lojaId = Number(user?.lojaId || 0);
  const podeVer = (role === "rh" && lojaId <= 0) || role === "admin" || role === "gestor";
  const [lojaFiltro, setLojaFiltro] = useState("todas");

  const query = trpc.rhExperiencia.listar.useQuery(undefined, {
    enabled: podeVer,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const lojasDisponiveis = useMemo(() => {
    const itens = (query.data || []) as Item[];
    const idsPresentes = new Set(
      itens
        .map((item) => Number(item.lojaId))
        .filter((id) => Number.isFinite(id) && id > 0)
    );

    return LOJAS_RH.filter((loja) => idsPresentes.has(loja.id));
  }, [query.data]);

  const dados = useMemo(() => {
    const todos = (query.data || []) as Item[];
    const itens =
      lojaFiltro === "todas"
        ? todos
        : todos.filter((item) => Number(item.lojaId) === Number(lojaFiltro));

    const ativos: Array<{
      funcionarioId: number;
      funcionarioNome: string;
      lojaNome: string;
      etapa: string;
      prazo: string;
      dias: number;
    }> = [];

    let primeiro = 0;
    let segundo = 0;

    for (const item of itens) {
      if (item.primeiraDecisao === "encerrar" || item.segundaDecisao) continue;

      const noSegundo = item.primeiraDecisao === "prorrogar";
      const prazo = noSegundo ? item.fimSegundoPeriodo : item.fimPrimeiroPeriodo;
      const dias = diasAte(prazo);
      if (dias === null) continue;

      if (noSegundo) segundo += 1;
      else primeiro += 1;

      const limiteAlerta = noSegundo ? 15 : 10;
      if (dias <= limiteAlerta) {
        ativos.push({
          funcionarioId: item.funcionarioId,
          funcionarioNome: item.funcionarioNome,
          lojaNome: nomeLoja(item.lojaId, item.lojaNome),
          etapa: noSegundo ? "2º período" : "1º período",
          prazo,
          dias,
        });
      }
    }

    ativos.sort((a, b) => a.dias - b.dias);

    return {
      primeiro,
      segundo,
      alertas: ativos.slice(0, 8),
      atrasados: ativos.filter((item) => item.dias < 0).length,
      hoje: ativos.filter((item) => item.dias === 0).length,
    };
  }, [query.data, lojaFiltro]);

  if (!podeVer || query.isLoading) return null;

  return (
    <section className="mb-5">
      <Card className="overflow-hidden border-[#D4AF37]/20 bg-[#0b0b0b]">
        <CardContent className="p-0">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-2.5">
                <Clock3 className="h-5 w-5 text-[#F2D675]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-white">Experiências</h2>
                  {dados.atrasados > 0 && (
                    <span className="rounded-full border border-rose-400/25 bg-rose-400/[0.07] px-2.5 py-1 text-[10px] font-black text-rose-200">
                      {dados.atrasados} atrasada{dados.atrasados === 1 ? "" : "s"}
                    </span>
                  )}
                  {dados.hoje > 0 && (
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] font-black text-amber-200">
                      {dados.hoje} decisão hoje
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {dados.primeiro} no 1º período • {dados.segundo} no 2º período
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Select value={lojaFiltro} onValueChange={setLojaFiltro}>
                <SelectTrigger className="h-10 w-full border-white/10 bg-black/30 text-white sm:w-[210px]">
                  <SelectValue placeholder="Selecionar loja" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#111111] text-white">
                  <SelectItem value="todas">Todas as lojas</SelectItem>
                  {lojasDisponiveis.map((loja) => (
                    <SelectItem key={loja.id} value={String(loja.id)}>
                      {loja.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                onClick={() => navigate("/rh/experiencia")}
                className="shrink-0 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
              >
                Gerenciar experiências
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          {dados.alertas.length > 0 ? (
            <div className="grid gap-px bg-white/[0.05] lg:grid-cols-2">
              {dados.alertas.map((item) => (
                <div
                  key={`${item.funcionarioId}-${item.etapa}`}
                  className="bg-[#090909] p-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        item.dias <= 2 ? "text-rose-300" : "text-amber-300"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {item.funcionarioNome}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.lojaNome} • {item.etapa} • {formatarData(item.prazo)}
                      </p>
                      <p
                        className={`mt-1 text-xs font-bold ${
                          item.dias <= 2 ? "text-rose-200" : "text-amber-200"
                        }`}
                      >
                        {item.dias < 0
                          ? `${Math.abs(item.dias)} dia${Math.abs(item.dias) === 1 ? "" : "s"} em atraso`
                          : item.dias === 0
                          ? "Decisão vence hoje"
                          : item.dias === 1
                          ? "Decisão vence amanhã"
                          : `${item.dias} dias para decidir`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-4 text-sm text-emerald-300 sm:px-5">
              <UserCheck className="h-4 w-4" />
              Nenhuma decisão de experiência dentro da janela de alerta.
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
