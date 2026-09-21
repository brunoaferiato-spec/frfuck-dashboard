import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Package,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShoppingCart,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import ComprasPneusHistorico from "@/components/ComprasPneusHistorico";
import ComprasPneusPromocionais from "@/components/ComprasPneusPromocionais";

type ItemAnalise = {
  medida: string;
  melhorPrecoUf: number;
  vendas: number;
  estoque: number;
  projecao: number;
  promocional: boolean;
  adicionalPromocional: number;
  jogosValidos: number;
  jogosMinimos: number;
  necessidade: number;
  quantidadeSugerida: number;
  quantidadeFinal: number;
};

type Aba = "planejamento" | "cotacao" | "pedidos" | "promocionais" | "historico" | "config";

const LOJAS_COMPRAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

function moeda(valor: unknown) {
  const n = Number(valor || 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function numeroInput(valor: string) {
  const texto = String(valor || "").trim().replace(",", ".");
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

async function arquivoParaBase64(file: File) {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("O arquivo deve ter no máximo 8 MB.");
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

function baixarBase64(nome: string, mime: string, base64: string) {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  const blob = new Blob([array], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ComprasPneus() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [aba, setAba] = useState<Aba>("planejamento");
  const [lojaId, setLojaId] = useState("1");
  const [diasAnalise, setDiasAnalise] = useState("60");
  const [diasProjecao, setDiasProjecao] = useState("21");
  const [arquivoVendas, setArquivoVendas] = useState<File | null>(null);
  const [arquivoEstoque, setArquivoEstoque] = useState<File | null>(null);
  const [itensAnalise, setItensAnalise] = useState<ItemAnalise[]>([]);
  const [planejamentoId, setPlanejamentoId] = useState<number | null>(null);
  const [chaveAnalise, setChaveAnalise] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState("");
  const [cotacaoLocal, setCotacaoLocal] = useState<Record<string, string>>({});
  const [novaRegraMedida, setNovaRegraMedida] = useState("");
  const [novaRegraPromo, setNovaRegraPromo] = useState(false);
  const [novaRegraJogos, setNovaRegraJogos] = useState("0");
  const [dataPlanejamentoInicio, setDataPlanejamentoInicio] = useState("");
  const [dataPlanejamentoFim, setDataPlanejamentoFim] = useState("");
  const [fornecedorModal, setFornecedorModal] = useState<any | null>(null);

  const lojasQuery = trpc.lojas.list.useQuery(undefined, { retry: false });

  const lojas = useMemo(() => {
    const recebidas = (lojasQuery.data || []) as Array<{ id: number; nome: string }>;
    const porId = new Map(recebidas.map((loja) => [Number(loja.id), loja]));

    return LOJAS_COMPRAS.map((loja) => {
      const recebida = porId.get(loja.id);
      return recebida
        ? { ...loja, ...recebida, id: Number(recebida.id), nome: recebida.nome || loja.nome }
        : { ...loja };
    });
  }, [lojasQuery.data]);

  const fornecedoresQuery = trpc.compras.pneus.fornecedores.useQuery();
  const regrasQuery = trpc.compras.pneus.regras.useQuery(
    { lojaId: Number(lojaId) },
    { enabled: Number(lojaId) > 0 }
  );
  const planejamentosQuery = trpc.compras.pneus.planejamentos.useQuery({
    lojaId: Number(lojaId) || null,
    dataInicio: dataPlanejamentoInicio || null,
    dataFim: dataPlanejamentoFim || null,
  });
  const detalheQuery = trpc.compras.pneus.detalhe.useQuery(
    { planejamentoId: Number(planejamentoId || 0) },
    { enabled: Boolean(planejamentoId) }
  );
  const pedidosQuery = trpc.compras.pneus.pedidos.useQuery(
    { planejamentoId: Number(planejamentoId || 0) },
    { enabled: Boolean(planejamentoId) }
  );

  const fornecedores = useMemo(
    () => (fornecedoresQuery.data || []).filter((item: any) => item.ativo),
    [fornecedoresQuery.data]
  );

  const itensCotacao = useMemo(
    () =>
      ((detalheQuery.data?.itens || []) as any[]).filter(
        (item) => Number(item.quantidadeFinal || 0) > 0
      ),
    [detalheQuery.data]
  );

  const cotacoes = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const item of (detalheQuery.data?.cotacoes || []) as any[]) {
      mapa.set(`${item.itemId}:${item.fornecedorId}`, Number(item.valor || 0));
    }
    return mapa;
  }, [detalheQuery.data]);

  const analisarMutation = trpc.compras.pneus.analisar.useMutation({
    onError: (error) => setErro(error.message || "Não foi possível analisar os relatórios."),
  });

  const salvarPlanejamentoMutation = trpc.compras.pneus.salvarPlanejamento.useMutation({
    onSuccess: async (data) => {
      setPlanejamentoId(Number(data.id));
      setMensagem(
        data.jaExistia
          ? `Este planejamento já estava salvo como #${data.id}. Abrindo a cotação existente.`
          : `Planejamento #${data.id} salvo. Já pode iniciar a cotação.`
      );
      await utils.compras.pneus.planejamentos.invalidate();
      setAba("cotacao");
    },
    onError: (error) => setErro(error.message || "Não foi possível salvar o planejamento."),
  });

  const excluirPlanejamentoRecenteMutation =
    trpc.compras.pneus.excluirPlanejamento.useMutation({
      onSuccess: async (data) => {
        setErro("");
        setMensagem(`Planejamento #${data.planejamentoId} excluído.`);
        if (planejamentoId === Number(data.planejamentoId)) {
          setPlanejamentoId(null);
        }
        await planejamentosQuery.refetch();
        await utils.compras.pneus.promocionais.invalidate();
      },
      onError: (error) =>
        setErro(error.message || "Não foi possível excluir o planejamento."),
    });

  const excluirPedidosRecenteMutation =
    trpc.compras.pneus.excluirPedidosPlanejamento.useMutation({
      onSuccess: async (data) => {
        setErro("");
        setMensagem(
          `${data.excluidos || 0} pedido(s) excluído(s) do planejamento #${data.planejamentoId}.`
        );
        await planejamentosQuery.refetch();
        await utils.compras.pneus.promocionais.invalidate();
      },
      onError: (error) =>
        setErro(error.message || "Não foi possível excluir os pedidos."),
    });

  const criarFornecedorMutation = trpc.compras.pneus.criarFornecedor.useMutation({
    onSuccess: async () => {
      setNovoFornecedor("");
      setMensagem("Fornecedor cadastrado.");
      await utils.compras.pneus.fornecedores.invalidate();
    },
    onError: (error) => setErro(error.message || "Não foi possível cadastrar fornecedor."),
  });

  const definirFornecedorAtivoMutation =
    trpc.compras.pneus.definirFornecedorAtivo.useMutation({
      onSuccess: async () => {
        await utils.compras.pneus.fornecedores.invalidate();
      },
    });

  const salvarCotacaoMutation = trpc.compras.pneus.salvarCotacao.useMutation({
    onSuccess: async () => {
      await detalheQuery.refetch();
    },
    onError: (error) => setErro(error.message || "Não foi possível salvar a cotação."),
  });

  const selecionarFornecedorMutation =
    trpc.compras.pneus.selecionarFornecedor.useMutation({
      onSuccess: async () => {
        await detalheQuery.refetch();
        await pedidosQuery.refetch();
      },
      onError: (error) => setErro(error.message || "Não foi possível selecionar o fornecedor."),
    });

  const selecionarMenoresMutation = trpc.compras.pneus.selecionarMenores.useMutation({
    onSuccess: async () => {
      setMensagem("Menores preços selecionados. Você ainda pode trocar manualmente.");
      await detalheQuery.refetch();
      await pedidosQuery.refetch();
    },
  });

  const fecharPedidosMutation = trpc.compras.pneus.fecharPedidos.useMutation({
    onSuccess: async (data) => {
      setMensagem(
        data.jaSalvo
          ? "Os pedidos desse planejamento já estavam salvos."
          : `${data.pedidos || 0} pedido(s) salvo(s) no histórico.`
      );
      await detalheQuery.refetch();
      await pedidosQuery.refetch();
      await utils.compras.pneus.planejamentos.invalidate();
      await utils.compras.pneus.historico.invalidate();
      await utils.compras.pneus.promocionais.invalidate();
      setAba("pedidos");
    },
    onError: (error) =>
      setErro(error.message || "Não foi possível salvar os pedidos."),
  });

  const atualizarQuantidadeMutation =
    trpc.compras.pneus.atualizarQuantidade.useMutation({
      onSuccess: async () => {
        await detalheQuery.refetch();
        await pedidosQuery.refetch();
      },
    });

  const arquivoCotacaoMutation = trpc.compras.pneus.arquivoCotacao.useMutation({
    onSuccess: (data) => baixarBase64(data.nome, data.mime, data.base64),
    onError: (error) => setErro(error.message || "Não foi possível gerar o arquivo."),
  });

  const arquivoCotacaoFornecedorMutation =
    trpc.compras.pneus.arquivoCotacaoFornecedor.useMutation({
      onSuccess: (data) => baixarBase64(data.nome, data.mime, data.base64),
      onError: (error) =>
        setErro(error.message || "Não foi possível gerar a planilha do fornecedor."),
    });

  const importarCotacaoFornecedorMutation =
    trpc.compras.pneus.importarCotacaoFornecedor.useMutation({
      onSuccess: async (data) => {
        setErro("");
        setCotacaoLocal((atual) => {
          const proximo = { ...atual };
          const sufixo = `:${data.fornecedorId}`;

          for (const chave of Object.keys(proximo)) {
            if (chave.endsWith(sufixo)) delete proximo[chave];
          }

          return proximo;
        });

        await detalheQuery.refetch();
        await pedidosQuery.refetch();
        await utils.compras.pneus.historico.invalidate();

        setFornecedorModal(null);
        setMensagem(
          `Cotação de ${data.fornecedorNome} importada: ${data.importados}/${data.totalEsperado} preços gravados.`
        );
      },
      onError: (error) =>
        setErro(error.message || "Não foi possível importar a cotação do fornecedor."),
    });

  const arquivoPedidoMutation = trpc.compras.pneus.arquivoPedido.useMutation({
    onSuccess: (data) => baixarBase64(data.nome, data.mime, data.base64),
  });

  const salvarRegraMutation = trpc.compras.pneus.salvarRegra.useMutation({
    onSuccess: async () => {
      setNovaRegraMedida("");
      setNovaRegraPromo(false);
      setNovaRegraJogos("0");
      setMensagem("Regra salva. Reanalise os relatórios para aplicar.");
      await utils.compras.pneus.regras.invalidate();
    },
  });

  async function analisar() {
    setErro("");
    setMensagem("");

    if (!arquivoVendas || !arquivoEstoque) {
      setErro("Selecione os dois relatórios.");
      return;
    }

    try {
      const [vendasBase64, estoqueBase64] = await Promise.all([
        arquivoParaBase64(arquivoVendas),
        arquivoParaBase64(arquivoEstoque),
      ]);

      const resposta = await analisarMutation.mutateAsync({
        lojaId: Number(lojaId),
        diasAnalise: Number(diasAnalise),
        diasProjecao: Number(diasProjecao),
        arquivoVendasNome: arquivoVendas.name,
        arquivoVendasBase64: vendasBase64,
        arquivoEstoqueNome: arquivoEstoque.name,
        arquivoEstoqueBase64: estoqueBase64,
      });

      setItensAnalise(resposta.itens as ItemAnalise[]);
      setPlanejamentoId(null);
      setChaveAnalise(String(resposta.chaveAnalise || ""));
      setMensagem(
        `${resposta.totalComprar} medidas para comprar • ${resposta.totalPneus} pneus sugeridos • loja confirmada: ${resposta.lojaRelatorio?.nome || "—"}.`
      );
    } catch (error: any) {
      setErro(error?.message || "Não foi possível analisar os relatórios.");
    }
  }

  function atualizarQuantidadeAnalise(indice: number, valor: string) {
    const numero = Math.max(0, Math.trunc(Number(valor || 0)));
    const arredondado = numero <= 0 ? 0 : Math.ceil(numero / 4) * 4;
    setItensAnalise((atuais) =>
      atuais.map((item, i) =>
        i === indice ? { ...item, quantidadeFinal: arredondado } : item
      )
    );
  }

  function salvarPlanejamento() {
    setErro("");
    setMensagem("");
    if (!itensAnalise.length || !chaveAnalise) {
      setErro("Analise os relatórios primeiro.");
      return;
    }

    if (planejamentoId) {
      setMensagem(`O planejamento #${planejamentoId} já está salvo.`);
      return;
    }

    salvarPlanejamentoMutation.mutate({
      lojaId: Number(lojaId),
      diasAnalise: Number(diasAnalise),
      diasProjecao: Number(diasProjecao),
      arquivoVendasNome: arquivoVendas?.name || null,
      arquivoEstoqueNome: arquivoEstoque?.name || null,
      chaveAnalise,
      itens: itensAnalise,
    });
  }

  async function importarPlanilhaFornecedor(
    file: File | null,
    fornecedorId: number
  ) {
    if (!file || !planejamentoId) return;

    setErro("");
    setMensagem("");

    if (!/\.xlsx$/i.test(file.name)) {
      setErro("A cotação do fornecedor precisa estar em formato .xlsx.");
      return;
    }

    try {
      const arquivoBase64 = await arquivoParaBase64(file);
      await importarCotacaoFornecedorMutation.mutateAsync({
        planejamentoId,
        fornecedorId,
        arquivoNome: file.name,
        arquivoBase64,
      });
    } catch (error: any) {
      setErro(error?.message || "Não foi possível importar a cotação.");
    }
  }

  function menorPrecoItem(itemId: number) {
    const valores = fornecedores
      .map((fornecedor: any) => cotacoes.get(`${itemId}:${fornecedor.id}`))
      .filter((valor): valor is number => Number(valor || 0) > 0);
    return valores.length ? Math.min(...valores) : null;
  }

  function salvarValor(itemId: number, fornecedorId: number) {
    const chave = `${itemId}:${fornecedorId}`;
    const valorDigitado = cotacaoLocal[chave];
    const valor = valorDigitado !== undefined
      ? numeroInput(valorDigitado)
      : Number(cotacoes.get(chave) || 0);

    if (valor <= 0) return;
    salvarCotacaoMutation.mutate({ itemId, fornecedorId, valor });
  }

  const totalAnalise = itensAnalise.reduce(
    (total, item) => total + Number(item.quantidadeFinal || 0),
    0
  );
  const medidasComprar = itensAnalise.filter((item) => item.quantidadeFinal > 0).length;

  const abas = [
    ["planejamento", "Planejamento"],
    ["cotacao", "Cotação"],
    ["pedidos", "Pedidos"],
    ["promocionais", "Preços Promocionais"],
    ["historico", "Histórico"],
    ["config", "Configurações"],
  ] as const;

  return (
    <main className="min-h-full bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">
              COMPRAS • PNEUS
            </p>
            <h1 className="mt-2 text-3xl font-black">Planejamento e Cotação</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Histórico de vendas → projeção → estoque → regras de jogos → cotação → pedidos por fornecedor.
            </p>
          </div>
          {planejamentoId && (
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-3 text-sm font-black text-emerald-300">
              Planejamento #{planejamentoId}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {abas.map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setAba(valor)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-black transition ${
                aba === valor
                  ? "bg-[#D4AF37] text-black"
                  : "border border-white/[0.08] bg-white/[0.025] text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {(mensagem || erro) && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              erro
                ? "border-rose-400/20 bg-rose-400/[0.05] text-rose-200"
                : "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200"
            }`}
          >
            {erro || mensagem}
          </div>
        )}

        {aba === "planejamento" && (
          <div className="mt-5 space-y-5">
            <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#0a0a0a] p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-[#F2D675]" />
                <div>
                  <h2 className="font-black">Parâmetros da compra</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Os períodos podem mudar a cada análise.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                  <select
                    value={lojaId}
                    onChange={(event) => {
                      setLojaId(event.target.value);
                      setArquivoVendas(null);
                      setArquivoEstoque(null);
                      setItensAnalise([]);
                      setPlanejamentoId(null);
                      setChaveAnalise("");
                      setMensagem("");
                      setErro("");
                    }}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none"
                  >
                    {lojas.map((loja: any) => (
                      <option key={loja.id} value={loja.id}>
                        {loja.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Dias analisados
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={diasAnalise}
                    onChange={(event) => setDiasAnalise(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-600">Normalmente 60 dias.</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">
                    Dias para projetar
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={diasProjecao}
                    onChange={(event) => setDiasProjecao(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-600">Normalmente 21 dias.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/25 bg-[#D4AF37]/[0.03] p-5 text-center hover:bg-[#D4AF37]/[0.06]">
                  <FileSpreadsheet className="h-7 w-7 text-[#F2D675]" />
                  <p className="mt-3 font-black">Vendas + estoque</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Medida, melhor compra UF, vendas e estoque
                  </p>
                  <p className="mt-3 max-w-full truncate text-xs font-bold text-[#F2D675]">
                    {arquivoVendas?.name || "Selecionar relatório .xlsx"}
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(event) => {
                      setArquivoVendas(event.target.files?.[0] || null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/25 bg-[#D4AF37]/[0.03] p-5 text-center hover:bg-[#D4AF37]/[0.06]">
                  <Package className="h-7 w-7 text-[#F2D675]" />
                  <p className="mt-3 font-black">Estoque detalhado por marca</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Usado para validar jogos completos de 4 pneus
                  </p>
                  <p className="mt-3 max-w-full truncate text-xs font-bold text-[#F2D675]">
                    {arquivoEstoque?.name || "Selecionar relatório .xlsx"}
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(event) => {
                      setArquivoEstoque(event.target.files?.[0] || null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void analisar()}
                  disabled={analisarMutation.isPending}
                  className="inline-flex h-11 items-center rounded-xl bg-[#D4AF37] px-5 text-sm font-black text-black hover:bg-[#E6C760] disabled:opacity-50"
                >
                  {analisarMutation.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Analisar compra
                </button>
                {itensAnalise.length > 0 && (
                  <button
                    type="button"
                    onClick={salvarPlanejamento}
                    disabled={salvarPlanejamentoMutation.isPending || Boolean(planejamentoId)}
                    className="inline-flex h-11 items-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-5 text-sm font-black text-emerald-200 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {planejamentoId ? "Planejamento salvo" : "Salvar e iniciar cotação"}
                  </button>
                )}
              </div>
            </section>

            {itensAnalise.length > 0 && (
              <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#090909]">
                <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-black">Sugestão de compra</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Mostrando somente medidas com compra sugerida. Necessidade ≤ 2 é descartada e toda compra é arredondada para cima em múltiplos de 4.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-black text-gray-300">
                      {medidasComprar} medidas
                    </span>
                    <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] px-3 py-1.5 text-xs font-black text-[#F2D675]">
                      {totalAnalise} pneus
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[1050px] w-full text-sm">
                    <thead className="bg-white/[0.025] text-left text-[10px] uppercase tracking-[0.08em] text-gray-600">
                      <tr>
                        <th className="px-4 py-3">Medida</th>
                        <th className="px-4 py-3 text-right">Melhor UF</th>
                        <th className="px-4 py-3 text-right">Vendas</th>
                        <th className="px-4 py-3 text-right">Estoque</th>
                        <th className="px-4 py-3 text-right">Projeção</th>
                        <th className="px-4 py-3">Regra</th>
                        <th className="px-4 py-3 text-right">Jogos</th>
                        <th className="px-4 py-3 text-right">Necessidade</th>
                        <th className="px-4 py-3 text-right">Compra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensAnalise
                        .map((item, indice) => ({ item, indice }))
                        .filter(({ item }) => item.quantidadeFinal > 0)
                        .map(({ item, indice }) => (
                        <tr
                          key={item.medida}
                          className={`border-t border-white/[0.05] ${
                            item.quantidadeFinal > 0 ? "" : "opacity-45"
                          }`}
                        >
                          <td className="px-4 py-3 font-black text-white">{item.medida}</td>
                          <td className="px-4 py-3 text-right text-gray-300">
                            {item.melhorPrecoUf > 0 ? moeda(item.melhorPrecoUf) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">{item.vendas}</td>
                          <td className="px-4 py-3 text-right">{item.estoque}</td>
                          <td className="px-4 py-3 text-right">{item.projecao.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {item.promocional && (
                                <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-[10px] font-black text-amber-200">
                                  PROMO +12
                                </span>
                              )}
                              {item.jogosMinimos > 0 && (
                                <span className="rounded-md border border-sky-400/20 bg-sky-400/[0.06] px-2 py-1 text-[10px] font-black text-sky-200">
                                  MÍN. {item.jogosMinimos} JOGOS
                                </span>
                              )}
                              {!item.promocional && item.jogosMinimos === 0 && "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.jogosMinimos > 0 ? (
                              <span className="whitespace-nowrap font-bold text-sky-100">
                                Jogos: {item.jogosValidos}/{item.jogosMinimos}
                              </span>
                            ) : (
                              item.jogosValidos
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${
                            item.necessidade > 2 ? "text-amber-200" : "text-gray-600"
                          }`}>
                            {item.necessidade.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step={4}
                              value={item.quantidadeFinal}
                              onChange={(event) =>
                                atualizarQuantidadeAnalise(indice, event.target.value)
                              }
                              className="h-9 w-20 rounded-lg border border-[#D4AF37]/20 bg-black/30 px-2 text-right font-black text-[#F2D675] outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-white/[0.08] bg-[#090909] p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="font-black">Planejamentos</h2>
                  <p className="mt-1 text-xs text-gray-600">
                    Filtre por período e exclua planejamentos ou pedidos quando necessário.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">
                      Data inicial
                    </label>
                    <input
                      type="date"
                      value={dataPlanejamentoInicio}
                      max={dataPlanejamentoFim || undefined}
                      onChange={(event) =>
                        setDataPlanejamentoInicio(event.target.value)
                      }
                      className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">
                      Data final
                    </label>
                    <input
                      type="date"
                      value={dataPlanejamentoFim}
                      min={dataPlanejamentoInicio || undefined}
                      onChange={(event) =>
                        setDataPlanejamentoFim(event.target.value)
                      }
                      className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {(dataPlanejamentoInicio || dataPlanejamentoFim) && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.03] px-3 py-2">
                  <span className="text-xs text-[#F2D675]/80">
                    Período selecionado
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDataPlanejamentoInicio("");
                      setDataPlanejamentoFim("");
                    }}
                    className="text-xs font-black text-[#F2D675] hover:underline"
                  >
                    Limpar datas
                  </button>
                </div>
              )}

              {planejamentosQuery.isLoading ? (
                <div className="py-8 text-center text-sm text-gray-600">
                  Carregando planejamentos...
                </div>
              ) : (planejamentosQuery.data || []).length === 0 ? (
                <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center text-sm text-gray-600">
                  Nenhum planejamento encontrado nesse período.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {(planejamentosQuery.data || []).map((item: any) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPlanejamentoId(Number(item.id));
                          setAba("cotacao");
                        }}
                        className="block w-full text-left"
                      >
                        <p className="font-black text-white">
                          Planejamento #{item.id}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          {item.totalMedidas} medidas • {item.totalPneus} pneus
                        </p>
                        <p className="mt-1 text-[11px] text-gray-600">
                          {item.diasAnalise} dias analisados →{" "}
                          {item.diasProjecao} dias projetados
                        </p>
                        <p className="mt-2 text-[11px] font-bold text-gray-500">
                          {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </button>

                      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.05] pt-3">
                        {item.status === "pedido_salvo" && (
                          <button
                            type="button"
                            disabled={excluirPedidosRecenteMutation.isPending}
                            onClick={() => {
                              const confirmar = window.confirm(
                                `Excluir os pedidos do Planejamento #${item.id}? O planejamento e a cotação serão mantidos.`
                              );

                              if (confirmar) {
                                excluirPedidosRecenteMutation.mutate({
                                  planejamentoId: Number(item.id),
                                });
                              }
                            }}
                            className="h-9 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-3 text-[11px] font-black text-rose-200 disabled:opacity-50"
                          >
                            Excluir pedido(s)
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={excluirPlanejamentoRecenteMutation.isPending}
                          onClick={() => {
                            const confirmar = window.confirm(
                              `Excluir o Planejamento #${item.id}? Isso excluirá também cotações e pedidos vinculados.`
                            );

                            if (confirmar) {
                              excluirPlanejamentoRecenteMutation.mutate({
                                planejamentoId: Number(item.id),
                              });
                            }
                          }}
                          className="h-9 rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-3 text-[11px] font-black text-rose-300 disabled:opacity-50"
                        >
                          Excluir planejamento
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        )}

        {aba === "cotacao" && (
          <div className="mt-5 space-y-5">
            {!planejamentoId ? (
              <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.04] p-6 text-sm text-amber-100">
                Salve ou abra um planejamento para iniciar a cotação.
              </div>
            ) : (
              <>
                <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#0a0a0a] p-5 sm:p-6">
                  <div>
                    <h2 className="text-xl font-black">Fornecedores</h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Cada fornecedor recebe sua própria planilha. A coluna C vem com o nome dele e é onde ele preenche os preços. A quantidade nunca é enviada.
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={novoFornecedor}
                      onChange={(event) => setNovoFornecedor(event.target.value)}
                      placeholder="Nome do fornecedor"
                      className="h-11 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (novoFornecedor.trim()) {
                          criarFornecedorMutation.mutate({ nome: novoFornecedor.trim() });
                        }
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] px-4 text-sm font-black text-[#F2D675]"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar fornecedor
                    </button>
                  </div>

                  {fornecedores.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm text-gray-500">
                      Cadastre pelo menos um fornecedor para iniciar a cotação.
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-xs leading-5 text-gray-500">
                      {fornecedores.length} fornecedor(es) cadastrado(s).
                      <span className="ml-1 font-black text-[#F2D675]">
                        Use o nome do fornecedor no cabeçalho do mapa de cotação abaixo.
                      </span>
                    </div>
                  )}
                </section>

                <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#090909]">
                  <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-black">Mapa de cotação</h2>
                      <p className="mt-1 text-xs text-gray-500">
                        Informe os valores. O menor fica destacado, mas a escolha final é sua.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          selecionarMenoresMutation.mutate({ planejamentoId })
                        }
                        className="inline-flex h-10 items-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 text-xs font-black text-emerald-200"
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Selecionar menores preços
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          fecharPedidosMutation.mutate({ planejamentoId })
                        }
                        disabled={fecharPedidosMutation.isPending}
                        className="inline-flex h-10 items-center rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black disabled:opacity-50"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Fechar cotação e salvar pedidos
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-max w-full text-sm">
                      <thead className="bg-white/[0.025] text-left text-[10px] uppercase tracking-[0.08em] text-gray-600">
                        <tr>
                          <th className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-3">Medida</th>
                          <th className="px-4 py-3 text-right">Qtd interna</th>
                          <th className="px-4 py-3 text-right">Melhor UF</th>
                          {fornecedores.map((fornecedor: any) => {
                            const recebidos = ((detalheQuery.data?.cotacoes || []) as any[]).filter(
                              (cotacao) =>
                                Number(cotacao.fornecedorId) === Number(fornecedor.id) &&
                                Number(cotacao.valor || 0) > 0
                            ).length;
                            const total = itensCotacao.length;

                            return (
                              <th key={fornecedor.id} className="min-w-[185px] px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => setFornecedorModal(fornecedor)}
                                  className="w-full rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-[#D4AF37]/25 hover:bg-[#D4AF37]/[0.06]"
                                  title={`Abrir opções de ${fornecedor.nome}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-black text-gray-400 hover:text-[#F2D675]">
                                      {fornecedor.nome}
                                    </span>
                                    <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[9px] font-black text-gray-600">
                                      {recebidos}/{total}
                                    </span>
                                  </div>
                                </button>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {itensCotacao.map((item: any) => {
                          const menor = menorPrecoItem(item.id);
                          return (
                            <tr key={item.id} className="border-t border-white/[0.05]">
                              <td className="sticky left-0 z-10 bg-[#090909] px-4 py-3 font-black text-white">
                                {item.medida}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  step={4}
                                  defaultValue={item.quantidadeFinal}
                                  onBlur={(event) =>
                                    atualizarQuantidadeMutation.mutate({
                                      itemId: item.id,
                                      quantidadeFinal: Number(event.target.value || 0),
                                    })
                                  }
                                  className="h-9 w-20 rounded-lg border border-white/10 bg-black/30 px-2 text-right font-black text-[#F2D675]"
                                />
                              </td>
                              <td className="px-4 py-3 text-right text-gray-400">
                                {item.melhorPrecoUf > 0 ? moeda(item.melhorPrecoUf) : "—"}
                              </td>

                              {fornecedores.map((fornecedor: any) => {
                                const chave = `${item.id}:${fornecedor.id}`;
                                const salvo = cotacoes.get(chave);
                                const valorAtual =
                                  cotacaoLocal[chave] !== undefined
                                    ? cotacaoLocal[chave]
                                    : salvo
                                    ? Number(salvo).toFixed(2).replace(".", ",")
                                    : "";
                                const escolhido =
                                  Number(item.fornecedorSelecionadoId || 0) ===
                                  Number(fornecedor.id);
                                const ehMenor =
                                  salvo && menor !== null && Number(salvo) === Number(menor);

                                return (
                                  <td
                                    key={fornecedor.id}
                                    className={`px-3 py-2 ${
                                      escolhido
                                        ? "bg-[#D4AF37]/[0.07]"
                                        : ehMenor
                                        ? "bg-emerald-400/[0.035]"
                                        : ""
                                    }`}
                                  >
                                    <div className="flex min-w-[160px] gap-1.5">
                                      <input
                                        value={valorAtual}
                                        onChange={(event) =>
                                          setCotacaoLocal((atual) => ({
                                            ...atual,
                                            [chave]: event.target.value,
                                          }))
                                        }
                                        onBlur={() => salvarValor(item.id, fornecedor.id)}
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        className={`h-9 min-w-0 flex-1 rounded-lg border bg-black/30 px-2 text-right text-sm outline-none ${
                                          ehMenor
                                            ? "border-emerald-400/25 text-emerald-200"
                                            : "border-white/10 text-white"
                                        }`}
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          selecionarFornecedorMutation.mutate({
                                            itemId: item.id,
                                            fornecedorId: fornecedor.id,
                                          })
                                        }
                                        className={`h-9 rounded-lg px-2.5 text-[10px] font-black ${
                                          escolhido
                                            ? "bg-[#D4AF37] text-black"
                                            : "border border-white/10 text-gray-400"
                                        }`}
                                      >
                                        {escolhido ? "OK" : "Escolher"}
                                      </button>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {aba === "pedidos" && (
          <div className="mt-5">
            {!planejamentoId ? (
              <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.04] p-6 text-sm text-amber-100">
                Abra um planejamento primeiro.
              </div>
            ) : (pedidosQuery.data || []).length === 0 ? (
              <div className="rounded-3xl border border-white/[0.08] bg-[#090909] p-6">
                <ShoppingCart className="h-7 w-7 text-[#F2D675]" />
                <h2 className="mt-4 font-black">Nenhum pedido formado ainda</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Na Cotação, escolha um fornecedor para cada medida. Os pedidos serão separados automaticamente.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {(pedidosQuery.data || []).map((grupo: any) => (
                  <section
                    key={grupo.fornecedorId}
                    className="overflow-hidden rounded-3xl border border-[#D4AF37]/20 bg-[#090909]"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-5">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D4AF37]/60">
                          Pedido
                        </p>
                        <h2 className="mt-1 text-xl font-black text-white">
                          {grupo.fornecedorNome}
                        </h2>
                        <p className="mt-2 text-xs text-gray-500">
                          {grupo.itens.length} medidas • {grupo.totalPneus} pneus • {moeda(grupo.totalValor)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          arquivoPedidoMutation.mutate({
                            planejamentoId,
                            fornecedorId: grupo.fornecedorId,
                          })
                        }
                        className="flex h-10 items-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] px-3 text-xs font-black text-[#F2D675]"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Baixar
                      </button>
                    </div>

                    <div className="divide-y divide-white/[0.05]">
                      {grupo.itens.map((item: any) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3"
                        >
                          <div>
                            <p className="font-black text-white">{item.medida}</p>
                            <p className="mt-1 text-xs text-gray-600">
                              {moeda(item.preco)} cada
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-[#F2D675]">{item.quantidade} un.</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {moeda(item.total)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === "promocionais" && (
          <div className="mt-5">
            <ComprasPneusPromocionais />
          </div>
        )}

        {aba === "historico" && (
          <div className="mt-5">
            <ComprasPneusHistorico
              lojaInicial={Number(lojaId) || null}
              onAbrir={(id, destino) => {
                setPlanejamentoId(id);
                setAba(destino);
              }}
            />
          </div>
        )}

        {aba === "config" && (
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <section className="rounded-3xl border border-white/[0.08] bg-[#090909] p-5 sm:p-6">
              <h2 className="font-black">Regras por medida</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Defina promocionais (+12) e medidas que precisam manter jogos completos de 4 pneus.
              </p>

              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <input
                  value={novaRegraMedida}
                  onChange={(event) => setNovaRegraMedida(event.target.value)}
                  placeholder="Ex.: 205/55/16"
                  className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
                />
                <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-gray-300">
                  <input
                    type="checkbox"
                    checked={novaRegraPromo}
                    onChange={(event) => setNovaRegraPromo(event.target.checked)}
                  />
                  Promocional
                </label>
                <select
                  value={novaRegraJogos}
                  onChange={(event) => setNovaRegraJogos(event.target.value)}
                  className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
                >
                  <option value="0">Sem mínimo</option>
                  <option value="1">1 jogo</option>
                  <option value="2">2 jogos</option>
                  <option value="3">3 jogos</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!novaRegraMedida.trim()) return;
                    salvarRegraMutation.mutate({
                      lojaId: Number(lojaId),
                      medida: novaRegraMedida.trim(),
                      promocional: novaRegraPromo,
                      jogosMinimos: Number(novaRegraJogos),
                    });
                  }}
                  className="h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black"
                >
                  Salvar
                </button>
              </div>

              <div className="mt-5 max-h-[430px] space-y-2 overflow-y-auto">
                {(regrasQuery.data || []).map((regra: any) => (
                  <div
                    key={regra.medida}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
                  >
                    <div>
                      <p className="font-black text-white">{regra.medida}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {regra.promocional ? "Promocional +12" : "Normal"}
                        {regra.jogosMinimos > 0
                          ? ` • mínimo ${regra.jogosMinimos} jogo(s)`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        salvarRegraMutation.mutate({
                          lojaId: Number(lojaId),
                          medida: regra.medida,
                          promocional: !regra.promocional,
                          jogosMinimos: regra.jogosMinimos,
                        })
                      }
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-400"
                    >
                      {regra.promocional ? "Tirar promo" : "Marcar promo"}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/[0.08] bg-[#090909] p-5 sm:p-6">
              <h2 className="font-black">Marcas nacionais desconsideradas</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Lista automática do sistema. Estas marcas não contam para formar os 2 jogos mínimos.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  "Pirelli",
                  "Goodyear",
                  "Bridgestone",
                  "Firestone",
                  "Continental",
                  "Michelin",
                  "Fate",
                  "Agate",
                ].map((marca) => (
                  <span
                    key={marca}
                    className="inline-flex items-center rounded-full border border-sky-400/15 bg-sky-400/[0.04] px-3 py-1.5 text-xs font-black text-sky-200"
                  >
                    {marca}
                  </span>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-gray-500">
                Regra fixa: não existe cadastro manual. Qualquer alteração nesta lista deve ser feita na regra do sistema.
              </div>

              <div className="mt-8 border-t border-white/[0.06] pt-5">
                <h3 className="font-black">Fornecedores cadastrados</h3>
                <div className="mt-3 space-y-2">
                  {(fornecedoresQuery.data || []).map((fornecedor: any) => (
                    <div
                      key={fornecedor.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] px-4 py-3"
                    >
                      <span className={fornecedor.ativo ? "font-bold text-white" : "text-gray-600"}>
                        {fornecedor.nome}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          definirFornecedorAtivoMutation.mutate({
                            id: fornecedor.id,
                            ativo: !fornecedor.ativo,
                          })
                        }
                        className="text-xs font-black text-[#F2D675]"
                      >
                        {fornecedor.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {fornecedorModal && planejamentoId && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Fechar"
              className="absolute inset-0 h-full w-full bg-black/80 backdrop-blur-sm"
              onClick={() => setFornecedorModal(null)}
            />
            <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[#D4AF37]/20 bg-[#0a0a0a] p-5 shadow-2xl sm:p-6">
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setFornecedorModal(null)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">
                Cotação do fornecedor
              </p>
              <h2 className="mt-2 pr-10 text-2xl font-black text-white">
                {fornecedorModal.nome}
              </h2>
              <p className="mt-4 text-sm leading-6 text-gray-500">
                Escolha uma das ações abaixo.
              </p>

              {erro && (
                <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-xs leading-5 text-rose-200">
                  {erro}
                </div>
              )}

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={() =>
                    arquivoCotacaoFornecedorMutation.mutate({
                      planejamentoId,
                      fornecedorId: Number(fornecedorModal.id),
                    })
                  }
                  disabled={arquivoCotacaoFornecedorMutation.isPending}
                  className="flex min-h-16 items-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.06] px-4 text-left transition hover:bg-[#D4AF37]/[0.1] disabled:opacity-50"
                >
                  <div className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10">
                    <Download className="h-5 w-5 text-[#F2D675]" />
                  </div>
                  <div>
                    <p className="font-black text-white">Baixar arquivo de cotação</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Gera a planilha específica de {fornecedorModal.nome}.
                    </p>
                  </div>
                </button>

                <label className="flex min-h-16 cursor-pointer items-center rounded-2xl border border-white/10 bg-white/[0.025] px-4 text-left transition hover:border-emerald-400/20 hover:bg-emerald-400/[0.035]">
                  <div className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/[0.06]">
                    <Upload className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-white">
                      {importarCotacaoFornecedorMutation.isPending
                        ? "Importando cotação..."
                        : "Anexar arquivo preenchido"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Importa automaticamente os valores na coluna de {fornecedorModal.nome}.
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    disabled={importarCotacaoFornecedorMutation.isPending}
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      void importarPlanilhaFornecedor(
                        file,
                        Number(fornecedorModal.id)
                      );
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-8 border-t border-white/[0.05] py-5 text-center text-[11px] text-gray-700">
          Compras de Pneus • {String(user?.name || "Usuário")}
        </footer>
      </div>
    </main>
  );
}
