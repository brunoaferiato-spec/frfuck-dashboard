import { trpc } from "@/lib/trpc";
import {
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  TrendingDown,
} from "lucide-react";
import { useMemo, useState } from "react";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 7, nome: "Gravataí" },
  { id: 6, nome: "São Leopoldo" },
] as const;

function moeda(valor: unknown) {
  const n = Number(valor || 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

function percentual(valor: unknown) {
  const n = Number(valor || 0);
  return `${n.toFixed(2).replace(".", ",")}%`;
}

function baixarBase64(nome: string, mime: string, base64: string) {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);

  for (let i = 0; i < bytes.length; i += 1) {
    array[i] = bytes.charCodeAt(i);
  }

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

export default function ComprasPneusPromocionais() {
  const utils = trpc.useUtils();

  const [lojaId, setLojaId] = useState("todas");
  const [busca, setBusca] = useState("");
  const [somentePerda, setSomentePerda] = useState(false);
  const [edicoes, setEdicoes] = useState<Record<number, string>>({});
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const query = trpc.compras.pneus.promocionais.useQuery({
    lojaId: lojaId === "todas" ? null : Number(lojaId),
  });

  const atualizarMutation =
    trpc.compras.pneus.atualizarPrecoPromocional.useMutation({
      onSuccess: async (data) => {
        setErro("");
        setMensagem(
          `${data.medida} • ${data.lojaNome}: anúncio atualizado para ${moeda(
            data.precoAnuncio
          )}.`
        );
        setEdicoes((atual) => {
          const proximo = { ...atual };
          delete proximo[data.id];
          return proximo;
        });
        await utils.compras.pneus.promocionais.invalidate();
      },
      onError: (error) =>
        setErro(error.message || "Não foi possível atualizar o anúncio."),
    });

  const exportarMutation =
    trpc.compras.pneus.exportarPromocionais.useMutation({
      onSuccess: (data) => baixarBase64(data.nome, data.mime, data.base64),
      onError: (error) =>
        setErro(error.message || "Não foi possível exportar a tabela."),
    });

  const itens = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return ((query.data || []) as any[]).filter((item) => {
      const atendeBusca =
        !termo ||
        String(item.medida || "").toLowerCase().includes(termo) ||
        String(item.lojaNome || "").toLowerCase().includes(termo);

      const atendePerda =
        !somentePerda ||
        (item.ultimoCusto !== null &&
          Number(item.diferencaMeta10 || 0) < 0);

      return atendeBusca && atendePerda;
    });
  }, [query.data, busca, somentePerda]);

  const resumo = useMemo(() => {
    const comCusto = itens.filter((item) => item.ultimoCusto !== null);
    const abaixoCusto = comCusto.filter(
      (item) => Number(item.diferencaCusto || 0) < 0
    ).length;
    const abaixoMeta = comCusto.filter(
      (item) => Number(item.diferencaMeta10 || 0) < 0
    ).length;
    const impacto = comCusto.reduce(
      (total, item) => total + Number(item.impactoMeta10UltimoPedido || 0),
      0
    );

    return {
      medidas: itens.length,
      comCusto: comCusto.length,
      abaixoCusto,
      abaixoMeta,
      impacto,
    };
  }, [itens]);

  function salvarPreco(item: any) {
    const digitado = edicoes[item.id];
    if (digitado === undefined) return;

    const valor = Number(
      String(digitado).replace(/\./g, "").replace(",", ".")
    );

    if (!Number.isFinite(valor) || valor <= 0) {
      setErro("Informe um preço de anúncio válido.");
      return;
    }

    atualizarMutation.mutate({
      id: Number(item.id),
      precoAnuncio: valor,
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#0a0a0a] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">
              PREÇOS PROMOCIONAIS
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Custo x anúncio
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              O último custo vem automaticamente do último pedido fechado de
              cada medida. A meta considera custo + 10%.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              exportarMutation.mutate({
                lojaId: null,
              })
            }
            disabled={exportarMutation.isPending}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#D4AF37] px-5 text-sm font-black text-black disabled:opacity-50"
          >
            {exportarMutation.isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar Excel • 6 lojas
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <select
            value={lojaId}
            onChange={(event) => setLojaId(event.target.value)}
            className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"
          >
            <option value="todas">Todas as lojas</option>
            {LOJAS.map((loja) => (
              <option key={loja.id} value={loja.id}>
                {loja.nome}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-600" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar medida ou loja"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm text-white"
            />
          </div>

          <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 text-xs font-black text-gray-300">
            <input
              type="checkbox"
              checked={somentePerda}
              onChange={(event) => setSomentePerda(event.target.checked)}
            />
            Só abaixo da meta
          </label>
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
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/[0.07] bg-[#090909] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-600">
            Medidas
          </p>
          <p className="mt-2 text-2xl font-black text-white">{resumo.medidas}</p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#090909] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-600">
            Com custo
          </p>
          <p className="mt-2 text-2xl font-black text-white">{resumo.comCusto}</p>
        </div>

        <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.03] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-rose-300/60">
            Abaixo do custo
          </p>
          <p className="mt-2 text-2xl font-black text-rose-200">
            {resumo.abaixoCusto}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.03] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-amber-300/60">
            Abaixo da meta 10%
          </p>
          <p className="mt-2 text-2xl font-black text-amber-200">
            {resumo.abaixoMeta}
          </p>
        </div>

        <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#D4AF37]/60">
            Gap no último pedido
          </p>
          <p className="mt-2 text-2xl font-black text-[#F2D675]">
            {moeda(resumo.impacto)}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#090909]">
        <div className="hidden lg:block">
          <table className="w-full table-fixed text-[11px] xl:text-xs">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
            </colgroup>

            <thead className="bg-white/[0.025] text-left text-[9px] uppercase tracking-[0.06em] text-gray-600 xl:text-[10px]">
              <tr>
                <th className="px-2 py-3">Loja</th>
                <th className="px-2 py-3">Medida</th>
                <th className="px-2 py-3 text-right">Último custo</th>
                <th className="px-2 py-3 text-right">Custo + 10%</th>
                <th className="px-2 py-3 text-right">Anúncio</th>
                <th className="px-2 py-3 text-right">Gap p/ 10%</th>
                <th className="px-2 py-3 text-right">Margem R$</th>
                <th className="px-2 py-3 text-right">Margem %</th>
                <th className="px-2 py-3 text-right">Qtd. pedido</th>
                <th className="px-2 py-3 text-right">Impacto</th>
              </tr>
            </thead>

            <tbody>
              {query.isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                    Carregando promocionais...
                  </td>
                </tr>
              ) : itens.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                    Nenhum promocional encontrado.
                  </td>
                </tr>
              ) : (
                itens.map((item: any) => {
                  const temCusto = item.ultimoCusto !== null;
                  const abaixoCusto =
                    temCusto && Number(item.diferencaCusto || 0) < 0;
                  const abaixoMeta =
                    temCusto && Number(item.diferencaMeta10 || 0) < 0;
                  const valorEdicao =
                    edicoes[item.id] !== undefined
                      ? edicoes[item.id]
                      : Number(item.precoAnuncio || 0)
                          .toFixed(2)
                          .replace(".", ",");

                  return (
                    <tr key={item.id} className="border-t border-white/[0.05]">
                      <td className="px-2 py-3 font-bold text-gray-300">
                        <a
                          href={item.siteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 truncate hover:text-[#F2D675]"
                          title={`Abrir site de ${item.lojaNome}`}
                        >
                          <span className="truncate">{item.lojaNome}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-[#D4AF37]/60" />
                        </a>
                      </td>
                      <td className="px-2 py-3 font-black text-white">
                        {item.medida}
                      </td>
                      <td className="px-2 py-3 text-right text-gray-300">
                        {temCusto ? moeda(item.ultimoCusto) : "—"}
                      </td>
                      <td className="px-2 py-3 text-right text-gray-300">
                        {temCusto ? moeda(item.custoMeta10) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="ml-auto flex h-9 max-w-[118px] items-center rounded-lg border border-[#D4AF37]/15 bg-black/30 px-2">
                          <span className="mr-1 text-[9px] text-gray-600">R$</span>
                          <input
                            value={valorEdicao}
                            inputMode="decimal"
                            onChange={(event) =>
                              setEdicoes((atual) => ({
                                ...atual,
                                [item.id]: event.target.value,
                              }))
                            }
                            onBlur={() => salvarPreco(item)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                (event.currentTarget as HTMLInputElement).blur();
                              }
                            }}
                            className="min-w-0 flex-1 bg-transparent text-right font-black text-[#F2D675] outline-none"
                          />
                        </div>
                      </td>
                      <td
                        className={`px-2 py-3 text-right font-black ${
                          !temCusto
                            ? "text-gray-700"
                            : abaixoMeta
                            ? "text-rose-300"
                            : "text-emerald-300"
                        }`}
                      >
                        {temCusto ? moeda(item.diferencaMeta10) : "—"}
                      </td>
                      <td
                        className={`px-2 py-3 text-right font-bold ${
                          !temCusto
                            ? "text-gray-700"
                            : abaixoCusto
                            ? "text-rose-300"
                            : "text-emerald-300"
                        }`}
                      >
                        {temCusto ? moeda(item.diferencaCusto) : "—"}
                      </td>
                      <td className="px-2 py-3 text-right text-gray-400">
                        {temCusto ? percentual(item.margemPercentual) : "—"}
                      </td>
                      <td className="px-2 py-3 text-right text-gray-400">
                        {temCusto ? item.quantidadeUltimoPedido : "—"}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {temCusto &&
                        Number(item.impactoMeta10UltimoPedido || 0) > 0 ? (
                          <span className="font-black text-rose-300">
                            {moeda(item.impactoMeta10UltimoPedido)}
                          </span>
                        ) : temCusto ? (
                          <span className="font-bold text-emerald-300">
                            {moeda(0)}
                          </span>
                        ) : (
                          <span className="text-gray-700">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 lg:hidden">
          {query.isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Carregando promocionais...
            </div>
          ) : itens.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Nenhum promocional encontrado.
            </div>
          ) : (
            itens.map((item: any) => {
              const temCusto = item.ultimoCusto !== null;
              const abaixoMeta =
                temCusto && Number(item.diferencaMeta10 || 0) < 0;
              const valorEdicao =
                edicoes[item.id] !== undefined
                  ? edicoes[item.id]
                  : Number(item.precoAnuncio || 0)
                      .toFixed(2)
                      .replace(".", ",");

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{item.medida}</p>
                      <a
                        href={item.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-gray-500"
                      >
                        {item.lojaNome}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    <div className="flex h-10 w-[125px] items-center rounded-lg border border-[#D4AF37]/15 bg-black/30 px-2">
                      <span className="mr-1 text-[10px] text-gray-600">R$</span>
                      <input
                        value={valorEdicao}
                        inputMode="decimal"
                        onChange={(event) =>
                          setEdicoes((atual) => ({
                            ...atual,
                            [item.id]: event.target.value,
                          }))
                        }
                        onBlur={() => salvarPreco(item)}
                        className="min-w-0 flex-1 bg-transparent text-right font-black text-[#F2D675] outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-black/30 p-3">
                      <p className="text-gray-600">Último custo</p>
                      <p className="mt-1 font-black text-gray-300">
                        {temCusto ? moeda(item.ultimoCusto) : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/30 p-3">
                      <p className="text-gray-600">Custo + 10%</p>
                      <p className="mt-1 font-black text-gray-300">
                        {temCusto ? moeda(item.custoMeta10) : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/30 p-3">
                      <p className="text-gray-600">Gap p/ 10%</p>
                      <p
                        className={`mt-1 font-black ${
                          !temCusto
                            ? "text-gray-700"
                            : abaixoMeta
                            ? "text-rose-300"
                            : "text-emerald-300"
                        }`}
                      >
                        {temCusto ? moeda(item.diferencaMeta10) : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/30 p-3">
                      <p className="text-gray-600">Impacto</p>
                      <p className="mt-1 font-black text-rose-300">
                        {temCusto
                          ? moeda(item.impactoMeta10UltimoPedido)
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.025] px-4 py-3 text-xs leading-5 text-sky-100/70">
        O preço anunciado pode ser ajustado manualmente agora. A conferência
        automática semanal dos seis sites será conectada na próxima etapa,
        mantendo histórico das mudanças de anúncio.
      </div>
    </div>
  );
}
