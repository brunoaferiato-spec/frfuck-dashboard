import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock3,
  FileCheck2,
  FilePenLine,
  FileUp,
  Loader2,
  Send,
  UserRound,
  WalletCards,
} from "lucide-react";
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

const MIME_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type TipoDocumentoOperacional =
  | "cartao_ponto"
  | "ficha_demissional"
  | "rescisao_contabilidade"
  | "comprovante_pagamento";

function dataHojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

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
  if (fase === "anexar_comprovante_pagamento") return "Aguardando finalização do RH";
  if (fase === "confirmar_pagamento") return "Aguardando finalização do RH";
  if (fase === "operacional_concluido") return "Processo finalizado";
  return fase || "Em andamento";
}

function classeFase(fase?: string | null) {
  if (fase === "operacional_concluido") {
    return "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200";
  }

  if (fase === "aguardando_contabilidade") {
    return "border-sky-400/20 bg-sky-400/[0.05] text-sky-200";
  }

  return "border-amber-400/20 bg-amber-400/[0.05] text-amber-100";
}

async function arquivoParaBase64(file: File) {
  if (!MIME_PERMITIDOS.has(file.type)) {
    throw new Error("Envie PDF, JPG, PNG, WEBP, HEIC ou HEIF.");
  }

  if (!file.size || file.size > 6 * 1024 * 1024) {
    throw new Error("O arquivo deve ter no máximo 6 MB.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return btoa(binario);
}

function ItemChecklist({
  ok,
  titulo,
  detalhe,
}: {
  ok: boolean;
  titulo: string;
  detalhe?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-700" />
      )}
      <div className="min-w-0">
        <p className={`text-xs font-bold ${ok ? "text-emerald-200" : "text-gray-400"}`}>
          {titulo}
        </p>
        {detalhe && <p className="mt-0.5 text-[11px] text-gray-600">{detalhe}</p>}
      </div>
    </div>
  );
}

export default function RHRescisaoCaixa({
  lojaIdOverride,
  modoTeste = false,
}: {
  lojaIdOverride?: number | null;
  modoTeste?: boolean;
}) {
  const { user } = useAuth();
  const role = String(user?.role || "");
  const lojaUsuarioId = Number(user?.lojaId || 0);
  const caixaLider = role === "rh" && lojaUsuarioId > 0;
  const adminOuGestor = role === "admin" || role === "gestor";
  const lojaId =
    adminOuGestor && modoTeste
      ? Number(lojaIdOverride || 0)
      : lojaUsuarioId;
  const podeUsar =
    caixaLider || (adminOuGestor && modoTeste && lojaId > 0);

  const [aberto, setAberto] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState("");
  const [dataSolicitacao, setDataSolicitacao] = useState(dataHojeCivil());
  const [ultimoDia, setUltimoDia] = useState("");
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [acaoPendente, setAcaoPendente] = useState<string | null>(null);

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId },
    { enabled: podeUsar && lojaId > 0, retry: false }
  );

  const processosQuery = trpc.rhRescisoes.minhaLoja.useQuery(
    modoTeste && adminOuGestor ? { lojaId } : undefined,
    {
      enabled: podeUsar,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  const funcionarios = useMemo(
    () =>
      ((funcionariosQuery.data || []) as Array<any>).filter((item) =>
        ["ativo", "experiencia"].includes(String(item.status || "ativo").toLowerCase())
      ),
    [funcionariosQuery.data]
  );

  const processosAbertos = useMemo(
    () =>
      ((processosQuery.data || []) as Array<any>).filter(
        (item) =>
          !["cancelada", "concluida"].includes(String(item.status)) &&
          item.faseOperacional !== "operacional_concluido"
      ),
    [processosQuery.data]
  );

  const concluidosRecentes = useMemo(
    () =>
      ((processosQuery.data || []) as Array<any>)
        .filter((item) => item.faseOperacional === "operacional_concluido")
        .slice(0, 3),
    [processosQuery.data]
  );

  function inputBase() {
    return modoTeste && adminOuGestor ? { lojaIdTeste: lojaId } : {};
  }

  async function atualizarLista() {
    await processosQuery.refetch();
  }

  const criarMutation = trpc.rhRescisoes.criarPedidoDemissao.useMutation({
    onSuccess: async (data) => {
      setErro("");
      setMensagem(
        `Pedido de demissão de ${data.funcionarioNome} aberto. Agora prepare o cartão-ponto e a ficha demissional.`
      );
      setAberto(false);
      setFuncionarioId("");
      setDataSolicitacao(dataHojeCivil());
      setUltimoDia("");
      setObservacao("");
      setArquivo(null);
      await atualizarLista();
    },
    onError: (error) => {
      setAcaoPendente(null);
      setMensagem("");
      setErro(error.message || "Não foi possível registrar o pedido de demissão.");
    },
  });

  const anexarMutation = trpc.rhRescisoes.anexarDocumentoOperacional.useMutation({
    onSuccess: async (data) => {
      setErro("");
      setMensagem(`${data.label} anexado com sucesso.`);
      setAcaoPendente(null);
      await atualizarLista();
    },
    onError: (error) => {
      setAcaoPendente(null);
      setMensagem("");
      setErro(error.message || "Não foi possível anexar o documento.");
    },
  });

  const portalMutation = trpc.rhRescisoes.marcarPortalContabilidade.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Envio ao portal da contabilidade confirmado. Agora aguardamos o retorno.");
      setAcaoPendente(null);
      await atualizarLista();
    },
    onError: (error) => {
      setAcaoPendente(null);
      setMensagem("");
      setErro(error.message || "Não foi possível confirmar o envio.");
    },
  });

  const conferirMutation = trpc.rhRescisoes.marcarRescisaoConferida.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Rescisão conferida e marcada como OK.");
      setAcaoPendente(null);
      await atualizarLista();
    },
    onError: (error) => {
      setAcaoPendente(null);
      setMensagem("");
      setErro(error.message || "Não foi possível confirmar a conferência.");
    },
  });

  const contasMutation = trpc.rhRescisoes.marcarContasPagar.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Lançamento no Contas a Pagar confirmado. Etapas da Caixa concluídas; aguardando a Líder de RH finalizar o pagamento.");
      setAcaoPendente(null);
      await atualizarLista();
    },
    onError: (error) => {
      setAcaoPendente(null);
      setMensagem("");
      setErro(error.message || "Não foi possível concluir o Contas a Pagar.");
    },
  });



  async function enviarPedido() {
    setErro("");
    setMensagem("");

    if (!funcionarioId) {
      setErro("Selecione o funcionário.");
      return;
    }

    if (!dataSolicitacao) {
      setErro("Informe a data do pedido.");
      return;
    }

    if (!arquivo) {
      setErro("A carta de demissão escrita de próprio punho e assinada é obrigatória.");
      return;
    }

    try {
      setAcaoPendente("novo-pedido");
      const arquivoBase64 = await arquivoParaBase64(arquivo);

      criarMutation.mutate({
        funcionarioId: Number(funcionarioId),
        ...inputBase(),
        dataSolicitacao,
        ultimoDiaInformado: ultimoDia || null,
        observacao: observacao.trim() || null,
        arquivoNome: arquivo.name,
        arquivoMime: arquivo.type,
        arquivoTamanho: arquivo.size,
        arquivoBase64,
      });
    } catch (error: any) {
      setAcaoPendente(null);
      setErro(error?.message || "Não foi possível preparar a carta.");
    }
  }

  async function anexarDocumento(
    item: any,
    tipo: TipoDocumentoOperacional,
    file?: File | null
  ) {
    if (!file) return;

    setErro("");
    setMensagem("");
    const chave = `${item.id}-${tipo}`;

    try {
      setAcaoPendente(chave);
      const arquivoBase64 = await arquivoParaBase64(file);

      anexarMutation.mutate({
        id: Number(item.id),
        tipo,
        ...inputBase(),
        arquivoNome: file.name,
        arquivoMime: file.type,
        arquivoTamanho: file.size,
        arquivoBase64,
      });
    } catch (error: any) {
      setAcaoPendente(null);
      setErro(error?.message || "Não foi possível preparar o documento.");
    }
  }

  function marcarPortal(item: any) {
    setErro("");
    setMensagem("");

    if (!window.confirm("Confirma que o cartão-ponto e a ficha demissional foram anexados no portal da contabilidade?")) {
      return;
    }

    setAcaoPendente(`${item.id}-portal`);
    portalMutation.mutate({
      id: Number(item.id),
      ...inputBase(),
    });
  }

  function marcarConferida(item: any) {
    setErro("");
    setMensagem("");
    setAcaoPendente(`${item.id}-conferida`);
    conferirMutation.mutate({
      id: Number(item.id),
      ...inputBase(),
    });
  }

  function marcarContasPagar(item: any) {
    setErro("");
    setMensagem("");

    if (!window.confirm("Confirma que a rescisão foi lançada no Contas a Pagar?")) {
      return;
    }

    setAcaoPendente(`${item.id}-contas`);
    contasMutation.mutate({
      id: Number(item.id),
      ...inputBase(),
    });
  }



  if (!podeUsar) return null;

  return (
    <section className="mb-5 sm:mb-6">
      <Card
        className={
          processosAbertos.length > 0
            ? "overflow-hidden border-amber-400/20 bg-gradient-to-br from-amber-950/10 via-[#0b0b0b] to-[#090909]"
            : "overflow-hidden border-[#D4AF37]/20 bg-[#0b0b0b]"
        }
      >
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-2.5">
                <FilePenLine className="h-5 w-5 text-[#F2D675]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-white">Rescisões</h2>
                  {processosAbertos.length > 0 && (
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-[10px] font-black text-amber-100">
                      {processosAbertos.length} em andamento
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  A tela mostra a fase atual de cada processo e o próximo passo da Caixa.
                </p>
                {modoTeste && adminOuGestor && (
                  <p className="mt-1 text-[11px] font-bold text-sky-300">
                    Modo teste • simulando a Caixa da loja selecionada acima.
                  </p>
                )}
              </div>
            </div>

            <Button
              type="button"
              onClick={() => {
                setAberto((valor) => !valor);
                setErro("");
                setMensagem("");
              }}
              className="bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
            >
              {aberto ? "Fechar" : "+ Registrar pedido"}
            </Button>
          </div>

          {mensagem && (
            <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-xs text-emerald-200 sm:mx-5">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {mensagem}
            </div>
          )}

          {erro && (
            <div className="mx-4 mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-xs text-rose-200 sm:mx-5">
              {erro}
            </div>
          )}

          {aberto && (
            <div className="border-b border-white/[0.06] p-4 sm:p-5">
              <div className="mb-4 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.03] p-3 text-xs leading-5 text-gray-400">
                <strong className="text-[#F2D675]">Pedido do funcionário:</strong>{" "}
                a Caixa abre o processo anexando a carta de demissão escrita de próprio punho.
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Funcionário
                  </label>
                  <Select value={funcionarioId} onValueChange={setFuncionarioId}>
                    <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                      <SelectValue placeholder="Selecione o funcionário" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#111111] text-white">
                      {funcionarios.map((funcionario) => (
                        <SelectItem key={funcionario.id} value={String(funcionario.id)}>
                          {funcionario.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Data do pedido
                  </label>
                  <input
                    type="date"
                    value={dataSolicitacao}
                    onChange={(event) => setDataSolicitacao(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/45"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Último dia informado pelo funcionário
                  </label>
                  <input
                    type="date"
                    value={ultimoDia}
                    onChange={(event) => setUltimoDia(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/45"
                  />
                  <p className="mt-1 text-[11px] text-gray-600">
                    Opcional, se ele já informar uma data.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Carta de demissão
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center rounded-xl border border-dashed border-[#D4AF37]/25 bg-[#D4AF37]/[0.03] px-3 text-sm text-gray-300 hover:bg-[#D4AF37]/[0.06]">
                    <FileUp className="mr-2 h-4 w-4 text-[#F2D675]" />
                    <span className="truncate">
                      {arquivo?.name || "Selecionar carta assinada"}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                      className="hidden"
                      onChange={(event) => setArquivo(event.target.files?.[0] || null)}
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-gray-600">
                    Obrigatória • escrita de próprio punho e assinada.
                  </p>
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Observação
                  </label>
                  <textarea
                    rows={2}
                    value={observacao}
                    onChange={(event) => setObservacao(event.target.value)}
                    placeholder="Opcional"
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45"
                  />
                </div>
              </div>

              <Button
                type="button"
                onClick={() => void enviarPedido()}
                disabled={criarMutation.isPending || acaoPendente === "novo-pedido"}
                className="mt-4 w-full bg-[#D4AF37] font-black text-black hover:bg-[#E6C760] sm:w-auto"
              >
                {criarMutation.isPending || acaoPendente === "novo-pedido" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FilePenLine className="mr-2 h-4 w-4" />
                )}
                Abrir rescisão e enviar para RH
              </Button>
            </div>
          )}

          <div className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-black text-white">Rescisões em andamento</p>
                <p className="mt-1 text-xs text-gray-600">
                  O processo permanece aqui até a Caixa concluir todas as etapas.
                </p>
              </div>
            </div>

            {processosQuery.isLoading ? (
              <p className="text-sm text-gray-500">Carregando processos...</p>
            ) : processosAbertos.length === 0 ? (
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4 text-sm text-emerald-200">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                Nenhuma rescisão aguardando ação da Caixa nesta loja.
              </div>
            ) : (
              <div className="space-y-3">
                {processosAbertos.map((item) => {
                  const cartaoOk = Boolean(item.cartaoPontoNome);
                  const fichaOk = Boolean(item.fichaDemissionalNome);
                  const portalOk = Boolean(item.portalContabilidadeEnviado);
                  const rescisaoOk = Boolean(item.rescisaoNome);
                  const conferidaOk = Boolean(item.rescisaoConferida);
                  const contasOk = Boolean(item.contasPagarLancado);

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/[0.08] bg-black/20 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 shrink-0 text-[#F2D675]" />
                            <p className="truncate text-base font-black text-white">
                              {item.funcionarioNome}
                            </p>
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            {item.origem === "pedido_demissao"
                              ? `Pedido em ${formatarData(item.dataSolicitacao)}`
                              : `Desligamento pela empresa • ${formatarData(
                                  item.dataPrevistaDesligamento
                                )}`}
                          </p>

                          {item.status === "aguardando_rh" && (
                            <p className="mt-1 text-[11px] font-bold text-rose-200">
                              RH ainda não recebeu formalmente o pedido • a Caixa pode continuar preparando os documentos.
                            </p>
                          )}
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${classeFase(
                            item.faseOperacional
                          )}`}
                        >
                          {labelFase(item.faseOperacional)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-2 rounded-xl border border-white/[0.06] bg-[#090909] p-3 sm:grid-cols-2 lg:grid-cols-4">
                        {item.origem === "pedido_demissao" && (
                          <ItemChecklist
                            ok={Boolean(item.cartaNome)}
                            titulo="Carta de demissão"
                          />
                        )}
                        <ItemChecklist ok={cartaoOk} titulo="Cartão-ponto" />
                        <ItemChecklist ok={fichaOk} titulo="Ficha demissional" />
                        <ItemChecklist
                          ok={portalOk}
                          titulo="Portal da contabilidade"
                        />
                        <ItemChecklist
                          ok={rescisaoOk}
                          titulo="Rescisão recebida"
                        />
                        <ItemChecklist
                          ok={conferidaOk}
                          titulo="Rescisão conferida"
                        />
                        <ItemChecklist
                          ok={contasOk}
                          titulo="Contas a Pagar"
                        />
                      </div>

                      {(!cartaoOk || !fichaOk) && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-[#b9a46a]">
                            Próximo passo • preparar envio à contabilidade
                          </p>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <label
                              className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-bold transition ${
                                cartaoOk
                                  ? "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200"
                                  : "border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/[0.08]"
                              }`}
                            >
                              {cartaoOk ? (
                                <FileCheck2 className="mr-2 h-4 w-4" />
                              ) : (
                                <FileUp className="mr-2 h-4 w-4" />
                              )}
                              {cartaoOk ? "Substituir cartão-ponto" : "Anexar cartão-ponto"}
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                                className="hidden"
                                disabled={acaoPendente === `${item.id}-cartao_ponto`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0] || null;
                                  void anexarDocumento(item, "cartao_ponto", file);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>

                            <label
                              className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-bold transition ${
                                fichaOk
                                  ? "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200"
                                  : "border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/[0.08]"
                              }`}
                            >
                              {fichaOk ? (
                                <FileCheck2 className="mr-2 h-4 w-4" />
                              ) : (
                                <FileUp className="mr-2 h-4 w-4" />
                              )}
                              {fichaOk ? "Substituir ficha demissional" : "Anexar ficha demissional"}
                              <input
                                type="file"
                                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                                className="hidden"
                                disabled={acaoPendente === `${item.id}-ficha_demissional`}
                                onChange={(event) => {
                                  const file = event.target.files?.[0] || null;
                                  void anexarDocumento(item, "ficha_demissional", file);
                                  event.currentTarget.value = "";
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {cartaoOk && fichaOk && !portalOk && (
                        <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                          <p className="text-sm font-black text-amber-100">
                            Documentos prontos para a contabilidade
                          </p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            Faça o pedido no portal da contabilidade e confirme abaixo somente depois que os documentos estiverem anexados lá.
                          </p>

                          <Button
                            type="button"
                            onClick={() => marcarPortal(item)}
                            disabled={acaoPendente === `${item.id}-portal`}
                            className="mt-3 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Marcar como enviado ao portal
                          </Button>
                        </div>
                      )}

                      {portalOk && !rescisaoOk && (
                        <div className="mt-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3">
                          <div className="flex items-start gap-2">
                            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                            <div>
                              <p className="text-sm font-black text-sky-200">
                                Aguardando retorno da contabilidade
                              </p>
                              <p className="mt-1 text-xs leading-5 text-gray-500">
                                Quando a contabilidade enviar a rescisão, anexe o arquivo abaixo.
                              </p>
                            </div>
                          </div>

                          <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-sky-400/20 bg-sky-400/[0.05] px-3 text-sm font-bold text-sky-200 hover:bg-sky-400/[0.08]">
                            <FileUp className="mr-2 h-4 w-4" />
                            Anexar rescisão da contabilidade
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                              className="hidden"
                              disabled={acaoPendente === `${item.id}-rescisao_contabilidade`}
                              onChange={(event) => {
                                const file = event.target.files?.[0] || null;
                                void anexarDocumento(item, "rescisao_contabilidade", file);
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                        </div>
                      )}

                      {rescisaoOk && (
                        <div className="mt-4 grid gap-2 lg:grid-cols-2">
                          <label
                            className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 ${
                              conferidaOk
                                ? "border-emerald-400/15 bg-emerald-400/[0.04]"
                                : "border-white/[0.08] bg-white/[0.02]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={conferidaOk}
                              disabled={conferidaOk || acaoPendente === `${item.id}-conferida`}
                              onChange={(event) => {
                                if (event.target.checked) marcarConferida(item);
                              }}
                              className="h-4 w-4 accent-[#D4AF37]"
                            />
                            <span className={`text-xs font-bold ${conferidaOk ? "text-emerald-200" : "text-white"}`}>
                              Conferi a rescisão e está tudo OK
                            </span>
                          </label>

                          <label
                            className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 ${
                              contasOk
                                ? "border-emerald-400/15 bg-emerald-400/[0.04]"
                                : conferidaOk
                                ? "border-white/[0.08] bg-white/[0.02]"
                                : "border-white/[0.05] bg-white/[0.01] opacity-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={contasOk}
                              disabled={
                                !conferidaOk ||
                                contasOk ||
                                acaoPendente === `${item.id}-contas`
                              }
                              onChange={(event) => {
                                if (event.target.checked) marcarContasPagar(item);
                              }}
                              className="h-4 w-4 accent-[#D4AF37]"
                            />
                            <span className={`text-xs font-bold ${contasOk ? "text-emerald-200" : "text-white"}`}>
                              Lancei no Contas a Pagar
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {concluidosRecentes.length > 0 && (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-gray-600">
                  Concluídos recentemente
                </p>
                <div className="grid gap-2 lg:grid-cols-3">
                  {concluidosRecentes.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] p-3"
                    >
                      <p className="truncate text-sm font-black text-white">
                        {item.funcionarioNome}
                      </p>
                      <p className="mt-1 text-xs font-bold text-emerald-300">
                        Pagamento efetuado • processo finalizado
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
