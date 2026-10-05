import { useMemo, useState } from "react";
import { Check, Download, MapPin, Save, Settings2, Trash2, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ItemAnalise = {
  codigo: string;
  item: string;
  grupo: string;
  vendaPeriodo: number;
  estoqueAtual: number;
  necessidadeBruta: number;
  quantidadeCompra: number;
  ladoIndividual?: string | null;
  motivoRevisao?: string | null;
};

type Aba = "cotacao" | "pedidos" | "historico" | "fornecedores";

const LOJAS_PECAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

function moeda(v: number) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function baixar(nome: string, mime: string, base64: string) {
  const s = atob(base64); const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url);
}

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()); let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export default function ComprasPecasCotacao({ itens, arquivoNome }: { itens: ItemAnalise[]; arquivoNome: string }) {
  const utils = trpc.useUtils();
  const [aba, setAba] = useState<Aba>("cotacao");
  const [planejamentoId, setPlanejamentoId] = useState<number | null>(null);
  const [novoFornecedor, setNovoFornecedor] = useState("");
  const [fornecedorModal, setFornecedorModal] = useState<any | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [quantidadeLocal, setQuantidadeLocal] = useState<Record<string, string>>({});
  const [lojaId, setLojaId] = useState("1");
  const [filtroLojaHistorico, setFiltroLojaHistorico] = useState("todas");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const lojasQ = trpc.lojas.list.useQuery(undefined, { retry: false });
  const fornecedoresQ = trpc.compras.pecas.fornecedores.useQuery();
  const planosQ = trpc.compras.pecas.planejamentos.useQuery();

  const lojas = useMemo(() => {
    const recebidas = (lojasQ.data || []) as Array<{ id: number; nome: string }>;
    const porId = new Map(recebidas.map((loja) => [Number(loja.id), loja]));

    return LOJAS_PECAS.map((loja) => {
      const recebida = porId.get(loja.id);
      return recebida
        ? {
            ...loja,
            ...recebida,
            id: Number(recebida.id),
            nome: recebida.nome || loja.nome,
          }
        : { ...loja };
    });
  }, [lojasQ.data]);

  const lojaSelecionada =
    lojas.find((loja) => Number(loja.id) === Number(lojaId)) || lojas[0];

  const planosHistorico = useMemo(
    () =>
      (planosQ.data || []).filter(
        (plano: any) =>
          filtroLojaHistorico === "todas" ||
          Number(plano.lojaId || 0) === Number(filtroLojaHistorico)
      ),
    [planosQ.data, filtroLojaHistorico]
  );
  const detalheQ = trpc.compras.pecas.detalhe.useQuery({ planejamentoId: planejamentoId || 0 }, { enabled: !!planejamentoId });
  const pedidosQ = trpc.compras.pecas.pedidos.useQuery({ planejamentoId: planejamentoId || 0 }, { enabled: !!planejamentoId });

  const criarPlano = trpc.compras.pecas.criarPlanejamento.useMutation({
    onSuccess: async (d) => { setPlanejamentoId(Number(d.planejamentoId)); setMensagem(`Planejamento #${d.planejamentoId} salvo.`); setErro(""); await planosQ.refetch(); setAba("cotacao"); },
    onError: (e) => setErro(e.message),
  });
  const criarFornecedor = trpc.compras.pecas.criarFornecedor.useMutation({ onSuccess: async()=>{setNovoFornecedor("");await fornecedoresQ.refetch();}, onError:(e)=>setErro(e.message) });
  const toggleFornecedor = trpc.compras.pecas.definirFornecedorAtivo.useMutation({ onSuccess:async()=>{await fornecedoresQ.refetch();} });
  const atualizarQuantidade = trpc.compras.pecas.atualizarQuantidade.useMutation({
    onSuccess: async (data) => {
      setQuantidadeLocal((atual) => {
        const novo = { ...atual };
        delete novo[String(data.itemId)];
        return novo;
      });
      setMensagem(`Quantidade atualizada para ${data.quantidadeFinal}.`);
      setErro("");
      await detalheQ.refetch();
      await planosQ.refetch();
    },
    onError: (e) => setErro(e.message),
  });
  const salvarCotacao = trpc.compras.pecas.salvarCotacao.useMutation({ onSuccess:async()=>{await detalheQ.refetch();await planosQ.refetch();}, onError:(e)=>setErro(e.message) });
  const selecionar = trpc.compras.pecas.selecionarFornecedor.useMutation({ onSuccess:async()=>{await detalheQ.refetch();}, onError:(e)=>setErro(e.message) });
  const menores = trpc.compras.pecas.selecionarMenores.useMutation({ onSuccess:async(d)=>{setMensagem(`${d.selecionados} menor(es) preço(s) selecionado(s).`);await detalheQ.refetch();}, onError:(e)=>setErro(e.message) });
  const arquivoCotacao = trpc.compras.pecas.arquivoCotacaoFornecedor.useMutation({ onSuccess:(d)=>baixar(d.nome,d.mime,d.base64), onError:(e)=>setErro(e.message) });
  const importarCotacao = trpc.compras.pecas.importarCotacaoFornecedor.useMutation({ onSuccess:async(d)=>{setFornecedorModal(null);setMensagem(`${d.importados} preço(s) importado(s).`);await detalheQ.refetch();await planosQ.refetch();}, onError:(e)=>setErro(e.message) });
  const fechar = trpc.compras.pecas.fecharPedidos.useMutation({ onSuccess:async(d)=>{setMensagem(d.jaSalvo?"Pedidos já estavam salvos.":`${d.pedidos} pedido(s) salvo(s).`);await pedidosQ.refetch();await planosQ.refetch();setAba("pedidos");}, onError:(e)=>setErro(e.message) });
  const arquivoPedido = trpc.compras.pecas.arquivoPedido.useMutation({ onSuccess:(d)=>baixar(d.nome,d.mime,d.base64), onError:(e)=>setErro(e.message) });

  const excluirPedidos = trpc.compras.pecas.excluirPedidosPlanejamento.useMutation({
    onSuccess: async (data) => {
      setMensagem(
        `${data.excluidos || 0} pedido(s) excluído(s). A cotação foi reaberta.`
      );
      setErro("");
      await pedidosQ.refetch();
      await detalheQ.refetch();
      await planosQ.refetch();
      setAba("cotacao");
    },
    onError: (e) => setErro(e.message),
  });

  const excluirPlanejamento = trpc.compras.pecas.excluirPlanejamento.useMutation({
    onSuccess: async (data) => {
      setMensagem(`Planejamento #${data.planejamentoId} excluído.`);
      setErro("");
      if (planejamentoId === Number(data.planejamentoId)) {
        setPlanejamentoId(null);
      }
      await planosQ.refetch();
      setAba("historico");
    },
    onError: (e) => setErro(e.message),
  });

  const fornecedores = useMemo(()=> (fornecedoresQ.data || []).filter((x:any)=>x.ativo), [fornecedoresQ.data]);
  const quoteMap = useMemo(()=>{ const m=new Map<string,number>(); for(const q of detalheQ.data?.cotacoes || []) m.set(`${q.itemId}-${q.fornecedorId}`,Number(q.valor||0)); return m;},[detalheQ.data?.cotacoes]);
  const countMap = useMemo(()=>{ const m=new Map<number,number>(); for(const q of detalheQ.data?.cotacoes || []) m.set(Number(q.fornecedorId),(m.get(Number(q.fornecedorId))||0)+1); return m;},[detalheQ.data?.cotacoes]);

  function salvarPlanejamento(){
    if (!lojaSelecionada) {
      setErro("Selecione a cidade da compra.");
      return;
    }

    criarPlano.mutate({
      lojaId: Number(lojaSelecionada.id),
      lojaNome: lojaSelecionada.nome,
      arquivoNome: arquivoNome || null,
      itens: itens.map((x)=>({
        codigo:x.codigo,
        item:x.item,
        grupo:x.grupo,
        especificacao:x.motivoRevisao||null,
        vendaPeriodo:Number(x.vendaPeriodo||0),
        estoqueAtual:Number(x.estoqueAtual||0),
        necessidade:Number(x.necessidadeBruta||0),
        quantidadeFinal:Number(x.quantidadeCompra||0),
        lado:x.ladoIndividual||null
      }))
    });
  }

  async function importar(file: File | null, fornecedorId:number){ if(!file||!planejamentoId)return; importarCotacao.mutate({planejamentoId,fornecedorId,arquivoNome:file.name,arquivoBase64:await toBase64(file)}); }

  return <section className="mt-5 rounded-3xl border border-[#D4AF37]/20 bg-[#090909] p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.15em] text-[#D4AF37]/60">COTAÇÃO E PEDIDOS</p>
        <h2 className="mt-1 text-xl font-black">Fluxo de fornecedores</h2>
        <p className="mt-1 text-xs text-gray-600">Quantidade de compra pode ser ajustada na coluna Qtd interna.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">
            Cidade da compra
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#D4AF37]" />
            <select
              value={lojaId}
              disabled={Boolean(planejamentoId)}
              onChange={(e) => setLojaId(e.target.value)}
              className="h-11 min-w-[190px] rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {lojas.map((loja) => (
                <option key={loja.id} value={String(loja.id)}>
                  {loja.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!planejamentoId && (
          <button
            type="button"
            onClick={salvarPlanejamento}
            disabled={criarPlano.isPending || !lojaSelecionada}
            className="h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black disabled:opacity-50"
          >
            <Save className="mr-2 inline h-4 w-4"/>
            Salvar planejamento
          </button>
        )}

        {planejamentoId && (
          <div className="h-11 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-4 py-3 text-xs font-black text-[#F2D675]">
            {detalheQ.data?.planejamento?.lojaNome || lojaSelecionada?.nome || "Cidade"}
          </div>
        )}
      </div>
    </div>

    {(mensagem||erro)&&<div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${erro?"border-rose-400/20 text-rose-200":"border-emerald-400/20 text-emerald-200"}`}>{erro||mensagem}</div>}

    <div className="mt-5 flex flex-wrap gap-2">{([['cotacao','Cotação'],['pedidos','Pedidos'],['historico','Histórico'],['fornecedores','Fornecedores']] as Array<[Aba,string]>).map(([v,l])=><button key={v} type="button" onClick={()=>setAba(v)} className={`rounded-xl px-4 py-2 text-xs font-black ${aba===v?"bg-[#D4AF37] text-black":"border border-white/10 text-gray-400"}`}>{l}</button>)}</div>

    {aba==='cotacao' && <div className="mt-5">
      {!planejamentoId ? <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Salve o planejamento para iniciar a cotação.</div> : fornecedores.length===0 ? <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Cadastre fornecedores na aba Fornecedores.</div> : <>
        <div className="mb-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={()=>menores.mutate({planejamentoId})} className="h-10 rounded-xl border border-emerald-400/20 px-4 text-xs font-black text-emerald-200"><Check className="mr-2 inline h-4 w-4"/>Selecionar menores preços</button><button type="button" onClick={()=>fechar.mutate({planejamentoId})} className="h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black"><Save className="mr-2 inline h-4 w-4"/>Fechar cotação e salvar pedidos</button></div>
        <div className="overflow-x-auto"><table className="min-w-[950px] w-full text-xs"><thead className="bg-white/[0.025] text-[9px] uppercase text-gray-600"><tr><th className="px-3 py-3 text-left">Código</th><th className="px-3 py-3 text-left">Item</th><th className="px-3 py-3 text-right">Qtd interna</th>{fornecedores.map((f:any)=><th key={f.id} className="px-3 py-3 text-center"><button type="button" onClick={()=>setFornecedorModal(f)} className="font-black text-gray-300 hover:text-[#F2D675]">{f.nome}</button><span className="ml-2 rounded-full bg-white/[0.04] px-2 py-1">{countMap.get(Number(f.id))||0}/{detalheQ.data?.itens?.length||0}</span></th>)}</tr></thead><tbody>{(detalheQ.data?.itens||[]).map((it:any)=><tr key={it.id} className="border-t border-white/[0.05]"><td className="px-3 py-3 font-black text-[#F2D675]">{it.codigo}</td><td className="px-3 py-3 font-bold">{it.item}</td><td className="px-3 py-2 text-right">
  <input
    type="number"
    min={0}
    step={1}
    inputMode="numeric"
    disabled={
      atualizarQuantidade.isPending ||
      detalheQ.data?.planejamento?.status === "pedido_salvo"
    }
    value={
      quantidadeLocal[String(it.id)] !== undefined
        ? quantidadeLocal[String(it.id)]
        : String(it.quantidadeFinal ?? 0)
    }
    onChange={(e) => {
      const valor = e.target.value.replace(/[^0-9]/g, "");
      setQuantidadeLocal((atual) => ({
        ...atual,
        [String(it.id)]: valor,
      }));
    }}
    onBlur={() => {
      const chave = String(it.id);
      const bruto =
        quantidadeLocal[chave] !== undefined
          ? quantidadeLocal[chave]
          : String(it.quantidadeFinal ?? 0);
      const quantidade = Math.max(0, Math.floor(Number(bruto || 0)));

      if (quantidade !== Number(it.quantidadeFinal || 0)) {
        atualizarQuantidade.mutate({
          itemId: Number(it.id),
          quantidadeFinal: quantidade,
        });
      } else {
        setQuantidadeLocal((atual) => {
          const novo = { ...atual };
          delete novo[chave];
          return novo;
        });
      }
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter") e.currentTarget.blur();
    }}
    className="h-10 w-20 rounded-xl border border-[#D4AF37]/25 bg-black/30 px-2 text-center font-black text-[#F2D675] outline-none disabled:opacity-50"
    title="Quantidade de compra editável"
  />
</td>{fornecedores.map((f:any)=>{const key=`${it.id}-${f.id}`;const saved=quoteMap.get(key);const val=local[key]!==undefined?local[key]:(saved?Number(saved).toFixed(2).replace('.',','):'');const sel=Number(it.fornecedorSelecionadoId)===Number(f.id);return <td key={f.id} className={`px-3 py-2 ${sel?'bg-[#D4AF37]/[0.06]':''}`}><div className="flex min-w-[190px] gap-2"><input value={val} placeholder="0,00" onChange={e=>setLocal(a=>({...a,[key]:e.target.value}))} onBlur={()=>{const n=Number(String(val).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));if(n>0)salvarCotacao.mutate({itemId:Number(it.id),fornecedorId:Number(f.id),valor:n});}} className="h-10 min-w-0 flex-1 rounded-xl border border-emerald-400/20 bg-black/30 px-3 text-right text-emerald-200 outline-none"/>{saved&&<button type="button" onClick={()=>selecionar.mutate({itemId:Number(it.id),fornecedorId:Number(f.id)})} className={`h-10 rounded-xl px-3 text-[10px] font-black ${sel?'bg-[#D4AF37] text-black':'border border-white/10 text-gray-400'}`}>{sel?'OK':'Escolher'}</button>}</div></td>})}</tr>)}</tbody></table></div>
      </>}
    </div>}

    {aba==='pedidos' && <div className="mt-5">
      {!planejamentoId ? (
        <div className="text-gray-500">Abra um planejamento pelo Histórico.</div>
      ) : (pedidosQ.data||[]).length===0 ? (
        <div className="rounded-2xl border border-white/[0.06] p-8 text-center text-gray-500">Nenhum pedido salvo.</div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div>
              <p className="font-black text-white">
                {detalheQ.data?.planejamento?.lojaNome || "Cidade não informada"}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Se precisar corrigir quantidades ou fornecedores, exclua os pedidos e reabra a cotação.
              </p>
            </div>
            <button
              type="button"
              disabled={excluirPedidos.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Excluir todos os pedidos do Planejamento #${planejamentoId}? A cotação será mantida e poderá ser refeita.`
                  )
                ) {
                  excluirPedidos.mutate({ planejamentoId });
                }
              }}
              className="h-10 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 text-xs font-black text-rose-300 disabled:opacity-50"
            >
              <Trash2 className="mr-2 inline h-4 w-4"/>
              Excluir pedidos e reabrir cotação
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {(pedidosQ.data||[]).map((p:any)=><div key={p.id} className="rounded-2xl border border-white/[0.07] p-4"><p className="text-xs text-gray-600">Fornecedor</p><h3 className="mt-1 text-xl font-black">{p.fornecedorNome}</h3><p className="mt-3 text-sm text-gray-500">{p.totalItens} itens • {p.totalQuantidade} unidades</p><p className="mt-2 text-2xl font-black text-[#F2D675]">{moeda(p.totalValor)}</p><button type="button" onClick={()=>arquivoPedido.mutate({pedidoId:Number(p.id)})} className="mt-4 h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black"><Download className="mr-2 inline h-4 w-4"/>Baixar pedido</button></div>)}
          </div>
        </>
      )}
    </div>}

    {aba==='historico' && <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.08em] text-gray-600">
            Filtrar por cidade
          </p>
          <select
            value={filtroLojaHistorico}
            onChange={(e) => setFiltroLojaHistorico(e.target.value)}
            className="mt-1 h-10 min-w-[190px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-bold text-white"
          >
            <option value="todas">Todas as cidades</option>
            {lojas.map((loja) => (
              <option key={loja.id} value={String(loja.id)}>
                {loja.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {planosHistorico.map((p:any)=><div key={p.id} className="rounded-2xl border border-white/[0.07] p-4">
          <button
            type="button"
            onClick={()=>{
              setPlanejamentoId(Number(p.id));
              if (p.lojaId) setLojaId(String(p.lojaId));
              setAba(p.status==='pedido_salvo'?'pedidos':'cotacao');
            }}
            className="block w-full text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-black">Planejamento #{p.id}</p>
              <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/[0.04] px-2 py-1 text-[9px] font-black text-[#F2D675]">
                {p.lojaNome || "Sem cidade"}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">{p.totalItens} itens • {p.totalQuantidade} unidades</p>
            <p className="mt-2 text-[11px] font-bold text-[#F2D675]">{p.status==='pedido_salvo'?'Pedido salvo':p.status==='cotacao'?'Em cotação':'Planejamento'}</p>
            <p className="mt-2 text-[11px] text-gray-600">{new Date(p.createdAt).toLocaleString('pt-BR')}</p>
          </button>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.05] pt-3">
            {p.status === 'pedido_salvo' && (
              <button
                type="button"
                disabled={excluirPedidos.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Excluir os pedidos do Planejamento #${p.id}? A cotação será mantida.`
                    )
                  ) {
                    setPlanejamentoId(Number(p.id));
                    if (p.lojaId) setLojaId(String(p.lojaId));
                    excluirPedidos.mutate({ planejamentoId: Number(p.id) });
                  }
                }}
                className="h-9 rounded-lg border border-rose-400/20 px-3 text-[11px] font-black text-rose-200 disabled:opacity-50"
              >
                Excluir pedido(s)
              </button>
            )}

            <button
              type="button"
              disabled={excluirPlanejamento.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Excluir o Planejamento #${p.id}? Isso também excluirá cotações e pedidos vinculados.`
                  )
                ) {
                  excluirPlanejamento.mutate({
                    planejamentoId: Number(p.id),
                  });
                }
              }}
              className="h-9 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 text-[11px] font-black text-rose-300 disabled:opacity-50"
            >
              <Trash2 className="mr-1.5 inline h-3.5 w-3.5"/>
              Excluir planejamento
            </button>
          </div>
        </div>)}
      </div>
    </div>}

    {aba==='fornecedores' && <div className="mt-5"><div className="flex gap-2"><input value={novoFornecedor} onChange={e=>setNovoFornecedor(e.target.value)} placeholder="Nome do fornecedor" className="h-11 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm"/><button type="button" onClick={()=>novoFornecedor.trim()&&criarFornecedor.mutate({nome:novoFornecedor.trim()})} className="h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black"><Settings2 className="mr-2 inline h-4 w-4"/>Adicionar</button></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{(fornecedoresQ.data||[]).map((f:any)=><div key={f.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] px-4 py-3"><span className={f.ativo?'font-bold':'text-gray-600'}>{f.nome}</span><button type="button" onClick={()=>toggleFornecedor.mutate({id:Number(f.id),ativo:!f.ativo})} className="text-xs font-black text-[#F2D675]">{f.ativo?'Desativar':'Ativar'}</button></div>)}</div></div>}

    {fornecedorModal&&planejamentoId&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#0a0a0a] p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D4AF37]/60">COTAÇÃO DO FORNECEDOR</p><h2 className="mt-1 text-2xl font-black">{fornecedorModal.nome}</h2><p className="mt-2 text-xs text-gray-500">{countMap.get(Number(fornecedorModal.id))||0}/{detalheQ.data?.itens?.length||0} preços recebidos</p></div><button type="button" onClick={()=>setFornecedorModal(null)} className="rounded-xl border border-white/10 p-2 text-gray-500"><X className="h-4 w-4"/></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>arquivoCotacao.mutate({planejamentoId,fornecedorId:Number(fornecedorModal.id)})} className="rounded-2xl border border-[#D4AF37]/20 p-5 text-left"><Download className="h-5 w-5 text-[#F2D675]"/><p className="mt-3 font-black">Baixar arquivo de cotação</p><p className="mt-1 text-xs text-gray-600">Código e item travados. Só o preço fica editável.</p></button><label className="cursor-pointer rounded-2xl border border-emerald-400/20 p-5"><Upload className="h-5 w-5 text-emerald-300"/><p className="mt-3 font-black">Anexar arquivo preenchido</p><p className="mt-1 text-xs text-gray-600">Os preços entram automaticamente.</p><input type="file" accept=".xlsx" className="hidden" onChange={e=>{void importar(e.target.files?.[0]||null,Number(fornecedorModal.id));e.currentTarget.value='';}}/></label></div></div></div>}
  </section>;
}
