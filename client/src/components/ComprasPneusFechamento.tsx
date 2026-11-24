import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, FileText, PackageCheck, RotateCcw, Trash2, Truck, Upload } from "lucide-react";
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";

// Fechamento do pedido de pneus, todo feito pelo Compras: registra o que a loja avisou que chegou,
// anexa o XML da nota e o sistema compara pedido × recebido × nota. Tudo certo finaliza; com diferença, pede justificativa.

type Lista = inferRouterOutputs<AppRouter>["compras"]["pneus"]["fechamento"]["lista"];
type ItemLista = Lista["aguardando"][number];

const DIAS_ALERTA_CHEGADA = 7;

function moeda(v: number | null | undefined) {
  return v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBr(valor: unknown) {
  const d = new Date(String(valor || ""));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export default function ComprasPneusFechamento({ somenteLeitura }: { somenteLeitura: boolean }) {
  const listaQ = trpc.compras.pneus.fechamento.lista.useQuery(undefined, { refetchInterval: 60_000 });
  const [selecionado, setSelecionado] = useState<number | null>(null);

  if (selecionado) {
    return (
      <Detalhe
        pedidoId={selecionado}
        somenteLeitura={somenteLeitura}
        onVoltar={() => {
          setSelecionado(null);
          void listaQ.refetch();
        }}
      />
    );
  }

  if (listaQ.isLoading) return <p className="mt-5 text-sm text-gray-500">Carregando…</p>;
  if (listaQ.error) return <p className="mt-5 text-sm text-rose-300">{listaQ.error.message}</p>;
  const { aguardando = [], conferidos = [], finalizados = [] } = listaQ.data || {};
  const atrasados = aguardando.filter((p) => p.diasDesdePedido >= DIAS_ALERTA_CHEGADA).length;

  return (
    <div className="mt-5 space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card icone={<PackageCheck className="h-5 w-5 text-emerald-300" />} titulo="Para fechar" valor={conferidos.length} texto="Chegada registrada: falta conferir a nota e finalizar." />
        <Card
          icone={<Truck className="h-5 w-5 text-sky-300" />}
          titulo="Aguardando chegada"
          valor={aguardando.length}
          texto={atrasados ? `${atrasados} há ${DIAS_ALERTA_CHEGADA} dias ou mais sem chegada registrada` : "Registre quando a loja avisar que chegou."}
          alerta={atrasados > 0}
        />
        <Card icone={<CheckCircle2 className="h-5 w-5 text-fri-f2d675" />} titulo="Finalizados" valor={finalizados.length} texto="Nos últimos 60 dias." />
      </div>

      <Secao titulo="Para fechar (chegada registrada)" vazio="Nenhum pedido esperando fechamento." itens={conferidos} onAbrir={setSelecionado} />
      <Secao titulo="Aguardando chegada" vazio="Nenhum pedido aguardando chegada." itens={aguardando} onAbrir={setSelecionado} />
      <Secao titulo="Finalizados (60 dias)" vazio="Nenhum pedido finalizado ainda." itens={finalizados} onAbrir={setSelecionado} />
    </div>
  );
}

function Card({ icone, titulo, valor, texto, alerta }: { icone: React.ReactNode; titulo: string; valor: number; texto: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${alerta ? "border-amber-400/30 bg-amber-400/[0.04]" : "border-white/[0.07] bg-fr-0a0a0a"}`}>
      <div className="flex items-center gap-2">
        {icone}
        <p className="text-xs font-black uppercase tracking-[0.1em] text-gray-400">{titulo}</p>
      </div>
      <p className="mt-2 text-3xl font-black">{valor}</p>
      <p className={`mt-1 text-xs ${alerta ? "text-amber-200" : "text-gray-500"}`}>{texto}</p>
    </div>
  );
}

function Secao({ titulo, vazio, itens, onAbrir }: { titulo: string; vazio: string; itens: ItemLista[]; onAbrir: (id: number) => void }) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">{titulo}</p>
      {!itens.length ? (
        <p className="rounded-2xl border border-white/[0.06] px-4 py-3 text-sm text-gray-600">{vazio}</p>
      ) : (
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.07] bg-fr-0a0a0a">
          {itens.map((p) => (
            <button key={p.id} type="button" onClick={() => onAbrir(p.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
              <div className="min-w-0">
                <p className="font-black">
                  {p.fornecedorNome} <span className="text-gray-500">• {p.loja}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Pedido #{p.id} (planejamento #{p.planejamentoId}) • {p.totalPneus} pneus • {moeda(p.totalValor)} • feito em {dataBr(p.createdAt)}
                </p>
              </div>
              <Etiqueta p={p} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Etiqueta({ p }: { p: ItemLista }) {
  const base = "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-black";
  if (p.status === "aguardando") {
    const atrasado = p.diasDesdePedido >= DIAS_ALERTA_CHEGADA;
    return (
      <span className={`${base} ${atrasado ? "border-amber-400/30 text-amber-200" : "border-white/10 text-gray-400"}`}>
        <Clock className="mr-1 inline h-3 w-3" />há {p.diasDesdePedido} dia(s){p.notas ? ` • ${p.notas} nota(s)` : ""}
      </span>
    );
  }
  if (p.status === "conferido") {
    return p.diferencasLoja ? (
      <span className={`${base} border-amber-400/30 text-amber-200`}>Chegada: {p.diferencasLoja} diferença(s)</span>
    ) : (
      <span className={`${base} border-emerald-400/30 text-emerald-200`}>Chegou tudo</span>
    );
  }
  return p.finalizadoComDivergencia ? (
    <span className={`${base} border-amber-400/30 text-amber-200`}>Finalizado com justificativa</span>
  ) : (
    <span className={`${base} border-emerald-400/30 text-emerald-200`}>Finalizado OK</span>
  );
}

function Detalhe({ pedidoId, somenteLeitura, onVoltar }: { pedidoId: number; somenteLeitura: boolean; onVoltar: () => void }) {
  const detalheQ = trpc.compras.pneus.fechamento.detalhe.useQuery({ pedidoId });
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [numeroManual, setNumeroManual] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [lendo, setLendo] = useState(false);

  const ok = (texto: string) => {
    setErro("");
    setMensagem(texto);
    void detalheQ.refetch();
  };
  const falha = (e: { message: string }) => {
    setMensagem("");
    setErro(e.message);
  };
  const anexar = trpc.compras.pneus.fechamento.anexarNota.useMutation({ onError: falha });
  const manual = trpc.compras.pneus.fechamento.notaManual.useMutation({
    onSuccess: () => {
      setNumeroManual("");
      setValorManual("");
      ok("Nota registrada sem XML.");
    },
    onError: falha,
  });
  const remover = trpc.compras.pneus.fechamento.removerNota.useMutation({ onSuccess: () => ok("Nota removida."), onError: falha });
  const associar = trpc.compras.pneus.fechamento.associarItemNota.useMutation({ onSuccess: () => ok("Item da nota associado."), onError: falha });
  const [qtd, setQtd] = useState<Record<number, string>>({});
  const [obsChegada, setObsChegada] = useState("");
  const registrar = trpc.compras.pneus.fechamento.registrarRecebimento.useMutation({
    onSuccess: (d) => ok(d.diferencas ? `Chegada registrada com ${d.diferencas} diferença(s).` : "Chegada registrada: chegou tudo."),
    onError: falha,
  });
  const corrigir = trpc.compras.pneus.fechamento.corrigirRecebimento.useMutation({
    onSuccess: () => ok("Pode corrigir as quantidades que chegaram."),
    onError: falha,
  });
  const finalizar = trpc.compras.pneus.fechamento.finalizar.useMutation({
    onSuccess: (d) => ok(d.divergente ? "Pedido finalizado com justificativa." : "Pedido finalizado: tudo conferido."),
    onError: falha,
  });

  async function anexarArquivos(files: FileList | null) {
    if (!files?.length) return;
    setErro("");
    setMensagem("");
    setLendo(true);
    const resultados: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const xml = await file.text();
          const r = await anexar.mutateAsync({ pedidoId, xml });
          resultados.push(`Nota ${r.numero} anexada (${r.itens} item(ns)).`);
        } catch (e: any) {
          resultados.push(`${file.name}: ${e?.message || "não foi possível ler."}`);
        }
      }
    } finally {
      setLendo(false);
      setMensagem(resultados.join(" "));
      void detalheQ.refetch();
    }
  }

  if (detalheQ.isLoading) return <p className="mt-5 text-sm text-gray-500">Carregando…</p>;
  if (detalheQ.error || !detalheQ.data) {
    return (
      <div className="mt-5">
        <button type="button" onClick={onVoltar} className="text-sm font-black text-fri-f2d675"><ArrowLeft className="mr-1 inline h-4 w-4" />Voltar</button>
        <p className="mt-3 text-sm text-rose-300">{detalheQ.error?.message || "Pedido não encontrado."}</p>
      </div>
    );
  }

  const { pedido, notas, comparacao, medidas, itens } = detalheQ.data;
  const valorQtd = (i: (typeof itens)[number]) => qtd[i.id] ?? (i.quantidadeRecebida == null ? "" : String(i.quantidadeRecebida));
  const preenchidos = itens.filter((i) => valorQtd(i).trim() !== "").length;
  const aberto = pedido.status !== "finalizado";
  const podeEditar = aberto && !somenteLeitura;
  const diferencaTotal = comparacao.totalNotas - comparacao.totalPedido;

  return (
    <div className="mt-5 space-y-5">
      <button type="button" onClick={onVoltar} className="text-sm font-black text-fri-f2d675">
        <ArrowLeft className="mr-1 inline h-4 w-4" />Voltar para a lista
      </button>

      <section className="rounded-3xl border border-fr-d4af37/20 bg-fr-0a0a0a p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-fri-d4af37/60">Fechamento do pedido #{pedido.id}</p>
        <h2 className="mt-1 text-2xl font-black">
          {pedido.fornecedorNome} <span className="text-gray-500">• {pedido.loja}</span>
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Planejamento #{pedido.planejamentoId} • feito em {dataBr(pedido.createdAt)} • {pedido.totalPneus} pneus • {moeda(pedido.totalValor)}
        </p>
        <div className="mt-3 text-sm">
          {pedido.status === "aguardando" && (
            <p className="text-sky-200"><Truck className="mr-1.5 inline h-4 w-4" />Aguardando chegada (pedido há {pedido.diasDesdePedido} dia(s)). Quando a loja avisar, registre abaixo o que chegou. A nota já pode ser anexada.</p>
          )}
          {pedido.status !== "aguardando" && (
            <p className="text-gray-300">
              <PackageCheck className="mr-1.5 inline h-4 w-4 text-emerald-300" />
              Chegada registrada em {dataBr(pedido.recebidoEm)} por {pedido.recebidoPorNome || "—"}.
            </p>
          )}
          {pedido.recebimentoObs && <p className="mt-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-gray-300">Obs. da chegada: {pedido.recebimentoObs}</p>}
          {pedido.status === "finalizado" && (
            <p className={`mt-2 ${pedido.finalizadoComDivergencia ? "text-amber-200" : "text-emerald-200"}`}>
              <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
              Finalizado em {dataBr(pedido.finalizadoEm)} por {pedido.finalizadoPorNome || "—"}
              {pedido.finalizadoComDivergencia ? " com justificativa" : " sem divergências"}.
            </p>
          )}
          {pedido.justificativa && <p className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-xs text-amber-100">Justificativa: {pedido.justificativa}</p>}
        </div>
      </section>

      {(mensagem || erro) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${erro ? "border-rose-400/20 bg-rose-400/[0.05] text-rose-200" : "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200"}`}>
          {erro || mensagem}
        </div>
      )}

      {/* Registrar o que chegou */}
      {podeEditar && pedido.status === "aguardando" && (
        <section className="overflow-hidden rounded-3xl border border-sky-400/20 bg-fr-0a0a0a">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <h3 className="font-black"><Truck className="mr-1.5 inline h-4 w-4 text-sky-300" />O que chegou na loja</h3>
              <p className="mt-1 text-xs text-gray-500">Digite a quantidade que a loja conferiu de cada medida (0 se não veio).</p>
            </div>
            <button type="button" onClick={() => setQtd(Object.fromEntries(itens.map((i) => [i.id, String(i.quantidade)])))}
              className="inline-flex h-9 items-center rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 text-xs font-black text-emerald-200">
              <Check className="mr-1.5 h-4 w-4" />Chegou tudo
            </button>
          </div>
          <div className="divide-y divide-white/[0.05]">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-gray-500">
              <span>Medida</span><span className="w-16 text-right">Pedido</span><span className="w-20 text-right">Chegou</span>
            </div>
            {itens.map((i) => {
              const v = valorQtd(i);
              const diferente = v.trim() !== "" && Number(v) !== i.quantidade;
              return (
                <div key={i.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-1.5">
                  <span className="font-black">{i.medida}</span>
                  <span className="w-16 text-right text-sm text-gray-400">{i.quantidade}</span>
                  <input value={v} inputMode="numeric" placeholder="—" aria-label={`Quantidade que chegou de ${i.medida}`}
                    onChange={(e) => setQtd((a) => ({ ...a, [i.id]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    className={`h-10 w-20 rounded-xl border bg-black/30 px-2 text-right text-sm font-black outline-none focus:border-fr-d4af37 ${diferente ? "border-amber-400/60 text-amber-200" : "border-white/10 text-white"}`} />
                </div>
              );
            })}
          </div>
          <div className="space-y-3 border-t border-white/[0.06] p-5">
            <input value={obsChegada} onChange={(e) => setObsChegada(e.target.value)} maxLength={1000}
              placeholder="Observação (ex.: conferido pelo João; 2 pneus vieram com avaria)"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-fr-d4af37" />
            <div className="flex justify-end">
              <button type="button" disabled={preenchidos < itens.length || registrar.isPending}
                onClick={() => registrar.mutate({
                  pedidoId,
                  itens: itens.map((i) => ({ itemId: i.id, quantidadeRecebida: Math.max(0, Math.floor(Number(valorQtd(i)) || 0)) })),
                  obs: obsChegada.trim(),
                })}
                className="h-10 rounded-xl bg-fr-d4af37 px-5 text-xs font-black text-black disabled:opacity-40">
                {registrar.isPending ? "Registrando…" : `Registrar chegada${preenchidos < itens.length ? ` (${preenchidos}/${itens.length})` : ""}`}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Notas */}
      <section className="rounded-3xl border border-white/[0.07] bg-fr-0a0a0a p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-black"><FileText className="mr-1.5 inline h-4 w-4 text-fri-f2d675" />Nota(s) fiscal(is)</h3>
            <p className="mt-1 text-xs text-gray-500">Anexe o XML que o fornecedor mandou. Se a entrega veio em mais de uma nota, anexe todas.</p>
          </div>
          {podeEditar && (
            <label className={`inline-flex h-10 cursor-pointer items-center rounded-xl bg-fr-d4af37 px-4 text-xs font-black text-black ${lendo ? "opacity-50" : ""}`}>
              <Upload className="mr-2 h-4 w-4" />
              {lendo ? "Lendo…" : "Anexar XML"}
              <input type="file" accept=".xml,text/xml,application/xml" multiple className="hidden" disabled={lendo}
                onChange={(e) => { void anexarArquivos(e.target.files); e.currentTarget.value = ""; }} />
            </label>
          )}
        </div>

        {notas.length > 0 ? (
          <div className="mt-4 divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.06]">
            {notas.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-black">
                    NF {n.numero}{n.serie ? `-${n.serie}` : ""} {n.manual && <span className="ml-1 rounded-full border border-white/10 px-2 text-[10px] text-gray-400">sem XML</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {n.emitenteNome || "—"}{n.dataEmissao ? ` • emitida em ${dataBr(n.dataEmissao)}` : ""} • {moeda(n.valorTotal)} • anexada por {n.anexadoPorNome || "—"}
                  </p>
                </div>
                {podeEditar && (
                  <button type="button" disabled={remover.isPending}
                    onClick={() => { if (window.confirm(`Remover a nota ${n.numero} deste pedido?`)) remover.mutate({ notaId: n.id }); }}
                    className="rounded-lg border border-rose-400/20 px-2.5 py-1 text-[11px] font-black text-rose-300 disabled:opacity-50">
                    <Trash2 className="mr-1 inline h-3.5 w-3.5" />Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-600">Nenhuma nota anexada ainda.</p>
        )}

        {podeEditar && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs font-bold text-gray-500">O fornecedor não mandou o XML? Informar só o número da nota</summary>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input value={numeroManual} onChange={(e) => setNumeroManual(e.target.value)} placeholder="Número da nota" maxLength={20}
                className="h-10 w-40 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" />
              <input value={valorManual} onChange={(e) => setValorManual(e.target.value)} placeholder="Valor total (opcional)" inputMode="decimal"
                className="h-10 w-44 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white" />
              <button type="button" disabled={!numeroManual.trim() || manual.isPending}
                onClick={() => {
                  const limpo = valorManual.replace(/[^0-9,.]/g, "");
                  const valor = limpo ? Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo) : null;
                  manual.mutate({ pedidoId, numero: numeroManual.trim(), valorTotal: valor != null && Number.isFinite(valor) ? valor : null });
                }}
                className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-300 disabled:opacity-50">
                Registrar nota
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600">Sem o XML o sistema não confere a nota item por item: só compara o pedido com o que a loja recebeu.</p>
          </details>
        )}
      </section>

      {/* Avisos */}
      {comparacao.avisos.length > 0 && (
        <div className="space-y-2">
          {comparacao.avisos.map((a, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${a.tipo === "grave" ? "border-rose-400/25 bg-rose-400/[0.06] text-rose-200" : "border-amber-400/25 bg-amber-400/[0.06] text-amber-100"}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{a.texto}
            </div>
          ))}
        </div>
      )}

      {/* Comparação */}
      <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-fr-0a0a0a">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <h3 className="font-black">Pedido × chegou na loja × nota</h3>
          {!comparacao.temXml && <p className="mt-1 text-xs text-gray-500">Sem XML anexado: a coluna da nota fica vazia.</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-[0.08em] text-gray-500">
                <th className="px-5 py-2">Medida</th>
                <th className="px-3 py-2 text-right">Pedido</th>
                <th className="px-3 py-2 text-right">Chegou</th>
                <th className="px-3 py-2 text-right">Nota</th>
                <th className="px-3 py-2 text-right">Preço pedido</th>
                <th className="px-3 py-2 text-right">Preço nota</th>
                <th className="px-5 py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {comparacao.linhas.map((l) => (
                <tr key={l.itemId} className={l.problemas.some((p) => p.tipo === "grave") ? "bg-rose-400/[0.03]" : l.problemas.length ? "bg-amber-400/[0.03]" : ""}>
                  <td className="px-5 py-2 font-black">{l.medida}</td>
                  <td className="px-3 py-2 text-right">{l.pedida}</td>
                  <td className="px-3 py-2 text-right">{l.recebida ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{l.notaQtd ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{moeda(l.precoPedido)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">
                    {moeda(l.precoNota)}
                    {l.precoNotaComImpostos != null && l.precoNota != null && Math.abs(l.precoNotaComImpostos - l.precoNota) >= 0.01 && (
                      <span className="block text-[10px] text-gray-600">c/ impostos {moeda(l.precoNotaComImpostos)}</span>
                    )}
                  </td>
                  <td className="px-5 py-2">
                    {!l.problemas.length ? (
                      <span className="text-xs font-black text-emerald-300">OK</span>
                    ) : (
                      <div className="space-y-0.5">
                        {l.problemas.map((p, i) => (
                          <p key={i} className={`text-xs font-bold ${p.tipo === "grave" ? "text-rose-300" : "text-amber-200"}`}>{p.texto}</p>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-white/[0.06] px-5 py-3 text-sm">
          <span>Total do pedido: <b>{moeda(comparacao.totalPedido)}</b></span>
          {notas.length > 0 && <span>Total da(s) nota(s): <b>{moeda(comparacao.totalNotas)}</b></span>}
          {notas.length > 0 && comparacao.totalNotas > 0 && Math.abs(diferencaTotal) >= 0.01 && (
            <span className={diferencaTotal > 0 ? "text-rose-300" : "text-amber-200"}>
              Diferença: <b>{diferencaTotal > 0 ? "+" : ""}{moeda(diferencaTotal)}</b>
            </span>
          )}
        </div>
      </section>

      {/* Itens da nota que não casaram com o pedido */}
      {comparacao.foraDoPedido.length > 0 && (
        <section className="rounded-3xl border border-rose-400/20 bg-fr-0a0a0a p-5">
          <h3 className="font-black text-rose-200">Itens da nota que não estão no pedido</h3>
          <p className="mt-1 text-xs text-gray-500">Se for uma medida do pedido escrita de outro jeito pelo fornecedor, escolha a medida para o sistema conferir.</p>
          <div className="mt-3 divide-y divide-white/[0.05]">
            {comparacao.foraDoPedido.map((item) => (
              <div key={`${item.notaId}-${item.indice}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-bold">{item.descricao}</p>
                  <p className="text-xs text-gray-500">NF {item.notaNumero} • cód. {item.codigo || "—"} • {item.quantidade} × {moeda(item.unitario)}</p>
                </div>
                {podeEditar && (
                  <select defaultValue="" disabled={associar.isPending}
                    onChange={(e) => { if (e.target.value) associar.mutate({ notaId: item.notaId, indice: item.indice, medida: e.target.value }); }}
                    className="h-9 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white">
                    <option value="">É a medida…</option>
                    {medidas.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Finalizar */}
      {podeEditar && pedido.status === "conferido" && (
        <section className={`rounded-3xl border p-5 ${comparacao.divergente ? "border-amber-400/25 bg-amber-400/[0.03]" : "border-emerald-400/25 bg-emerald-400/[0.03]"}`}>
          {!notas.length ? (
            <p className="text-sm text-gray-400">Anexe a nota (ou informe o número dela) para finalizar.</p>
          ) : comparacao.divergente ? (
            <>
              <p className="text-sm font-black text-amber-100"><AlertTriangle className="mr-1.5 inline h-4 w-4" />Tem diferença: para finalizar, escreva a justificativa.</p>
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} maxLength={2000}
                placeholder="Ex.: fornecedor vai mandar os 2 que faltaram na próxima semana / preço reajustado, autorizado pelo Bruno"
                className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-fr-d4af37" />
            </>
          ) : (
            <p className="text-sm font-black text-emerald-200"><CheckCircle2 className="mr-1.5 inline h-4 w-4" />Pedido, recebimento e nota conferem.</p>
          )}
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <button type="button" disabled={corrigir.isPending}
              onClick={() => corrigir.mutate({ pedidoId })}
              className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400 disabled:opacity-50">
              <RotateCcw className="mr-1.5 inline h-4 w-4" />Corrigir o que chegou
            </button>
            <button type="button"
              disabled={!notas.length || finalizar.isPending || (comparacao.divergente && justificativa.trim().length < 10)}
              onClick={() => finalizar.mutate({ pedidoId, justificativa: justificativa.trim() })}
              className="h-10 rounded-xl bg-fr-d4af37 px-5 text-xs font-black text-black disabled:opacity-40">
              {finalizar.isPending ? "Finalizando…" : comparacao.divergente ? "Finalizar com justificativa" : "Finalizar pedido"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
