import { Check, CircleDot, Loader2, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

// Portal do fornecedor (link fixo, sem login): responde as cotações de pneus em aberto.

type EstadoItem = "salvando" | "salvo" | "erro";

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Aceita "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56". Vazio = sem preço.
function lerPreco(texto: string): number | null {
  const limpo = String(texto || "").replace(/[^0-9,.]/g, "");
  if (!limpo) return null;
  // "1.250" (ponto de milhar, sem vírgula) é mil duzentos e cinquenta, não 1,25.
  const soMilhar = !limpo.includes(",") && /^\d{1,3}(\.\d{3})+$/.test(limpo);
  const normalizado = limpo.includes(",") || soMilhar ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero > 0 ? Number(numero.toFixed(2)) : null;
}

function precoParaTexto(valor: number | null) {
  return valor && valor > 0 ? valor.toFixed(2).replace(".", ",") : "";
}

// Erro de validação vem como texto técnico (JSON): mostra uma frase simples no lugar.
function mensagemAmigavel(error: any, padrao: string) {
  const texto = String(error?.message || "");
  return !texto || texto.trim().startsWith("[") ? padrao : texto;
}

function dataCurta(valor: unknown) {
  const data = new Date(String(valor || ""));
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleDateString("pt-BR");
}

export default function CotacaoFornecedorPneus({ token }: { token: string }) {
  const portal = trpc.compras.pneus.portalFornecedor.useQuery(
    { token },
    { retry: false, refetchOnWindowFocus: true }
  );
  const salvar = trpc.compras.pneus.portalSalvarPrecos.useMutation();

  // Texto digitado que ainda não foi salvo, por item.
  const [digitado, setDigitado] = useState<Record<number, string>>({});
  const [estado, setEstado] = useState<Record<number, EstadoItem>>({});
  const [aviso, setAviso] = useState("");

  const salvos = useMemo(() => {
    const mapa = new Map<number, number | null>();
    for (const cotacao of portal.data?.cotacoes || []) {
      for (const item of cotacao.itens) mapa.set(item.itemId, item.meuPreco);
    }
    return mapa;
  }, [portal.data]);

  function pendentes(itemIds: number[]) {
    return itemIds.filter((id) => {
      if (digitado[id] === undefined) return false;
      return lerPreco(digitado[id]) !== (salvos.get(id) ?? null);
    });
  }

  async function enviar(itemIds: number[]) {
    const lista = pendentes(itemIds);
    if (!lista.length) return;
    setAviso("");
    setEstado((atual) => ({ ...atual, ...Object.fromEntries(lista.map((id) => [id, "salvando" as const])) }));
    try {
      await salvar.mutateAsync({
        token,
        precos: lista.map((itemId) => ({ itemId, valor: lerPreco(digitado[itemId]) })),
      });
      await portal.refetch();
      setDigitado((atual) => {
        const novo = { ...atual };
        for (const id of lista) delete novo[id];
        return novo;
      });
      setEstado((atual) => ({ ...atual, ...Object.fromEntries(lista.map((id) => [id, "salvo" as const])) }));
    } catch (error: any) {
      setEstado((atual) => ({ ...atual, ...Object.fromEntries(lista.map((id) => [id, "erro" as const])) }));
      setAviso(
        mensagemAmigavel(error, "Não foi possível salvar. Confira o valor e a internet e tente de novo.")
      );
    }
  }

  if (portal.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-fr-050505 text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando cotações...
      </main>
    );
  }

  if (portal.error || !portal.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-fr-050505 px-4 text-center">
        <div className="max-w-md rounded-3xl border border-white/10 bg-fr-0b0b0b p-6">
          <CircleDot className="mx-auto h-8 w-8 text-fri-d4af37" />
          <h1 className="mt-3 text-xl font-black text-white">Link indisponível</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            {mensagemAmigavel(
              portal.error,
              "Link inválido ou desativado. Peça um link novo ao comprador."
            )}
          </p>
        </div>
      </main>
    );
  }

  const { fornecedor, cotacoes, diasEmAberto } = portal.data;

  return (
    <main className="min-h-screen bg-fr-050505 px-4 pb-24 pt-6 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fri-d4af37">
            Cotação de pneus
          </p>
          <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">{fornecedor.nome}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            Informe o seu preço unitário em cada medida. O preço é salvo ao sair do campo
            ou no botão Salvar preços. Você pode voltar a este link e alterar enquanto a cotação
            estiver aberta. Guarde este link: as próximas cotações aparecem aqui.
          </p>
        </header>

        {aviso && (
          <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-200">
            {aviso}
          </div>
        )}

        {!cotacoes.length && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-fr-0b0b0b p-6 text-center">
            <Check className="mx-auto h-8 w-8 text-emerald-300" />
            <p className="mt-3 font-black text-white">Nenhuma cotação em aberto agora.</p>
            <p className="mt-1 text-sm text-gray-400">
              Quando houver uma nova, ela aparece aqui neste mesmo link.
            </p>
          </div>
        )}

        {cotacoes.map((cotacao) => {
          const ids = cotacao.itens.map((i) => i.itemId);
          const comPreco = cotacao.itens.filter((i) => (i.meuPreco ?? 0) > 0).length;
          const aSalvar = pendentes(ids).length;
          return (
            <section
              key={cotacao.planejamentoId}
              className="mt-6 overflow-hidden rounded-3xl border border-fr-d4af37/20 bg-fr-0b0b0b"
            >
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] px-4 py-4 sm:px-5">
                <div>
                  <h2 className="text-lg font-black text-white">
                    {cotacao.cidade || "Cotação"} <span className="text-gray-500">#{cotacao.planejamentoId}</span>
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Aberta em {dataCurta(cotacao.criadoEm)} • {comPreco} de {cotacao.itens.length} medidas com preço
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void enviar(ids)}
                  disabled={!aSalvar || salvar.isPending}
                  className="inline-flex h-10 items-center rounded-xl bg-fr-d4af37 px-4 text-xs font-black text-black disabled:opacity-40"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {aSalvar ? `Salvar preços (${aSalvar})` : "Tudo salvo"}
                </button>
              </div>

              <div className="divide-y divide-white/[0.05]">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-gray-500 sm:px-5">
                  <span>Medida</span>
                  <span className="w-24 text-right">Melhor preço UF</span>
                  <span className="w-32 text-right">Seu preço</span>
                </div>
                {cotacao.itens.map((item) => {
                  const valor =
                    digitado[item.itemId] !== undefined ? digitado[item.itemId] : precoParaTexto(item.meuPreco);
                  const st = estado[item.itemId];
                  return (
                    <div
                      key={item.itemId}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 sm:px-5"
                    >
                      <span className="font-black text-white">{item.medida}</span>
                      <span className="w-24 text-right text-xs text-gray-400">
                        {item.melhorPrecoUf > 0 ? moeda(item.melhorPrecoUf) : "—"}
                      </span>
                      <div className="flex w-32 items-center justify-end gap-1.5">
                        <input
                          value={valor}
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label={`Seu preço para ${item.medida}`}
                          onChange={(e) => {
                            const texto = e.target.value;
                            setDigitado((atual) => ({ ...atual, [item.itemId]: texto }));
                            setEstado((atual) => {
                              const novo = { ...atual };
                              delete novo[item.itemId];
                              return novo;
                            });
                          }}
                          onBlur={() => void enviar([item.itemId])}
                          className={`h-10 w-24 rounded-lg border bg-black/30 px-2 text-right text-sm font-black outline-none focus:border-fr-d4af37 ${
                            st === "erro" ? "border-rose-400/60 text-rose-200" : "border-white/10 text-white"
                          }`}
                        />
                        <span className="flex w-4 justify-center">
                          {st === "salvando" && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                          {st === "salvo" && <Check className="h-4 w-4 text-emerald-300" />}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <p className="mt-8 text-center text-[11px] leading-5 text-gray-600">
          Cotações ficam abertas por até {diasEmAberto} dias ou até o comprador fechar o pedido.
        </p>
      </div>
    </main>
  );
}
