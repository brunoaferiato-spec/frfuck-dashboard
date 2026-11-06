import { useState } from "react";

function moeda(valor: unknown) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(valor || 0)
  );
}

// Tabela da análise que gerou o planejamento (a mesma da "Sugestão de compra"),
// para consultar vendas, estoque e projeção de compras já salvas.
export default function ComprasPneusAnaliseSalva({
  planejamentoId,
  lojaNome,
  carregando,
  planejamento,
  itens,
  onFechar,
}: {
  planejamentoId: number;
  lojaNome: string;
  carregando: boolean;
  planejamento: any;
  itens: any[];
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [soComCompra, setSoComCompra] = useState(true);
  const numero = (valor: unknown) => Number(valor || 0);
  const termo = busca.trim().toLowerCase();

  const visiveis = itens
    .filter((item) => !soComCompra || numero(item.quantidadeFinal) > 0)
    .filter((item) => !termo || String(item.medida || "").toLowerCase().includes(termo))
    .sort((a, b) =>
      String(a.medida).localeCompare(String(b.medida), "pt-BR", { numeric: true })
    );

  const totalCompra = itens.reduce((s, item) => s + numero(item.quantidadeFinal), 0);
  const totalVendas = itens.reduce((s, item) => s + numero(item.vendas), 0);
  const totalEstoque = itens.reduce((s, item) => s + numero(item.estoque), 0);
  const comCompra = itens.filter((item) => numero(item.quantidadeFinal) > 0).length;

  const resumo: Array<[string, number]> = [
    ["Medidas analisadas", itens.length],
    ["Medidas com compra", comCompra],
    ["Vendas no período", totalVendas],
    ["Pneus comprados", totalCompra],
  ];

  return (
    <section
      id="analise-salva-pneus"
      className="mt-5 scroll-mt-4 overflow-hidden rounded-3xl border border-[#D4AF37]/20 bg-[#070707]"
    >
      <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">
            Análise salva
          </p>
          <h2 className="mt-1 text-lg font-black text-white">
            Planejamento #{planejamentoId}
            {lojaNome ? <span className="ml-2 text-sm text-[#F2D675]">{lojaNome}</span> : null}
          </h2>
          {planejamento && (
            <p className="mt-1 text-xs text-gray-500">
              {planejamento.createdAt
                ? new Date(planejamento.createdAt).toLocaleDateString("pt-BR")
                : ""}
              {" • "}
              {planejamento.diasAnalise} dias analisados → {planejamento.diasProjecao} dias projetados
              {planejamento.arquivoVendasNome ? ` • ${planejamento.arquivoVendasNome}` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="h-9 self-start rounded-lg border border-white/10 px-3 text-xs font-black text-gray-300 hover:text-white"
        >
          Fechar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        {resumo.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">
              {rotulo}
            </p>
            <p className="mt-1 text-xl font-black text-white">{valor}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:items-center">
        <input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar medida"
          className="h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white sm:max-w-xs"
        />
        <div className="flex rounded-xl border border-white/10 p-1 text-xs font-black">
          <button
            type="button"
            onClick={() => setSoComCompra(true)}
            className={`rounded-lg px-3 py-1.5 ${soComCompra ? "bg-[#D4AF37] text-black" : "text-gray-400"}`}
          >
            Só com compra
          </button>
          <button
            type="button"
            onClick={() => setSoComCompra(false)}
            className={`rounded-lg px-3 py-1.5 ${!soComCompra ? "bg-[#D4AF37] text-black" : "text-gray-400"}`}
          >
            Todas as medidas
          </button>
        </div>
        <span className="text-xs text-gray-600 sm:ml-auto">
          Estoque total na análise: {totalEstoque}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
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
              <th className="px-4 py-3 text-right">Sugerido</th>
              <th className="px-4 py-3 text-right">Compra</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                  Carregando análise...
                </td>
              </tr>
            ) : visiveis.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                  Nenhuma medida encontrada.
                </td>
              </tr>
            ) : (
              visiveis.map((item) => {
                const final = numero(item.quantidadeFinal);
                const sugerida = numero(item.quantidadeSugerida);
                const jogosMinimos = numero(item.jogosMinimos);
                const promocional = Boolean(numero(item.promocional));
                return (
                  <tr
                    key={item.id ?? item.medida}
                    className={`border-t border-white/[0.05] ${final > 0 ? "" : "opacity-55"}`}
                  >
                    <td className="px-4 py-3 font-black text-white">{item.medida}</td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {numero(item.melhorPrecoUf) > 0 ? moeda(item.melhorPrecoUf) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{numero(item.vendas)}</td>
                    <td className="px-4 py-3 text-right">{numero(item.estoque)}</td>
                    <td className="px-4 py-3 text-right">{numero(item.projecao).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {promocional && (
                          <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-[10px] font-black text-amber-200">
                            PROMO +{numero(item.adicionalPromocional) || 12}
                          </span>
                        )}
                        {jogosMinimos > 0 && (
                          <span className="rounded-md border border-sky-400/20 bg-sky-400/[0.06] px-2 py-1 text-[10px] font-black text-sky-200">
                            MÍN. {jogosMinimos} JOGOS
                          </span>
                        )}
                        {!promocional && jogosMinimos === 0 && "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {jogosMinimos > 0
                        ? `${numero(item.jogosValidos)}/${jogosMinimos}`
                        : numero(item.jogosValidos)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${
                        numero(item.necessidade) > 2 ? "text-amber-200" : "text-gray-600"
                      }`}
                    >
                      {numero(item.necessidade).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{sugerida}</td>
                    <td
                      className={`px-4 py-3 text-right font-black ${
                        final !== sugerida ? "text-sky-200" : "text-[#F2D675]"
                      }`}
                      title={final !== sugerida ? "Quantidade ajustada à mão" : undefined}
                    >
                      {final}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
