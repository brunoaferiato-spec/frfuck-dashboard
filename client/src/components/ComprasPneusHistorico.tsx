import { trpc } from "@/lib/trpc";
import { CalendarDays, Filter, PackageSearch, ReceiptText, Search } from "lucide-react";
import { useMemo, useState } from "react";

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

function dataHora(valor: unknown) {
  if (!valor) return "—";
  const texto = String(valor).replace(" ", "T");
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return String(valor);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function nomeLoja(lojaId: number) {
  return LOJAS_COMPRAS.find((item) => item.id === Number(lojaId))?.nome || `Loja ${lojaId}`;
}

function statusLabel(status: string) {
  if (status === "pedido_salvo") return "Pedidos salvos";
  if (status === "cotacao") return "Em cotação";
  return "Planejamento";
}

export default function ComprasPneusHistorico({
  lojaInicial,
  onAbrir,
}: {
  lojaInicial?: number | null;
  onAbrir: (planejamentoId: number, destino: "cotacao" | "pedidos") => void;
}) {
  const [lojaId, setLojaId] = useState(
    lojaInicial && lojaInicial > 0 ? String(lojaInicial) : "todas"
  );
  const [fornecedorId, setFornecedorId] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [busca, setBusca] = useState("");

  const fornecedoresQuery = trpc.compras.pneus.fornecedores.useQuery();

  const historicoQuery = trpc.compras.pneus.historico.useQuery({
    lojaId: lojaId === "todas" ? null : Number(lojaId),
    fornecedorId: fornecedorId === "todos" ? null : Number(fornecedorId),
    status: status as "todos" | "planejamento" | "cotacao" | "pedido_salvo",
    dataInicio: dataInicio || null,
    dataFim: dataFim || null,
    busca: busca.trim() || null,
  });

  const fornecedores = useMemo(
    () => fornecedoresQuery.data || [],
    [fornecedoresQuery.data]
  );

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-[#090909]">
      <div className="border-b border-white/[0.06] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] p-2.5">
            <PackageSearch className="h-5 w-5 text-[#F2D675]" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Histórico de compras</h2>
            <p className="mt-1 text-sm text-gray-500">
              Consulte planejamentos, cotações e pedidos salvos.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-500">Loja</label>
            <select
              value={lojaId}
              onChange={(event) => setLojaId(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
            >
              <option value="todas">Todas</option>
              {LOJAS_COMPRAS.map((loja) => (
                <option key={loja.id} value={loja.id}>
                  {loja.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-500">Fornecedor</label>
            <select
              value={fornecedorId}
              onChange={(event) => setFornecedorId(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
            >
              <option value="todos">Todos</option>
              {fornecedores.map((fornecedor: any) => (
                <option key={fornecedor.id} value={fornecedor.id}>
                  {fornecedor.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-500">Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
            >
              <option value="todos">Todos</option>
              <option value="planejamento">Planejamento</option>
              <option value="cotacao">Em cotação</option>
              <option value="pedido_salvo">Pedidos salvos</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-500">De</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(event) => setDataInicio(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-500">Até</label>
            <input
              type="date"
              value={dataFim}
              onChange={(event) => setDataFim(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-500">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-600" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="ID ou medida"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {historicoQuery.isLoading ? (
        <div className="p-8 text-center text-sm text-gray-500">Carregando histórico...</div>
      ) : (historicoQuery.data || []).length === 0 ? (
        <div className="p-8 text-center">
          <Filter className="mx-auto h-6 w-6 text-gray-700" />
          <p className="mt-3 text-sm font-bold text-gray-500">Nenhum registro encontrado.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {(historicoQuery.data || []).map((item: any) => (
            <div
              key={item.id}
              className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-white">Planejamento #{item.id}</p>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                      item.status === "pedido_salvo"
                        ? "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-300"
                        : item.status === "cotacao"
                        ? "border-amber-400/20 bg-amber-400/[0.05] text-amber-200"
                        : "border-white/10 bg-white/[0.03] text-gray-400"
                    }`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {nomeLoja(item.lojaId)} • {item.diasAnalise} dias analisados → {item.diasProjecao} dias projetados
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {dataHora(item.createdAt)}
                  {item.criadoPorNome ? ` • ${item.criadoPorNome}` : ""}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">
                  Cotação
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {item.totalCotacoes} valores
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {item.fornecedoresCotados} fornecedor(es)
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">
                  Pedidos salvos
                </p>
                <p className="mt-2 text-lg font-black text-[#F2D675]">
                  {item.pedidosSalvos}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {item.totalPneusPedido} pneus • {moeda(item.totalValorPedido)}
                </p>
              </div>

              <div className="flex flex-row gap-2 lg:flex-col lg:justify-center">
                <button
                  type="button"
                  onClick={() => onAbrir(Number(item.id), "cotacao")}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 px-3 text-xs font-black text-gray-300"
                >
                  <ReceiptText className="mr-2 h-4 w-4" />
                  Cotação
                </button>
                <button
                  type="button"
                  onClick={() => onAbrir(Number(item.id), "pedidos")}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] px-3 text-xs font-black text-[#F2D675]"
                >
                  Pedidos
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
