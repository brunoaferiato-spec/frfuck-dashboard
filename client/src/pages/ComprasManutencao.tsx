import { useEffect, useMemo, useState } from "react";
import { Download, FileText, MapPin, Paperclip, Plus, Save, ShieldCheck, ShieldOff, Trash2, Wrench, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

// Manutenção dos equipamentos por loja: cada equipamento vira um cartão numerado
// (Elevador nº1, nº2...) com histórico de serviços, garantia e nota fiscal anexada.

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

type TipoEquipamento = "elevador" | "desmontadora" | "balanceadora" | "rampa" | "compressor";

const TIPOS: Array<{ tipo: TipoEquipamento; nome: string; plural: string }> = [
  { tipo: "elevador", nome: "Elevador", plural: "Elevadores" },
  { tipo: "desmontadora", nome: "Máquina de desmontar pneu", plural: "Máquinas de desmontar pneu" },
  { tipo: "balanceadora", nome: "Balanceadora", plural: "Balanceadoras" },
  { tipo: "rampa", nome: "Rampa de alinhamento", plural: "Rampas de alinhamento" },
  { tipo: "compressor", nome: "Compressor", plural: "Compressores" },
];

const TIPOS_SERVICO: Record<string, string> = { preventiva: "Preventiva", corretiva: "Corretiva", instalacao: "Instalação / compra" };

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataBr(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function moeda(v: number | null) {
  return v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()); let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function abrirArquivo(nome: string, mime: string, base64: string) {
  const s = atob(base64); const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Desenhos simples de cada equipamento (traço dourado).
function Desenho({ tipo, className = "" }: { tipo: TipoEquipamento; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden="true">
      {tipo === "elevador" && (
        <g {...p}>
          <path d="M14 76V10M106 76V10M10 76h20M90 76h20" />
          <path d="M14 40h30M106 40H76" />
          <path d="M28 40c2-10 10-14 18-15l10-7h16l12 9c6 1 10 5 10 13" />
          <circle cx="40" cy="42" r="6" /><circle cx="82" cy="42" r="6" />
        </g>
      )}
      {tipo === "desmontadora" && (
        <g {...p}>
          <rect x="22" y="50" width="70" height="26" rx="4" />
          <ellipse cx="57" cy="44" rx="30" ry="7" />
          <ellipse cx="57" cy="44" rx="12" ry="3" />
          <path d="M92 50V12h-24v10" /><path d="M68 22v14" />
          <path d="M36 76v-6M78 76v-6" />
        </g>
      )}
      {tipo === "balanceadora" && (
        <g {...p}>
          <rect x="44" y="34" width="54" height="42" rx="4" />
          <rect x="58" y="12" width="28" height="16" rx="3" /><path d="M72 28v6" />
          <path d="M44 52H34" />
          <circle cx="22" cy="52" r="16" /><circle cx="22" cy="52" r="6" />
          <path d="M62 64h20" />
        </g>
      )}
      {tipo === "rampa" && (
        <g {...p}>
          <path d="M6 70l20-14h68l20 14" />
          <path d="M26 56V70M94 56V70" />
          <path d="M34 52h52" />
          <rect x="34" y="44" width="14" height="8" rx="2" /><rect x="72" y="44" width="14" height="8" rx="2" />
          <path d="M60 52V20M52 20h16" />
        </g>
      )}
      {tipo === "compressor" && (
        <g {...p}>
          <rect x="14" y="40" width="92" height="26" rx="13" />
          <rect x="38" y="18" width="34" height="18" rx="3" /><path d="M55 36v4" />
          <circle cx="86" cy="26" r="7" /><path d="M86 33v7" />
          <circle cx="30" cy="72" r="5" /><circle cx="90" cy="72" r="5" />
        </g>
      )}
    </svg>
  );
}

type FormServico = { id?: number; data: string; tipo: "preventiva" | "corretiva" | "instalacao"; descricao: string; fornecedor: string; valor: string; garantiaAte: string; arquivo: File | null };
const formVazio = (): FormServico => ({ data: hojeIso(), tipo: "preventiva", descricao: "", fornecedor: "", valor: "", garantiaAte: "", arquivo: null });

export default function ComprasManutencao() {
  const [lojaId, setLojaId] = useState("1");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [editarQuantidades, setEditarQuantidades] = useState(false);
  const [equipamentoId, setEquipamentoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormServico | null>(null);
  const [descricaoEq, setDescricaoEq] = useState<string | null>(null);
  const [exclusao, setExclusao] = useState<{ tipo: "servico" | "anexo"; id: number; texto: string } | null>(null);
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const loja = LOJAS.find((x) => String(x.id) === lojaId) || LOJAS[0];
  const api = trpc.compras.manutencao;
  const equipamentosQ = api.equipamentos.useQuery({ lojaId: loja.id });
  const servicosQ = api.servicos.useQuery({ equipamentoId: equipamentoId || 0 }, { enabled: !!equipamentoId });

  const ok = (t: string) => { setMensagem(t); setErro(""); };
  const falha = (e: { message: string }) => setErro(e.message);

  const porTipo = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const e of equipamentosQ.data || []) (m[e.tipo] ||= []).push(e);
    return m;
  }, [equipamentosQ.data]);

  useEffect(() => {
    const q: Record<string, string> = {};
    for (const t of TIPOS) q[t.tipo] = String((porTipo[t.tipo] || []).length);
    setQuantidades(q);
  }, [porTipo]);

  const semEquipamentos = (equipamentosQ.data || []).length === 0;

  const definirQuantidade = api.definirQuantidade.useMutation({ onError: falha });
  async function salvarQuantidades() {
    try {
      for (const t of TIPOS) {
        const q = Math.max(0, Math.min(50, Math.floor(Number(quantidades[t.tipo] || 0))));
        if (q !== (porTipo[t.tipo] || []).length) await definirQuantidade.mutateAsync({ lojaId: loja.id, tipo: t.tipo, quantidade: q });
      }
      await equipamentosQ.refetch();
      setEditarQuantidades(false);
      ok(`Equipamentos de ${loja.nome} atualizados.`);
    } catch { /* erro exibido */ }
  }

  const salvarEquipamento = api.salvarEquipamento.useMutation({ onSuccess: async () => { setDescricaoEq(null); await servicosQ.refetch(); await equipamentosQ.refetch(); }, onError: falha });
  const salvarServico = api.salvarServico.useMutation({ onError: falha });
  const adicionarAnexo = api.adicionarAnexo.useMutation({ onSuccess: async () => { ok("Anexo incluído."); await servicosQ.refetch(); }, onError: falha });
  const baixarAnexo = api.baixarAnexo.useMutation({ onSuccess: (d) => abrirArquivo(d.nome, d.mime, d.base64), onError: falha });
  const excluirServico = api.excluirServico.useMutation({ onSuccess: async () => { ok("Manutenção excluída."); setExclusao(null); setSenha(""); await servicosQ.refetch(); await equipamentosQ.refetch(); }, onError: falha });
  const excluirAnexo = api.excluirAnexo.useMutation({ onSuccess: async () => { ok("Anexo excluído."); setExclusao(null); setSenha(""); await servicosQ.refetch(); }, onError: falha });

  async function anexoDe(file: File | null) {
    if (!file) return null;
    return { nome: file.name, mime: file.type || "application/pdf", base64: await toBase64(file) };
  }

  async function gravarServico() {
    if (!form || !equipamentoId) return;
    if (!form.data) { setErro("Informe a data da manutenção."); return; }
    try {
      const valor = form.valor.trim() ? Number(form.valor.replace(/\./g, "").replace(",", ".")) : null;
      await salvarServico.mutateAsync({
        id: form.id, equipamentoId, data: form.data, tipo: form.tipo, descricao: form.descricao, fornecedor: form.fornecedor,
        valor: valor != null && Number.isFinite(valor) ? valor : null, garantiaAte: form.garantiaAte || null, anexo: await anexoDe(form.arquivo),
      });
      setForm(null);
      ok("Manutenção salva.");
      await servicosQ.refetch();
      await equipamentosQ.refetch();
    } catch { /* erro exibido */ }
  }

  const eq = servicosQ.data?.equipamento;
  const nomeTipo = (t: string) => TIPOS.find((x) => x.tipo === t)?.nome || t;
  const hoje = hojeIso();

  return (
    <main className="min-h-full bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">COMPRAS</p>
            <h1 className="mt-1 flex items-center gap-3 text-3xl font-black"><Wrench className="h-7 w-7 text-[#F2D675]" />Manutenção de equipamentos</h1>
            <p className="mt-2 text-sm text-gray-500">Clique em um equipamento para ver as manutenções, a garantia e as notas fiscais.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.08em] text-gray-600">Loja</label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#D4AF37]" />
                <select value={lojaId} onChange={(e) => { setLojaId(e.target.value); setEquipamentoId(null); setEditarQuantidades(false); }} className="h-11 min-w-[200px] rounded-xl border border-white/10 bg-black/40 pl-9 pr-3 text-sm font-bold text-white">
                  {LOJAS.map((l) => <option key={l.id} value={String(l.id)}>{l.nome}</option>)}
                </select>
              </div>
            </div>
            <button type="button" onClick={() => setEditarQuantidades((v) => !v)} className="h-11 rounded-xl border border-[#D4AF37]/30 px-4 text-xs font-black text-[#F2D675]">Quantidade de equipamentos</button>
          </div>
        </div>

        {(mensagem || erro) && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${erro ? "border-rose-400/20 text-rose-200" : "border-emerald-400/20 text-emerald-200"}`}>{erro || mensagem}</div>}

        {(editarQuantidades || (semEquipamentos && !equipamentosQ.isLoading)) && (
          <section className="mt-5 rounded-3xl border border-[#D4AF37]/20 bg-[#090909] p-5">
            <p className="text-sm font-black text-white">Quantos equipamentos {loja.nome} tem?</p>
            <p className="mt-1 text-xs text-gray-600">Diminuir a quantidade só esconde os de número maior; o histórico deles fica guardado e volta se aumentar de novo.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {TIPOS.map((t) => (
                <label key={t.tipo} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] p-3">
                  <Desenho tipo={t.tipo} className="h-10 w-14 shrink-0 text-[#D4AF37]" />
                  <span className="min-w-0 flex-1 text-xs font-bold text-gray-300">{t.plural}</span>
                  <input value={quantidades[t.tipo] ?? "0"} inputMode="numeric" onChange={(e) => setQuantidades((a) => ({ ...a, [t.tipo]: e.target.value.replace(/[^0-9]/g, "") }))} className="h-10 w-14 rounded-lg border border-[#D4AF37]/25 bg-black/30 text-center font-black text-[#F2D675] outline-none" />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {!semEquipamentos && <button type="button" onClick={() => setEditarQuantidades(false)} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400">Cancelar</button>}
              <button type="button" disabled={definirQuantidade.isPending} onClick={() => void salvarQuantidades()} className="h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black disabled:opacity-50"><Save className="mr-2 inline h-4 w-4" />Salvar quantidades</button>
            </div>
          </section>
        )}

        {TIPOS.filter((t) => (porTipo[t.tipo] || []).length > 0).map((t) => (
          <section key={t.tipo} className="mt-6">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-[#D4AF37]/70">{t.plural} ({porTipo[t.tipo].length})</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {porTipo[t.tipo].map((e: any) => {
                const emGarantia = e.garantiaAte && e.garantiaAte >= hoje;
                return (
                  <button key={e.id} type="button" onClick={() => { setEquipamentoId(e.id); setForm(null); setDescricaoEq(null); setMensagem(""); setErro(""); }} className="group rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-4 text-left transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/[0.04]">
                    <Desenho tipo={t.tipo} className="mx-auto h-16 w-24 text-[#D4AF37] transition group-hover:text-[#F2D675]" />
                    <p className="mt-3 font-black text-white">{t.nome} nº{e.numero}</p>
                    {e.descricao && <p className="mt-0.5 truncate text-[11px] text-gray-500">{e.descricao}</p>}
                    <p className="mt-2 text-[11px] text-gray-500">{e.servicos ? `Última: ${dataBr(e.ultimaData)} • ${e.servicos} serviço(s)` : "Sem manutenção registrada"}</p>
                    {e.garantiaAte && (
                      <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${emGarantia ? "bg-emerald-400/[0.10] text-emerald-300" : "bg-white/[0.05] text-gray-500"}`}>
                        {emGarantia ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                        {emGarantia ? `Garantia até ${dataBr(e.garantiaAte)}` : "Fora da garantia"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ---------- Equipamento: histórico de manutenções ---------- */}
      {equipamentoId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={() => setEquipamentoId(null)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-[#D4AF37]/20 bg-[#0a0a0a] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                {eq && <Desenho tipo={eq.tipo as TipoEquipamento} className="h-14 w-20 text-[#D4AF37]" />}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D4AF37]/60">{loja.nome}</p>
                  <h2 className="text-2xl font-black">{eq ? `${nomeTipo(eq.tipo)} nº${eq.numero}` : "Carregando..."}</h2>
                </div>
              </div>
              <button type="button" onClick={() => setEquipamentoId(null)} className="rounded-xl border border-white/10 p-2 text-gray-500"><X className="h-4 w-4" /></button>
            </div>

            {eq && (
              <div className="mt-4 flex gap-2">
                <input value={descricaoEq ?? eq.descricao} onChange={(e) => setDescricaoEq(e.target.value)} placeholder="Marca / modelo / observação (opcional)" className="h-10 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm" />
                {descricaoEq !== null && descricaoEq !== eq.descricao && <button type="button" onClick={() => salvarEquipamento.mutate({ id: eq.id, descricao: descricaoEq })} className="h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black">Salvar</button>}
              </div>
            )}

            {(mensagem || erro) && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${erro ? "border-rose-400/20 text-rose-200" : "border-emerald-400/20 text-emerald-200"}`}>{erro || mensagem}</div>}

            {!form && <button type="button" onClick={() => setForm(formVazio())} className="mt-5 h-11 w-full rounded-xl bg-[#D4AF37] text-sm font-black text-black"><Plus className="mr-2 inline h-4 w-4" />Registrar manutenção</button>}

            {form && (
              <div className="mt-5 rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.03] p-4">
                <p className="text-sm font-black text-[#F2D675]">{form.id ? "Editar manutenção" : "Nova manutenção"}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-[10px] font-black uppercase text-gray-500">Data<input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white [color-scheme:dark]" /></label>
                  <label className="text-[10px] font-black uppercase text-gray-500">Tipo
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as FormServico["tipo"] })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white">
                      {Object.entries(TIPOS_SERVICO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-black uppercase text-gray-500">Fornecedor / técnico<input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white" /></label>
                  <label className="text-[10px] font-black uppercase text-gray-500">Valor (R$)<input value={form.valor} inputMode="decimal" placeholder="0,00" onChange={(e) => setForm({ ...form, valor: e.target.value.replace(/[^0-9.,]/g, "") })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white" /></label>
                  <label className="text-[10px] font-black uppercase text-gray-500">Garantia até (deixe vazio se não tiver)<input type="date" value={form.garantiaAte} onChange={(e) => setForm({ ...form, garantiaAte: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white [color-scheme:dark]" /></label>
                  <label className="text-[10px] font-black uppercase text-gray-500">Nota fiscal (PDF ou foto)
                    <input type="file" accept=".pdf,image/*" onChange={(e) => setForm({ ...form, arquivo: e.target.files?.[0] || null })} className="mt-1 block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-black file:text-white" />
                  </label>
                </div>
                <label className="mt-3 block text-[10px] font-black uppercase text-gray-500">O que foi feito<textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" /></label>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setForm(null)} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400">Cancelar</button>
                  <button type="button" disabled={salvarServico.isPending} onClick={() => void gravarServico()} className="h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black disabled:opacity-50"><Save className="mr-2 inline h-4 w-4" />{salvarServico.isPending ? "Salvando..." : "Salvar"}</button>
                </div>
              </div>
            )}

            <p className="mt-6 text-xs font-black uppercase tracking-[0.12em] text-gray-500">Histórico de manutenções</p>
            {(servicosQ.data?.servicos || []).length === 0 && <div className="mt-3 rounded-2xl border border-white/[0.06] p-6 text-center text-sm text-gray-500">Nenhuma manutenção registrada.</div>}
            <div className="mt-3 space-y-3">
              {(servicosQ.data?.servicos || []).map((s) => {
                const emGarantia = s.garantiaAte && s.garantiaAte >= hoje;
                return (
                  <div key={s.id} className="rounded-2xl border border-white/[0.07] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-white">{dataBr(s.data)} • {TIPOS_SERVICO[s.tipo] || s.tipo}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{s.fornecedor || "Fornecedor não informado"} • {moeda(s.valor)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${!s.garantiaAte ? "bg-white/[0.04] text-gray-500" : emGarantia ? "bg-emerald-400/[0.10] text-emerald-300" : "bg-rose-400/[0.08] text-rose-300"}`}>
                        {s.garantiaAte && emGarantia ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                        {!s.garantiaAte ? "Sem garantia" : emGarantia ? `Em garantia até ${dataBr(s.garantiaAte)}` : `Garantia vencida em ${dataBr(s.garantiaAte)}`}
                      </span>
                    </div>
                    {s.descricao && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{s.descricao}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {s.anexos.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-lg border border-white/10 pl-2 text-xs text-gray-300">
                          <FileText className="h-3.5 w-3.5 text-[#D4AF37]" />
                          <button type="button" onClick={() => baixarAnexo.mutate({ anexoId: a.id })} className="max-w-[180px] truncate py-1 hover:text-[#F2D675]" title="Baixar">{a.nome}</button>
                          <Download className="h-3.5 w-3.5 text-gray-500" />
                          <button type="button" onClick={() => { setSenha(""); excluirServico.reset(); excluirAnexo.reset(); setExclusao({ tipo: "anexo", id: a.id, texto: `Excluir o anexo "${a.nome}"?` }); }} className="px-1.5 py-1 text-gray-600 hover:text-rose-300" title="Excluir anexo"><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ))}
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-white/15 px-2 py-1 text-xs text-gray-400 hover:text-[#F2D675]">
                        <Paperclip className="h-3.5 w-3.5" />{adicionarAnexo.isPending ? "Enviando..." : "Anexar nota"}
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0] || null; e.currentTarget.value = ""; const an = await anexoDe(f); if (an) adicionarAnexo.mutate({ servicoId: s.id, anexo: an }); }} />
                      </label>
                      <span className="flex-1" />
                      <button type="button" onClick={() => setForm({ id: s.id, data: s.data || hojeIso(), tipo: s.tipo as FormServico["tipo"], descricao: s.descricao, fornecedor: s.fornecedor, valor: s.valor == null ? "" : String(s.valor).replace(".", ","), garantiaAte: s.garantiaAte || "", arquivo: null })} className="text-xs font-black text-gray-400 hover:text-[#F2D675]">Editar</button>
                      <button type="button" onClick={() => { setSenha(""); excluirServico.reset(); excluirAnexo.reset(); setExclusao({ tipo: "servico", id: s.id, texto: `Excluir a manutenção de ${dataBr(s.data)} e os anexos dela?` }); }} className="text-xs font-black text-rose-300/70 hover:text-rose-300"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Excluir</button>
                    </div>
                    {s.criadoPorNome && <p className="mt-2 text-[10px] text-gray-600">Registrado por {s.criadoPorNome}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {exclusao && (() => {
        const enviando = excluirServico.isPending || excluirAnexo.isPending;
        const confirmar = () => {
          if (!senha.trim() || enviando) return;
          excluirServico.reset();
          excluirAnexo.reset();
          if (exclusao.tipo === "servico") excluirServico.mutate({ servicoId: exclusao.id, senha });
          else excluirAnexo.mutate({ anexoId: exclusao.id, senha });
        };
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-[#0a0a0a] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-300/70">EXCLUSÃO PROTEGIDA</p>
                  <p className="mt-2 text-sm font-bold text-white">{exclusao.texto}</p>
                </div>
                <button type="button" onClick={() => { setExclusao(null); setSenha(""); }} className="rounded-xl border border-white/10 p-2 text-gray-500"><X className="h-4 w-4" /></button>
              </div>
              <input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }} placeholder="Senha de exclusão" className="mt-4 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white" />
              {(excluirServico.error || excluirAnexo.error) && !enviando && (
                <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-xs font-bold text-rose-200">
                  {(excluirServico.error || excluirAnexo.error)?.message}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setExclusao(null); setSenha(""); }} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400">Cancelar</button>
                <button type="button" disabled={!senha.trim() || enviando} onClick={confirmar} className="h-10 rounded-xl border border-rose-500/30 bg-rose-500/[0.12] px-4 text-xs font-black text-rose-200 disabled:opacity-50"><Trash2 className="mr-2 inline h-4 w-4" />{enviando ? "Excluindo..." : "Excluir"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
