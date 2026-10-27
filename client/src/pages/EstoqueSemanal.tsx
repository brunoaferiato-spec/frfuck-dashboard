import { AlertTriangle, Camera, CheckCircle2, Clock, FileText, Image as ImageIcon, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { EMPRESAS } from "@shared/empresas";
import type { TextoPdfItem } from "@shared/resumoVendaItens";
import { lerEstoqueItens, type RelatorioEstoque } from "@shared/estoqueSemanal";

// Contagem semanal: o estoquista imprime o "ESTOQUE DE ITENS" de cada grupo da semana, conta no papel
// e aqui anexa o PDF, as fotos das folhas e as alterações encontradas (ou marca "sem alteração").

export function dataBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
const qtd = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

async function lerPdf(file: File): Promise<RelatorioEstoque> {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paginas: TextoPdfItem[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    paginas.push((c.items as any[]).map((i) => ({ s: String(i.str || ""), x: i.transform[4], y: i.transform[5], w: i.width || 0 })));
  }
  return lerEstoqueItens(paginas);
}

// Foto da folha: maior que a das peças para dar para ler os números escritos.
async function prepararFoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não foi possível ler a foto."));
      i.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { mime: "image/jpeg", base64: canvas.toDataURL("image/jpeg", 0.7).split(",")[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type Semana = inferRouterOutputs<AppRouter>["estoque"]["semanal"]["semana"];
type Grupo = Semana["grupos"][number];

export const STATUS_SEMANA: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "Pendente", cor: "border-amber-400/30 text-amber-200" },
  atrasada: { texto: "Atrasada", cor: "border-rose-400/40 text-rose-200" },
  entregue: { texto: "Entregue", cor: "border-emerald-400/30 text-emerald-300" },
  entregue_atraso: { texto: "Entregue com atraso", cor: "border-emerald-400/30 text-emerald-300" },
};

export default function EstoqueSemanal() {
  const perfilQ = trpc.estoque.meuPerfil.useQuery();
  const [lojaEscolhida, setLojaEscolhida] = useState<number | null>(null);
  const lojaId = perfilQ.data?.supervisor ? lojaEscolhida : perfilQ.data?.lojaId ?? null;
  const semanasQ = trpc.estoque.semanal.semanas.useQuery({ lojaId }, { enabled: !!perfilQ.data });
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const semanas = semanasQ.data?.semanas || [];
  // Abre a atrasada mais antiga; se não tiver, a semana atual.
  const padrao = [...semanas].reverse().find((s) => s.status === "atrasada")?.semanaInicio || semanas[0]?.semanaInicio || null;
  const semanaInicio = escolhida || padrao;

  if (perfilQ.isLoading) return <p className="p-6 text-sm text-gray-500">Carregando…</p>;
  if (perfilQ.error) return <p className="p-6 text-sm text-rose-300">{perfilQ.error.message}</p>;

  return (
    <main className="mx-auto max-w-3xl p-3 pb-24 sm:p-6">
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/65">Estoque • contagem semanal</p>
        <h1 className="mt-1 text-2xl font-black">{perfilQ.data?.loja || "Contagem semanal"}</h1>
        <p className="mt-1 text-sm text-gray-500">Sem dia certo: conte os grupos da semana e entregue até domingo.</p>
      </div>

      {perfilQ.data?.supervisor && (
        <label className="mb-4 block text-xs font-bold text-gray-400">Loja
          <select value={lojaEscolhida ?? ""} onChange={(e) => { setLojaEscolhida(e.target.value ? Number(e.target.value) : null); setEscolhida(null); }}
            className="mt-1 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-base text-white">
            <option value="">Escolha a loja</option>
            {EMPRESAS.map((e) => <option key={e.lojaId} value={e.lojaId}>{e.loja}</option>)}
          </select>
        </label>
      )}

      {lojaId && semanas.length === 0 && semanasQ.data && (
        <p className="rounded-2xl border border-white/10 p-4 text-sm text-gray-400">A contagem semanal começa na semana de {dataBr(semanasQ.data.inicioCiclo)}.</p>
      )}

      {lojaId && semanas.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {semanas.map((s) => {
            const st = STATUS_SEMANA[s.status];
            const ativa = s.semanaInicio === semanaInicio;
            return (
              <button key={s.semanaInicio} type="button" onClick={() => setEscolhida(s.semanaInicio)}
                className={`shrink-0 rounded-2xl border px-3 py-2 text-left ${st.cor} ${ativa ? "bg-white/[0.06] ring-2 ring-[#D4AF37]/50" : "bg-[#0a0a0a]"}`}>
                <p className="text-xs font-black text-white">Semana {s.numero} • {dataBr(s.semanaInicio).slice(0, 5)} a {dataBr(s.semanaFim).slice(0, 5)}</p>
                <p className="text-[11px] font-bold">{st.texto}</p>
              </button>
            );
          })}
        </div>
      )}

      {lojaId && semanaInicio && <SemanaDetalhe key={`${lojaId}-${semanaInicio}`} lojaId={lojaId} semanaInicio={semanaInicio} />}
    </main>
  );
}

function SemanaDetalhe({ lojaId, semanaInicio }: { lojaId: number; semanaInicio: string }) {
  const utils = trpc.useUtils();
  const semanaQ = trpc.estoque.semanal.semana.useQuery({ lojaId, semanaInicio });
  const [erro, setErro] = useState("");
  const atualizar = async () => { await Promise.all([utils.estoque.semanal.semana.invalidate(), utils.estoque.semanal.semanas.invalidate()]); };
  const entregar = trpc.estoque.semanal.entregar.useMutation({ onSuccess: atualizar, onError: (e) => setErro(e.message) });
  const s = semanaQ.data;
  if (semanaQ.error) return <p className="text-sm text-rose-300">{semanaQ.error.message}</p>;
  if (!s) return <p className="text-sm text-gray-500">Carregando…</p>;
  const entregue = s.status.startsWith("entregue");
  const completos = s.grupos.filter(grupoCompleto).length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] p-3">
        <div className="flex items-center justify-between text-xs font-bold text-gray-400">
          <span>Semana {s.numero} • {dataBr(s.semanaInicio)} a {dataBr(s.semanaFim)}</span>
          <span>{completos} de {s.grupos.length} grupos prontos</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[#D4AF37] transition-all" style={{ width: `${(completos / s.grupos.length) * 100}%` }} /></div>
        {s.status === "atrasada" && <p className="mt-2 text-xs font-bold text-rose-300">Semana atrasada: entregue o quanto antes.</p>}
      </div>

      {erro && <div className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</div>}

      {s.grupos.map((g) => (
        <GrupoCard key={g.grupo} g={g} lojaId={lojaId} semanaInicio={semanaInicio} editavel={!entregue} setErro={setErro} onAtualizar={atualizar} />
      ))}

      {entregue ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 text-emerald-200">
          <CheckCircle2 className="h-8 w-8 shrink-0" />
          <div><p className="text-lg font-black">{STATUS_SEMANA[s.status].texto}</p><p className="text-sm">Por {s.entreguePorNome}. O supervisor de estoque vai analisar as alterações.</p></div>
        </div>
      ) : (
        <button type="button" disabled={entregar.isPending || completos < s.grupos.length}
          onClick={() => { setErro(""); if (window.confirm("Entregar a contagem da semana? Depois não dá para mudar.")) entregar.mutate({ lojaId, semanaInicio }); }}
          className="h-14 w-full rounded-2xl bg-emerald-500 text-base font-black text-black disabled:opacity-40">
          {entregar.isPending ? "Entregando…" : completos < s.grupos.length ? `Faltam ${s.grupos.length - completos} grupo(s) para entregar` : "Entregar contagem da semana"}
        </button>
      )}
    </div>
  );
}

export function grupoCompleto(g: Grupo) {
  return g.totalItens > 0 && g.fotos.length > 0 && (g.ajustes.length > 0 || g.semAlteracao);
}

export function FotoFolha({ fotoId, onFechar }: { fotoId: number; onFechar: () => void }) {
  const fotoQ = trpc.estoque.semanal.foto.useQuery({ fotoId });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3" onClick={onFechar}>
      <button type="button" className="absolute right-3 top-3 rounded-xl border border-white/20 p-2 text-white"><X className="h-5 w-5" /></button>
      {fotoQ.isLoading ? <p className="text-sm text-gray-400">Carregando foto…</p>
        : !fotoQ.data ? <p className="text-sm text-gray-400">Foto não disponível (as fotos ficam guardadas por 90 dias).</p>
        : <img src={`data:${fotoQ.data.mime};base64,${fotoQ.data.base64}`} alt="Folha de contagem" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

function GrupoCard({ g, lojaId, semanaInicio, editavel, setErro, onAtualizar }: {
  g: Grupo; lojaId: number; semanaInicio: string; editavel: boolean; setErro: (s: string) => void; onAtualizar: () => Promise<void>;
}) {
  const [lendo, setLendo] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [verFoto, setVerFoto] = useState<number | null>(null);
  const [novo, setNovo] = useState({ codigo: "", contada: "", obs: "" });
  const onError = (e: { message: string }) => setErro(e.message);
  const anexar = trpc.estoque.semanal.anexarRelatorio.useMutation({ onError });
  const enviarFoto = trpc.estoque.semanal.enviarFoto.useMutation({ onError });
  const apagarFoto = trpc.estoque.semanal.apagarFoto.useMutation({ onSuccess: () => void onAtualizar(), onError });
  const salvarAjuste = trpc.estoque.semanal.salvarAjuste.useMutation({ onError });
  const apagarAjuste = trpc.estoque.semanal.apagarAjuste.useMutation({ onSuccess: () => void onAtualizar(), onError });
  const semAlteracao = trpc.estoque.semanal.semAlteracao.useMutation({ onSuccess: () => void onAtualizar(), onError });
  const completo = grupoCompleto(g);
  const doRelatorio = g.itens.find((i) => i.codigo.toUpperCase() === novo.codigo.trim().toUpperCase());
  const contada = Number(novo.contada.replace(",", "."));
  const novoValido = novo.codigo.trim() !== "" && novo.contada.trim() !== "" && Number.isFinite(contada) && contada >= 0;

  async function escolherPdf(file: File | null) {
    if (!file) return;
    setErro("");
    setLendo(true);
    try {
      const r = await lerPdf(file);
      if (!r.itens.length) throw new Error("Não encontrei itens nesse PDF. Confira se é o \"Estoque de itens\".");
      await anexar.mutateAsync({ lojaId, semanaInicio, grupo: g.grupo, lojaRelatorio: r.loja, arquivoNome: file.name, itens: r.itens });
      await onAtualizar();
    } catch (e: any) {
      setErro(e?.message || "Não foi possível ler o PDF.");
    } finally {
      setLendo(false);
    }
  }

  async function escolherFotos(files: FileList | null) {
    if (!files?.length) return;
    setErro("");
    setEnviandoFoto(true);
    try {
      for (const f of Array.from(files)) {
        const foto = await prepararFoto(f);
        await enviarFoto.mutateAsync({ lojaId, semanaInicio, grupo: g.grupo, ...foto });
      }
      await onAtualizar();
    } catch (e: any) {
      setErro(e?.message || "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function adicionarAjuste() {
    setErro("");
    await salvarAjuste.mutateAsync({
      lojaId, semanaInicio, grupo: g.grupo, codigo: novo.codigo.trim().toUpperCase(), item: doRelatorio?.item || "",
      qtdSistema: doRelatorio ? doRelatorio.qtd : null, qtdContada: contada, obs: novo.obs.trim(),
    });
    setNovo({ codigo: "", contada: "", obs: "" });
    await onAtualizar();
  }

  return (
    <section className={`rounded-3xl border bg-[#0a0a0a] p-4 ${completo ? "border-emerald-400/25" : "border-[#D4AF37]/20"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-black">{g.nome}</p>
        {completo ? <span className="flex items-center gap-1 text-xs font-black text-emerald-300"><CheckCircle2 className="h-4 w-4" />Pronto</span> : <span className="flex items-center gap-1 text-xs font-bold text-gray-500"><Clock className="h-4 w-4" />Falta</span>}
      </div>

      {/* 1. Relatório */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {g.totalItens > 0 && <p className="flex-1 text-sm text-gray-300"><FileText className="mr-1 inline h-4 w-4 text-[#F2D675]" />{g.totalItens} itens • {qtd(g.totalQtd)} peças no sistema <span className="text-xs text-gray-600">({g.arquivoNome})</span></p>}
        {editavel && (
          <label className={`flex h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-black ${g.totalItens ? "border border-white/10 text-gray-400" : "bg-[#D4AF37] text-black"}`}>
            <FileText className="h-4 w-4" />{lendo ? "Lendo…" : g.totalItens ? "Trocar relatório" : "Anexar relatório (PDF)"}
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void escolherPdf(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
          </label>
        )}
      </div>

      {/* 2. Fotos das folhas */}
      <p className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-gray-500">Fotos das folhas contadas</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {g.fotos.map((f, k) => (
          <div key={f.id} className="flex items-center overflow-hidden rounded-xl border border-white/10">
            <button type="button" onClick={() => setVerFoto(f.id)} className="flex h-10 items-center gap-1.5 px-3 text-xs font-bold text-gray-300"><ImageIcon className="h-4 w-4" />Folha {k + 1}</button>
            {editavel && <button type="button" onClick={() => { if (window.confirm("Apagar essa foto?")) apagarFoto.mutate({ fotoId: f.id }); }} className="flex h-10 items-center border-l border-white/10 px-2 text-gray-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
        {editavel && (
          <label className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-black ${g.fotos.length ? "border border-white/10 text-gray-300" : "bg-sky-500 text-black"}`}>
            <Camera className="h-4 w-4" />{enviandoFoto ? "Enviando…" : "Foto da folha"}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { void escolherFotos(e.target.files); e.currentTarget.value = ""; }} />
          </label>
        )}
        {!g.fotos.length && !editavel && <p className="text-xs text-gray-600">Sem fotos.</p>}
      </div>

      {/* 3. Alterações */}
      <p className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-gray-500">Alterações e ajustes</p>
      {g.ajustes.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {g.ajustes.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-xl border border-white/[0.06] p-2.5">
              <div className="min-w-0 flex-1 text-sm">
                <p><b className="text-[#F2D675]">{a.codigo}</b> <span className="text-gray-400">{a.item}</span></p>
                <p className="text-xs text-gray-400">Sistema <b className="text-white">{qtd(a.qtdSistema)}</b> • Contado <b className="text-white">{qtd(a.qtdContada)}</b>{a.qtdSistema != null && <b className={a.qtdContada - a.qtdSistema > 0 ? " text-sky-300" : " text-rose-300"}> ({a.qtdContada - a.qtdSistema > 0 ? "+" : ""}{qtd(a.qtdContada - a.qtdSistema)})</b>}</p>
                {a.obs && <p className="text-xs text-gray-300">{a.obs}</p>}
              </div>
              {editavel && <button type="button" onClick={() => apagarAjuste.mutate({ ajusteId: a.id })} className="p-1 text-gray-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
      {editavel && (
        <div className="mt-2 rounded-2xl border border-white/[0.06] p-2.5">
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} list={`itens-${g.grupo}`} placeholder="Código"
              className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-base uppercase text-white outline-none" />
            <input value={novo.contada} onChange={(e) => setNovo({ ...novo, contada: e.target.value.replace(/[^0-9,]/g, "") })} inputMode="decimal" placeholder="Contado"
              className="h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-center text-base text-white outline-none" />
          </div>
          <datalist id={`itens-${g.grupo}`}>{g.itens.map((i) => <option key={i.codigo} value={i.codigo}>{i.item}</option>)}</datalist>
          {novo.codigo.trim() && (
            <p className="mt-1 text-xs text-gray-500">{doRelatorio ? <>{doRelatorio.item} • sistema <b className="text-gray-300">{qtd(doRelatorio.qtd)}</b></> : "Código fora do relatório (vai sem a quantidade do sistema)."}</p>
          )}
          <input value={novo.obs} onChange={(e) => setNovo({ ...novo, obs: e.target.value })} placeholder="O que precisa ser feito (ex.: ajustar para 3, peça trocada de código)"
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none" />
          <button type="button" disabled={!novoValido || salvarAjuste.isPending} onClick={() => void adicionarAjuste()}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/40 text-sm font-black text-[#F2D675] disabled:opacity-40">
            <Plus className="h-4 w-4" />Adicionar alteração
          </button>
        </div>
      )}
      {(editavel || g.semAlteracao) && g.ajustes.length === 0 && (
        <label className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-300">
          <input type="checkbox" disabled={!editavel || semAlteracao.isPending} checked={g.semAlteracao}
            onChange={(e) => semAlteracao.mutate({ lojaId, semanaInicio, grupo: g.grupo, valor: e.target.checked })} className="h-5 w-5 accent-emerald-500" />
          Contei tudo e não teve alteração nesse grupo
        </label>
      )}

      {verFoto && <FotoFolha fotoId={verFoto} onFechar={() => setVerFoto(null)} />}
    </section>
  );
}
