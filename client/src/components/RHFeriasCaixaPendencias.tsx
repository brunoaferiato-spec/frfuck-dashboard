import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  FileUp,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

type PendenciaFeriasCaixa = {
  id: number;
  lojaId: number;
  funcionarioId: number;
  funcionarioNome: string;
  dataInicio: string;
  dataRetorno: string;
  avisoPendente: boolean;
  pagamentoSolicitado: boolean;
  contasAPagarLancado: boolean;
  pagamentoPendente: boolean;
};

type TipoDocumentoFerias = "aviso" | "pagamento";

const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function parseDataCivil(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function diasAte(valor?: string | null) {
  const alvo = parseDataCivil(valor);
  if (!alvo) return null;

  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

async function arquivoParaBase64(file: File) {
  if (!MIME_PERMITIDOS.has(file.type)) {
    throw new Error("Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.");
  }

  if (!file.size || file.size > 6 * 1024 * 1024) {
    throw new Error("O arquivo deve ter no máximo 6 MB.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const bloco = 0x8000;

  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }

  return btoa(binario);
}

function textoPrazo(item: PendenciaFeriasCaixa, tipo: TipoDocumentoFerias) {
  const dias = diasAte(item.dataInicio);
  if (dias === null) return "";

  if (tipo === "aviso") {
    if (dias < 0) return "Férias já iniciadas • aviso ainda pendente";
    if (dias === 0) return "Férias iniciam hoje";
    if (dias <= 30) return `Urgente • férias iniciam em ${dias} dia${dias === 1 ? "" : "s"}`;
    return `Férias iniciam em ${dias} dias`;
  }

  if (dias < 0) return "Férias já iniciadas • pagamento ainda pendente";
  if (dias === 0) return "Férias iniciam hoje";
  if (dias <= 2) return `Urgente • férias iniciam em ${dias} dia${dias === 1 ? "" : "s"}`;
  return `Férias iniciam em ${dias} dias`;
}

function classePrazo(item: PendenciaFeriasCaixa, tipo: TipoDocumentoFerias) {
  const dias = diasAte(item.dataInicio);
  if (dias === null) return "text-gray-500";

  const urgente = tipo === "aviso" ? dias <= 30 : dias <= 2;
  return urgente ? "text-rose-200" : "text-gray-500";
}

export default function RHFeriasCaixaPendencias() {
  const { user } = useAuth();
  const role = String(user?.role || "");
  const lojaId = Number(user?.lojaId || 0);
  const caixaLider = role === "rh" && lojaId > 0;

  const [enviando, setEnviando] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const pendenciasQuery = trpc.rhFerias.pendenciasCaixa.useQuery(undefined, {
    enabled: caixaLider,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const pendencias = useMemo(
    () => ((pendenciasQuery.data || []) as PendenciaFeriasCaixa[]),
    [pendenciasQuery.data]
  );

  const tarefas = useMemo(() => {
    const lista: Array<{
      chave: string;
      tipo: TipoDocumentoFerias;
      titulo: string;
      descricao: string;
      item: PendenciaFeriasCaixa;
    }> = [];

    for (const item of pendencias) {
      if (item.avisoPendente) {
        lista.push({
          chave: `${item.id}-aviso`,
          tipo: "aviso",
          titulo: "Aviso de férias assinado",
          descricao: "Anexe o aviso assinado pelo colaborador.",
          item,
        });
      }

      if (
        item.pagamentoSolicitado &&
        (item.pagamentoPendente || !item.contasAPagarLancado)
      ) {
        lista.push({
          chave: `${item.id}-pagamento`,
          tipo: "pagamento",
          titulo: "Pagamento de férias assinado",
          descricao: "Anexe o documento de pagamento das férias.",
          item,
        });
      }
    }

    return lista.sort((a, b) =>
      a.item.dataInicio.localeCompare(b.item.dataInicio)
    );
  }, [pendencias]);

  const anexarMutation = trpc.rhFerias.anexarDocumento.useMutation({
    onSuccess: async (_, variables) => {
      setErro("");
      setMensagem(
        variables.tipo === "aviso"
          ? "Aviso de férias anexado. A etapa de pagamento foi aberta automaticamente."
          : "Pagamento de férias anexado. O processo foi concluído."
      );
      setEnviando(null);
      await pendenciasQuery.refetch();
    },
    onError: (error) => {
      setEnviando(null);
      setMensagem("");
      setErro(error.message || "Não foi possível anexar o documento.");
    },
  });

  const contasAPagarMutation = trpc.rhFerias.marcarContasAPagar.useMutation({
    onSuccess: async (_, variables) => {
      setErro("");
      setMensagem(
        variables.lancado
          ? "Lançamento no Contas a Pagar confirmado."
          : "Marcação de Contas a Pagar removida."
      );
      setMarcando(null);
      await pendenciasQuery.refetch();
    },
    onError: (error) => {
      setMarcando(null);
      setMensagem("");
      setErro(error.message || "Não foi possível atualizar o Contas a Pagar.");
    },
  });

  function marcarContasAPagar(item: PendenciaFeriasCaixa, lancado: boolean) {
    setMarcando(item.id);
    setErro("");
    setMensagem("");
    contasAPagarMutation.mutate({
      id: item.id,
      lancado,
    });
  }

  async function anexar(
    item: PendenciaFeriasCaixa,
    tipo: TipoDocumentoFerias,
    file?: File | null
  ) {
    if (!file) return;

    const chave = `${item.id}-${tipo}`;
    setEnviando(chave);
    setErro("");
    setMensagem("");

    try {
      if (tipo === "pagamento" && !item.contasAPagarLancado) {
        throw new Error("Marque primeiro que foi lançado no Contas a Pagar.");
      }

      const arquivoBase64 = await arquivoParaBase64(file);

      anexarMutation.mutate({
        id: item.id,
        tipo,
        arquivoNome: file.name,
        arquivoMime: file.type,
        arquivoTamanho: file.size,
        arquivoBase64,
      });
    } catch (error: any) {
      setEnviando(null);
      setErro(error?.message || "Não foi possível preparar o arquivo.");
    }
  }

  if (!caixaLider) return null;

  return (
    <section className="mb-5 sm:mb-6">
      <Card
        className={
          tarefas.length > 0
            ? "overflow-hidden border-rose-400/20 bg-gradient-to-br from-rose-950/20 via-[#10090b] to-[#090909]"
            : "overflow-hidden border-emerald-400/15 bg-[#0b0b0b]"
        }
      >
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <div
                className={
                  tarefas.length > 0
                    ? "rounded-xl border border-rose-400/20 bg-rose-400/[0.07] p-2.5"
                    : "rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-2.5"
                }
              >
                <CalendarDays
                  className={
                    tarefas.length > 0
                      ? "h-5 w-5 text-rose-200"
                      : "h-5 w-5 text-emerald-300"
                  }
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-white">Férias • documentos</h2>

                  {tarefas.length > 0 && (
                    <span className="rounded-full border border-rose-400/20 bg-rose-400/[0.07] px-2.5 py-1 text-[10px] font-black text-rose-200">
                      {tarefas.length} pendência{tarefas.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs leading-5 text-gray-500">
                  A Caixa anexa somente os documentos liberados pelo RH da própria loja.
                </p>
              </div>
            </div>

            {tarefas.length === 0 && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Férias em dia
              </div>
            )}
          </div>

          {mensagem && (
            <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-xs text-emerald-200 sm:mx-5">
              <FileCheck2 className="h-4 w-4 shrink-0" />
              {mensagem}
            </div>
          )}

          {erro && (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-200 sm:mx-5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {erro}
            </div>
          )}

          {pendenciasQuery.isLoading ? (
            <div className="p-4 text-sm text-gray-500 sm:p-5">
              Carregando pendências de férias...
            </div>
          ) : pendenciasQuery.error ? (
            <div className="p-4 text-sm text-rose-200 sm:p-5">
              Não foi possível carregar as pendências de férias.{" "}
              {pendenciasQuery.error.message}
            </div>
          ) : tarefas.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 sm:p-5">
              Nenhum aviso ou pagamento de férias aguardando documento nesta loja.
            </div>
          ) : (
            <div className="grid gap-px bg-white/[0.05] lg:grid-cols-2">
              {tarefas.map(({ chave, tipo, titulo, descricao, item }) => {
                const carregando = enviando === chave;

                return (
                  <div key={chave} className="bg-[#090909] p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {tipo === "aviso" ? (
                            <FileCheck2 className="h-4 w-4 shrink-0 text-[#F2D675]" />
                          ) : (
                            <WalletCards className="h-4 w-4 shrink-0 text-[#F2D675]" />
                          )}
                          <p className="text-xs font-black uppercase tracking-[0.08em] text-[#b9a46a]">
                            {titulo}
                          </p>
                        </div>

                        <p className="mt-2 truncate text-base font-black text-white">
                          {item.funcionarioNome}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          Férias: {formatarData(item.dataInicio)} a{" "}
                          {formatarData(item.dataRetorno)}
                        </p>

                        <p className={`mt-1 text-xs font-bold ${classePrazo(item, tipo)}`}>
                          {textoPrazo(item, tipo)}
                        </p>

                        <p className="mt-2 text-[11px] leading-5 text-gray-600">
                          {descricao}
                        </p>
                      </div>
                    </div>

                    {tipo === "pagamento" && (
                      <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={item.contasAPagarLancado}
                            disabled={marcando === item.id || carregando}
                            onChange={(event) =>
                              marcarContasAPagar(item, event.target.checked)
                            }
                            className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-black text-white">
                              Lançado no Contas a Pagar
                            </span>
                            <span className="mt-1 block text-[11px] leading-5 text-gray-600">
                              Marque somente depois de confirmar o lançamento no sistema da franquia.
                            </span>
                          </span>
                        </label>
                      </div>
                    )}

                    <label
                      className={`mt-4 inline-flex h-10 items-center rounded-lg px-3 text-xs font-black transition ${
                        carregando || (tipo === "pagamento" && !item.contasAPagarLancado)
                          ? "cursor-not-allowed bg-gray-800 text-gray-500"
                          : "cursor-pointer bg-[#D4AF37] text-black hover:bg-[#E6C760]"
                      }`}
                    >
                      <FileUp className="mr-2 h-4 w-4" />
                      {carregando
                        ? "Enviando..."
                        : tipo === "aviso"
                        ? "Anexar aviso assinado"
                        : !item.contasAPagarLancado
                        ? "Marque o Contas a Pagar primeiro"
                        : "Anexar pagamento assinado"}

                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                        className="hidden"
                        disabled={
                          carregando ||
                          (tipo === "pagamento" && !item.contasAPagarLancado)
                        }
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          void anexar(item, tipo, file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
