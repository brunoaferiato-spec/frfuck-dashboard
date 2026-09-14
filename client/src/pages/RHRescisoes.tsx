import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  FileCheck2,
  FileWarning,
  Search,
  ShieldCheck,
  Trash2,
  UserMinus,
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

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function dataHojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

const LOJAS_RH = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

function normalizar(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function labelStatus(status: string) {
  if (status === "aguardando_rh") return "Aguardando RH";
  if (status === "em_andamento") return "Em andamento";
  if (status === "concluida") return "Concluída";
  if (status === "cancelada") return "Cancelada";
  return status;
}

function labelFaseOperacional(fase?: string | null) {
  if (fase === "preparar_documentos") return "Preparar documentos";
  if (fase === "enviar_contabilidade") return "Enviar ao portal da contabilidade";
  if (fase === "aguardando_contabilidade") return "Aguardando retorno da contabilidade";
  if (fase === "conferir_rescisao") return "Conferir rescisão";
  if (fase === "lancar_contas_pagar") return "Lançar no Contas a Pagar";
  if (fase === "operacional_concluido") return "Operacional concluído";
  return fase || "Em andamento";
}

export default function RHRescisoes() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);
  const liderRh = role === "rh" && lojaUsuario <= 0;
  const admin = role === "admin";
  const podeExcluirRescisao = liderRh || admin;
  const podeGerenciar =
    liderRh || admin || role === "gestor";

  const [lojaForm, setLojaForm] = useState("");
  const [funcionarioForm, setFuncionarioForm] = useState("");
  const [dataPrevista, setDataPrevista] = useState(dataHojeCivil());
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");

  const [lojaFiltro, setLojaFiltro] = useState("todas");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [busca, setBusca] = useState("");

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [baixandoId, setBaixandoId] = useState<number | null>(null);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);

  const processosQuery = trpc.rhRescisoes.listar.useQuery(undefined, {
    enabled: podeGerenciar,
    retry: false,
    refetchOnWindowFocus: true,
  });

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: Number(lojaForm || 0) },
    {
      enabled: podeGerenciar && Number(lojaForm || 0) > 0,
      retry: false,
    }
  );

  const lojas = LOJAS_RH;

  const funcionarios = useMemo(
    () =>
      ((funcionariosQuery.data || []) as Array<any>).filter((item) =>
        ["ativo", "experiencia"].includes(String(item.status || "ativo").toLowerCase())
      ),
    [funcionariosQuery.data]
  );

  const processos = useMemo(
    () => (processosQuery.data || []) as Array<any>,
    [processosQuery.data]
  );

  const filtrados = useMemo(() => {
    const alvo = normalizar(busca);

    return processos.filter((item) => {
      if (lojaFiltro !== "todas" && Number(item.lojaId) !== Number(lojaFiltro)) {
        return false;
      }

      if (statusFiltro !== "todos" && item.status !== statusFiltro) {
        return false;
      }

      if (
        alvo &&
        ![
          item.funcionarioNome,
          item.funcionarioFuncao,
          item.lojaNome,
          item.criadoPorNome,
        ].some((valor) => normalizar(valor).includes(alvo))
      ) {
        return false;
      }

      return true;
    });
  }, [processos, lojaFiltro, statusFiltro, busca]);

  const resumo = useMemo(
    () => ({
      novos: processos.filter((item) => item.status === "aguardando_rh").length,
      andamento: processos.filter((item) => item.status === "em_andamento").length,
      pedidos: processos.filter((item) => item.origem === "pedido_demissao").length,
      empresa: processos.filter((item) => item.origem === "empresa").length,
    }),
    [processos]
  );

  const criarMutation = trpc.rhRescisoes.criarDesligamentoEmpresa.useMutation({
    onSuccess: async (data) => {
      setErro("");
      setMensagem(`Desligamento de ${data.funcionarioNome} iniciado pelo RH.`);
      setFuncionarioForm("");
      setDataPrevista(dataHojeCivil());
      setMotivo("");
      setObservacao("");
      await utils.rhRescisoes.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível iniciar o desligamento.");
    },
  });

  const assumirMutation = trpc.rhRescisoes.assumir.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Pedido recebido pelo RH. O processo agora está em andamento.");
      await utils.rhRescisoes.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível assumir o processo.");
    },
  });

  async function iniciarEmpresa() {
    setErro("");
    setMensagem("");

    if (!lojaForm || !funcionarioForm) {
      setErro("Selecione a loja e o funcionário.");
      return;
    }

    if (!dataPrevista) {
      setErro("Informe a data prevista de desligamento.");
      return;
    }

    if (!window.confirm("Confirma o início deste desligamento por decisão da empresa?")) {
      return;
    }

    criarMutation.mutate({
      lojaId: Number(lojaForm),
      funcionarioId: Number(funcionarioForm),
      dataPrevistaDesligamento: dataPrevista,
      motivoEmpresa: motivo.trim() || null,
      observacao: observacao.trim() || null,
    });
  }

  const excluirMutation = trpc.rhRescisoes.excluir.useMutation({
    onSuccess: async (data) => {
      setExcluindoId(null);
      setErro("");
      setMensagem(
        `Rescisão de ${data.funcionarioNome} excluída com sucesso.`
      );
      await utils.rhRescisoes.listar.invalidate();
    },
    onError: (error) => {
      setExcluindoId(null);
      setMensagem("");
      setErro(error.message || "Não foi possível excluir a rescisão.");
    },
  });

  function excluirProcesso(item: any) {
    if (!podeExcluirRescisao) return;

    const confirmar = window.confirm(
      `Excluir definitivamente a rescisão de ${item.funcionarioNome}?\n\n` +
        "Todos os documentos anexados e o histórico deste processo serão apagados. " +
        "Esta ação não pode ser desfeita."
    );

    if (!confirmar) return;

    setExcluindoId(Number(item.id));
    setErro("");
    setMensagem("");
    excluirMutation.mutate({ id: Number(item.id) });
  }

  async function baixarDocumento(
    id: number,
    tipo:
      | "carta"
      | "cartao_ponto"
      | "ficha_demissional"
      | "rescisao_contabilidade"
  ) {
    setBaixandoId(id);
    setErro("");

    try {
      const documento = await utils.client.rhRescisoes.baixarDocumento.query({
        id,
        tipo,
      });

      const bytes = Uint8Array.from(atob(documento.arquivoBase64), (char) =>
        char.charCodeAt(0)
      );
      const blob = new Blob([bytes], { type: documento.mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = documento.nome || "documento-rescisao";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setErro(error?.message || "Não foi possível baixar o documento.");
    } finally {
      setBaixandoId(null);
    }
  }

  if (!podeGerenciar) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <Card className="w-full max-w-lg border-rose-400/20 bg-[#0b0b0b]">
          <CardContent className="p-7 text-center">
            <FileWarning className="mx-auto h-8 w-8 text-rose-300" />
            <h1 className="mt-4 text-xl font-black">Acesso restrito</h1>
            <p className="mt-2 text-sm text-gray-400">
              A gestão de rescisões é exclusiva da Líder de RH.
            </p>
            <Button
              type="button"
              onClick={() => navigate("/rh/meu-dia")}
              className="mt-5 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
            >
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-[#D4AF37]/15 bg-[#080808]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/rh/gestao")}
              className="h-10 w-10 shrink-0 rounded-xl border border-[#D4AF37]/20 p-0 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                Gestão de pessoas
              </p>
              <h1 className="text-2xl font-black text-[#F2D675]">Rescisões</h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-3 py-2 text-xs text-[#b9a46a] sm:flex">
            <ShieldCheck className="h-4 w-4 text-[#F2D675]" />
            Líder RH
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7 lg:px-8">
        <Card className="mb-4 overflow-hidden border-[#D4AF37]/15 bg-[#0b0b0b]">
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Novos pedidos</p>
              <p className={`mt-2 text-2xl font-black ${resumo.novos ? "text-rose-300" : "text-emerald-300"}`}>{resumo.novos}</p>
              <p className="mt-1 text-[11px] text-gray-600">aguardando RH</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Em andamento</p>
              <p className="mt-2 text-2xl font-black text-[#F2D675]">{resumo.andamento}</p>
              <p className="mt-1 text-[11px] text-gray-600">processos ativos</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Pedido funcionário</p>
              <p className="mt-2 text-2xl font-black text-white">{resumo.pedidos}</p>
              <p className="mt-1 text-[11px] text-gray-600">iniciados pela Caixa</p>
            </div>
            <div className="bg-[#090909] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-gray-600">Decisão empresa</p>
              <p className="mt-2 text-2xl font-black text-white">{resumo.empresa}</p>
              <p className="mt-1 text-[11px] text-gray-600">iniciados pelo RH</p>
            </div>
          </div>
        </Card>

        <Card className="mb-4 border-[#D4AF37]/20 bg-[#0b0b0b]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.06] p-2.5">
                <Building2 className="h-5 w-5 text-[#F2D675]" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#b9a46a]">
                  Decisão da empresa
                </p>
                <h2 className="mt-1 text-xl font-black">Iniciar desligamento</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Este caminho é iniciado somente pela Líder de RH.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                <Select
                  value={lojaForm}
                  onValueChange={(valor) => {
                    setLojaForm(valor);
                    setFuncionarioForm("");
                  }}
                >
                  <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                    <SelectValue placeholder="Selecione a loja" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#111111] text-white">
                    {lojas.map((loja) => (
                      <SelectItem key={loja.id} value={String(loja.id)}>
                        {loja.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-400">Funcionário</label>
                <Select
                  value={funcionarioForm}
                  onValueChange={setFuncionarioForm}
                  disabled={!lojaForm}
                >
                  <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                    <SelectValue placeholder={lojaForm ? "Selecione o funcionário" : "Selecione primeiro a loja"} />
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
                  Data prevista de desligamento
                </label>
                <input
                  type="date"
                  value={dataPrevista}
                  onChange={(event) => setDataPrevista(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/45"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-400">
                  Motivo / orientação
                </label>
                <input
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder="Opcional nesta etapa"
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45"
                />
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
              onClick={() => void iniciarEmpresa()}
              disabled={criarMutation.isPending}
              className="mt-4 bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
            >
              <UserMinus className="mr-2 h-4 w-4" />
              Iniciar desligamento pela empresa
            </Button>
          </CardContent>
        </Card>

        {mensagem && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-sm text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {mensagem}
          </div>
        )}

        {erro && (
          <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-sm text-rose-200">
            {erro}
          </div>
        )}

        <Card className="mb-4 border-white/[0.08] bg-[#0b0b0b]">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[190px] flex-1">
                <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                <Select value={lojaFiltro} onValueChange={setLojaFiltro}>
                  <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#111111] text-white">
                    <SelectItem value="todas">Todas as lojas</SelectItem>
                    {lojas.map((loja) => (
                      <SelectItem key={loja.id} value={String(loja.id)}>
                        {loja.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[190px] flex-1">
                <label className="mb-1.5 block text-xs font-bold text-gray-400">Status</label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#111111] text-white">
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="aguardando_rh">Aguardando RH</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluida">Concluídas</SelectItem>
                    <SelectItem value="cancelada">Canceladas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative min-w-[250px] flex-[1.4]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar funcionário ou loja"
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-3">
          <h2 className="text-xl font-black">Processos de rescisão</h2>
          <p className="mt-1 text-sm text-gray-500">
            {filtrados.length} processo{filtrados.length === 1 ? "" : "s"} no filtro atual.
          </p>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {filtrados.map((item) => (
            <Card
              key={item.id}
              className={`border bg-[#0b0b0b] ${
                item.status === "aguardando_rh"
                  ? "border-rose-400/20"
                  : "border-white/[0.08]"
              }`}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-white">
                        {item.funcionarioNome}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {item.lojaNome} • {item.funcionarioFuncao || "Função não informada"}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${
                        item.status === "aguardando_rh"
                          ? "border-rose-400/25 bg-rose-400/[0.07] text-rose-200"
                          : item.status === "em_andamento"
                          ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-200"
                          : "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200"
                      }`}
                    >
                      {labelStatus(item.status)}
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                    <p className="text-xs font-black text-[#F2D675]">
                      {item.origem === "pedido_demissao"
                        ? "Pedido de demissão • iniciado pela Caixa"
                        : "Desligamento pela empresa • iniciado pelo RH"}
                    </p>

                    <p className="mt-2 text-xs text-gray-500">
                      {item.origem === "pedido_demissao"
                        ? `Pedido: ${formatarData(item.dataSolicitacao)}`
                        : `Data prevista: ${formatarData(item.dataPrevistaDesligamento)}`}
                    </p>

                    {item.ultimoDiaInformado && (
                      <p className="mt-1 text-xs text-gray-500">
                        Último dia informado: {formatarData(item.ultimoDiaInformado)}
                      </p>
                    )}

                    <p className="mt-1 text-[11px] text-gray-600">
                      Iniciado por {item.criadoPorNome || "usuário do sistema"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-[#090909] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase tracking-[0.1em] text-[#b9a46a]">
                        Fase operacional da Caixa
                      </p>
                      <span className="rounded-full border border-amber-400/15 bg-amber-400/[0.04] px-2.5 py-1 text-[10px] font-black text-amber-100">
                        {labelFaseOperacional(item.faseOperacional)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {item.origem === "pedido_demissao" && (
                        <div className="flex items-center gap-2 text-xs">
                          <FileCheck2 className={`h-4 w-4 ${item.cartaNome ? "text-emerald-300" : "text-gray-700"}`} />
                          <span className={item.cartaNome ? "text-emerald-200" : "text-gray-500"}>
                            Carta de demissão
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs">
                        <FileCheck2 className={`h-4 w-4 ${item.cartaoPontoNome ? "text-emerald-300" : "text-gray-700"}`} />
                        <span className={item.cartaoPontoNome ? "text-emerald-200" : "text-gray-500"}>
                          Cartão-ponto
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <FileCheck2 className={`h-4 w-4 ${item.fichaDemissionalNome ? "text-emerald-300" : "text-gray-700"}`} />
                        <span className={item.fichaDemissionalNome ? "text-emerald-200" : "text-gray-500"}>
                          Ficha demissional
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <FileCheck2 className={`h-4 w-4 ${item.portalContabilidadeEnviado ? "text-emerald-300" : "text-gray-700"}`} />
                        <span className={item.portalContabilidadeEnviado ? "text-emerald-200" : "text-gray-500"}>
                          Enviado ao portal da contabilidade
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <FileCheck2 className={`h-4 w-4 ${item.rescisaoNome ? "text-emerald-300" : "text-gray-700"}`} />
                        <span className={item.rescisaoNome ? "text-emerald-200" : "text-gray-500"}>
                          Rescisão recebida
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <FileCheck2 className={`h-4 w-4 ${item.rescisaoConferida ? "text-emerald-300" : "text-gray-700"}`} />
                        <span className={item.rescisaoConferida ? "text-emerald-200" : "text-gray-500"}>
                          Conferida pela Caixa
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <FileCheck2 className={`h-4 w-4 ${item.contasPagarLancado ? "text-emerald-300" : "text-gray-700"}`} />
                        <span className={item.contasPagarLancado ? "text-emerald-200" : "text-gray-500"}>
                          Contas a Pagar lançado
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {item.origem === "pedido_demissao" && item.cartaNome && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void baixarDocumento(item.id, "carta")}
                        disabled={baixandoId === item.id}
                        className="border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Carta de demissão
                      </Button>
                    )}

                    {item.cartaoPontoNome && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void baixarDocumento(item.id, "cartao_ponto")}
                        disabled={baixandoId === item.id}
                        className="border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.06]"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Cartão-ponto
                      </Button>
                    )}

                    {item.fichaDemissionalNome && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void baixarDocumento(item.id, "ficha_demissional")}
                        disabled={baixandoId === item.id}
                        className="border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.06]"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Ficha demissional
                      </Button>
                    )}

                    {item.rescisaoNome && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void baixarDocumento(item.id, "rescisao_contabilidade")}
                        disabled={baixandoId === item.id}
                        className="border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.06]"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Rescisão da contabilidade
                      </Button>
                    )}
                  </div>

                  {item.status === "aguardando_rh" && (
                    <Button
                      type="button"
                      onClick={() => assumirMutation.mutate({ id: item.id })}
                      disabled={assumirMutation.isPending}
                      className="bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
                    >
                      Receber pedido e iniciar processo
                    </Button>
                  )}

                  {podeExcluirRescisao && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => excluirProcesso(item)}
                      disabled={
                        excluirMutation.isPending &&
                        excluindoId === Number(item.id)
                      }
                      className="border-rose-400/25 bg-rose-400/[0.04] text-rose-200 hover:bg-rose-400/[0.10] hover:text-rose-100"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {excluirMutation.isPending &&
                      excluindoId === Number(item.id)
                        ? "Excluindo..."
                        : "Excluir rescisão"}
                    </Button>
                  )}

                  {item.status === "em_andamento" && item.recebidoRhPorNome && (
                    <p className="text-[11px] text-gray-600">
                      RH responsável: {item.recebidoRhPorNome}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {!processosQuery.isLoading && filtrados.length === 0 && (
            <Card className="border-white/[0.08] bg-[#0b0b0b] xl:col-span-2">
              <CardContent className="p-8 text-center text-sm text-gray-500">
                Nenhum processo encontrado no filtro atual.
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
