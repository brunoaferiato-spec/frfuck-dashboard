import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, Camera, CheckCircle2, Clock, Download, FileText, Paperclip, Plus, RotateCcw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EMPRESAS, empresaDaLoja } from "@shared/empresas";
import { extrairVenda, linhasDoPdf, type PneuVendido } from "@shared/vendaImpacto";
import { MODELOS_FORNECEDOR, modeloDoFornecedor, separarPneu, type ModeloFornecedor, type FotosFormulario, FORNECEDORES_WHATSAPP, fornecedorWhatsapp, mensagemWhatsapp, type FornecedorWhatsapp } from "@shared/garantiaFornecedores";

// Garantia de pneus: termo de envio para análise, anexos, prazo de 30 dias para resolver com o
// cliente e cobrança semanal do fornecedor. Os avisos aparecem em todas as telas de Compras.

type Status = "aberta" | "enviada" | "aprovada" | "negada" | "finalizada";
type Resultado = "pneu_novo" | "reembolso" | "devolvido" | "descartado";
type Categoria = "foto" | "foto_dot" | "foto_marca" | "foto_completa" | "foto_interna" | "foto_banda" | "video" | "venda" | "nota" | "termo" | "fornecedor" | "laudo" | "cliente" | "outro";

const STATUS_NOME: Record<Status, string> = {
  aberta: "Aberta • não enviada",
  enviada: "Enviada ao fornecedor",
  aprovada: "Aprovada • avisar o cliente",
  negada: "Negada • avisar o cliente",
  finalizada: "Finalizada",
};
const STATUS_COR: Record<Status, string> = {
  aberta: "bg-amber-400/[0.12] text-amber-200",
  enviada: "bg-sky-400/[0.12] text-sky-200",
  aprovada: "bg-emerald-400/[0.12] text-emerald-300",
  negada: "bg-rose-400/[0.12] text-rose-300",
  finalizada: "bg-white/[0.06] text-gray-400",
};
const RESULTADO_NOME: Record<Resultado, string> = {
  pneu_novo: "Pneu novo para o cliente",
  reembolso: "Reembolso ao cliente",
  devolvido: "Pneu devolvido ao cliente",
  descartado: "Pneu descartado (60 dias sem retirar)",
};
const CATEGORIAS: Array<{ categoria: Categoria; nome: string; dica: string; grupo?: string }> = [
  { categoria: "foto_dot", nome: "Fotos do DOT", dica: "2 fotos do DOT completo", grupo: "Fotos e vídeo do pneu" },
  { categoria: "foto_marca", nome: "Fotos da marca", dica: "2 fotos da marca do pneu" },
  { categoria: "foto_completa", nome: "Fotos do pneu completo", dica: "2 fotos do pneu inteiro" },
  { categoria: "foto_interna", nome: "Fotos internas", dica: "2 fotos da parte de dentro" },
  { categoria: "foto_banda", nome: "Fotos da banda de rodagem", dica: "2 fotos da banda" },
  { categoria: "foto", nome: "Outras fotos", dica: "Defeito e demais fotos (reduzidas automaticamente)" },
  { categoria: "video", nome: "Vídeo do pneu", dica: "Mostrando o pneu todo e o defeito • até 25 MB • vai separado no e-mail" },
  { categoria: "termo", nome: "Termo assinado", dica: "Foto ou PDF do termo com a assinatura do cliente", grupo: "Documentos" },
  { categoria: "termo", nome: "Termo assinado", dica: "Foto ou PDF do termo com a assinatura do cliente" },
  { categoria: "venda", nome: "Venda", dica: "Comprovante da venda do pneu" },
  { categoria: "nota", nome: "Nota fiscal", dica: "Nota fiscal do pneu" },
  { categoria: "fornecedor", nome: "Documento do fornecedor", dica: "Formulário de garantia preenchido e mensagens enviadas" },
  { categoria: "laudo", nome: "Laudo do fornecedor", dica: "Laudo que o fornecedor mandou" },
  { categoria: "cliente", nome: "Conversa com o cliente", dica: "Print ou conversa do aviso do laudo e do atendimento" },
  { categoria: "outro", nome: "Outros", dica: "E-mails, respostas, laudos" },
];

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dataBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function abrirArquivo(nome: string, mime: string, base64: string) {
  const s = atob(base64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Foto do celular tem vários MB: reduz para no máximo 1600 px em JPEG antes de enviar.
async function prepararArquivo(file: File) {
  if (!file.type.startsWith("image/")) return { nome: file.name, mime: file.type || "application/octet-stream", base64: await toBase64(file) };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não foi possível ler a imagem."));
      i.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), "image/jpeg", 0.8));
    return { nome: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", base64: await toBase64(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Termo de envio de pneu para análise em PDF, no mesmo texto do modelo da loja: baixa o arquivo
// para mandar ao caixa imprimir e colher a assinatura do cliente.
async function carregarLogo() {
  const resp = await fetch("/garantia/logo-impacto-prime.png");
  const blob = await resp.blob();
  return new Promise<string>((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(new Error("Não foi possível carregar o logo."));
    r.readAsDataURL(blob);
  });
}

async function baixarTermo(g: any) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const razao = empresaDaLoja(g.lojaId)?.razaoSocial || g.loja;
  const M = 20;
  const L = 210 - 2 * M;

  // Topo: faixas preta e amarela à esquerda, logo à direita.
  pdf.setFillColor(17, 17, 17);
  pdf.rect(M, 20, 98, 2.2, "F");
  pdf.setFillColor(242, 194, 0);
  pdf.rect(M, 25, 70, 2.2, "F");
  try {
    pdf.addImage(await carregarLogo(), "PNG", 132, 13, 58, 13.9, undefined, "FAST");
  } catch {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("IMPACTO PRIME", 190, 24, { align: "right" });
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("TERMO DE ENVIO DE PNEU PARA ANÁLISE", 105, 58, { align: "center" });

  pdf.setFontSize(11);
  const rodado = kmRodado(g.kmAtual, g.kmVenda);
  const dados: Array<[string, string]> = [
    ["Nome", g.clienteNome],
    ["Telefone", g.clienteTelefone],
    ["CPF", g.clienteCpf],
    ["Pneu", g.pneu],
    ["Quantidade", [g.quantidade, g.posicao].filter(Boolean).join(" ")],
    ["KM Rodado", kmTexto(rodado)],
    ["Defeito Alegado", g.defeito],
  ];
  let y = 80;
  for (const [rotuloCampo, valor] of dados) {
    pdf.text(`${rotuloCampo}: ${valor || ""}`, M, y, { maxWidth: L });
    y += 6;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const paragrafos = [
    `Estou ciente de que o pneu será encaminhado pela ${razao} para análise referente a garantia, tendo 30 dias corridos para conclusão, contados a partir de hoje, dia ${dataBr(g.dataEntrada)}, ou seja, até o dia ${dataBr(g.prazo)}, quando deverei retornar com este documento em mãos para retirar o laudo e o pneu, sem prévia notificação.`,
    "Estou ciente que, em caso da análise for negativa para a troca em garantia pelo fabricante, a empresa manterá o pneu por 60 (sessenta) dias guardado, que se caso não retirar, será descartado.",
  ];
  y = 138;
  for (const p of paragrafos) {
    const linhas = pdf.splitTextToSize(p, L);
    pdf.text(linhas, M, y, { maxWidth: L, align: "justify", lineHeightFactor: 1.45 });
    y += linhas.length * 5.9 + 6;
  }

  // Assinaturas
  pdf.setDrawColor(17, 17, 17);
  pdf.setLineWidth(0.3);
  pdf.line(M, 222, M + 95, 222);
  pdf.setFont("helvetica", "bold");
  pdf.text(g.clienteNome || "", M, 227);
  pdf.line(M, 247, M + 95, 247);
  pdf.setFont("helvetica", "normal");
  pdf.text(razao, M, 252, { maxWidth: L });

  // Rodapé
  pdf.setFillColor(17, 17, 17);
  pdf.rect(78, 276, 112, 2.2, "F");
  pdf.setFillColor(242, 194, 0);
  pdf.rect(105, 280.5, 85, 2.2, "F");
  pdf.setFontSize(10);
  pdf.text("www.impactoprime.com.br", 134, 289, { align: "center" });

  const nome = String(g.clienteNome || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  pdf.save(`termo-garantia-${g.id}-${nome}.pdf`);
}

// KM rodado desde a troca do pneu: KM atual − KM da venda. Null se faltar algum dos dois ou der negativo.
function kmRodado(kmAtual: unknown, kmVenda: unknown) {
  if (kmAtual === "" || kmAtual == null || kmVenda === "" || kmVenda == null) return null;
  const r = Number(kmAtual) - Number(kmVenda);
  return Number.isFinite(r) && r >= 0 ? r : null;
}
const kmTexto = (v: number | null) => (v == null ? "" : `${v.toLocaleString("pt-BR")} km`);

function PrazoChip({ g }: { g: any }) {
  if (g.status === "finalizada") return <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-black text-gray-500">Finalizada {dataBr(g.dataFinalizacao)}</span>;
  if (g.vencida) return <span className="rounded-full bg-rose-500/[0.18] px-2 py-1 text-[10px] font-black text-rose-200">Venceu há {Math.abs(g.diasRestantes)} dia(s) • pneu novo ou reembolso</span>;
  if (g.venceLogo) return <span className="rounded-full bg-amber-400/[0.16] px-2 py-1 text-[10px] font-black text-amber-200">{g.diasRestantes === 0 ? "Vence hoje" : `Faltam ${g.diasRestantes} dia(s)`} • {dataBr(g.prazo)}</span>;
  return <span className="rounded-full bg-emerald-400/[0.10] px-2 py-1 text-[10px] font-black text-emerald-300">Faltam {g.diasRestantes} dias • {dataBr(g.prazo)}</span>;
}

// Lê o PDF da venda (relatório "VENDA Nº" do sistema) e devolve cliente, veículo e pneus.
async function lerVendaPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const documento = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pagina = await documento.getPage(1);
  const conteudo = await pagina.getTextContent();
  return extrairVenda(linhasDoPdf(conteudo.items as any[]));
}

const POSICOES = ["Dianteiro Direito", "Dianteiro Esquerdo", "Traseiro Direito", "Traseiro Esquerdo", "Estepe"];

type Form = {
  id?: number; lojaId: string; clienteNome: string; clienteTelefone: string; clienteCpf: string; pneu: string; quantidade: string;
  posicao: string; kmAtual: string; defeito: string; dataEntrada: string;
  vendaNumero: string; vendaData: string | null; veiculo: string; veiculoAno: string; placa: string; kmVenda: number | null;
  pneuCodigo: string; clienteEndereco: string; clienteBairro: string; clienteCep: string; clienteCidade: string; clienteUf: string;
  pneus: PneuVendido[]; arquivoVenda: File | null;
};
const formVazio = (lojaId = ""): Form => ({
  lojaId, clienteNome: "", clienteTelefone: "", clienteCpf: "", pneu: "", quantidade: "1", posicao: "", kmAtual: "", defeito: "", dataEntrada: hojeIso(),
  vendaNumero: "", vendaData: null, veiculo: "", veiculoAno: "", placa: "", kmVenda: null, pneus: [], arquivoVenda: null,
  pneuCodigo: "", clienteEndereco: "", clienteBairro: "", clienteCep: "", clienteCidade: "", clienteUf: "",
});
function formDe(g: any): Form {
  return {
    id: g.id, lojaId: String(g.lojaId), clienteNome: g.clienteNome, clienteTelefone: g.clienteTelefone, clienteCpf: g.clienteCpf, pneu: g.pneu,
    quantidade: String(g.quantidade), posicao: g.posicao, kmAtual: g.kmAtual == null ? "" : String(g.kmAtual), defeito: g.defeito, dataEntrada: g.dataEntrada,
    vendaNumero: g.vendaNumero, vendaData: g.vendaData, veiculo: g.veiculo, veiculoAno: g.veiculoAno, placa: g.placa, kmVenda: g.kmVenda, pneus: [], arquivoVenda: null,
    pneuCodigo: g.pneuCodigo, clienteEndereco: g.clienteEndereco, clienteBairro: g.clienteBairro, clienteCep: g.clienteCep, clienteCidade: g.clienteCidade, clienteUf: g.clienteUf,
  };
}

const campo = "mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50 [color-scheme:dark]";
const rotulo = "block text-[10px] font-black uppercase tracking-[0.06em] text-gray-500";

// Etapa 1: anexa a venda (preenche cliente, pneu e veículo) e completa KM atual, posição e defeito para gerar o termo.
function FormGarantia({ form, setForm, onSalvar, onCancelar, salvando }: { form: Form; setForm: (f: Form) => void; onSalvar: () => void; onCancelar: () => void; salvando: boolean }) {
  const set = (k: keyof Form) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState("");

  async function anexarVenda(file: File | null) {
    if (!file) return;
    setLendo(true);
    setAviso("");
    try {
      const v = await lerVendaPdf(file);
      const empresa = EMPRESAS.find((e) => e.cnpj === v.cnpjEmpresa);
      const pneu = v.pneus.length === 1 ? v.pneus[0].descricao : "";
      setForm({
        ...form,
        arquivoVenda: file,
        lojaId: empresa ? String(empresa.lojaId) : form.lojaId,
        clienteNome: v.clienteNome || form.clienteNome,
        clienteTelefone: v.clienteTelefone || form.clienteTelefone,
        clienteCpf: v.clienteCpf || form.clienteCpf,
        pneu: pneu || form.pneu,
        vendaNumero: v.vendaNumero, vendaData: v.vendaData, veiculo: v.veiculo, veiculoAno: v.veiculoAno, placa: v.placa, kmVenda: v.kmVenda,
        pneus: v.pneus,
        pneuCodigo: v.pneus.length === 1 ? v.pneus[0].codigo : "",
        clienteEndereco: v.clienteEndereco, clienteBairro: v.clienteBairro, clienteCep: v.clienteCep, clienteCidade: v.clienteCidade, clienteUf: v.clienteUf,
      });
      const faltas = [!v.clienteNome && "nome do cliente", !empresa && "loja", !v.pneus.length && "pneu"].filter(Boolean);
      setAviso(faltas.length ? `Não achei na venda: ${faltas.join(", ")}. Preencha abaixo.` : v.pneus.length > 1 ? "A venda tem mais de um pneu: escolha qual vai para garantia." : "");
    } catch {
      setForm({ ...form, arquivoVenda: file });
      setAviso("Não consegui ler essa venda. Ela fica anexada; preencha os dados abaixo.");
    } finally {
      setLendo(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!form.id && (
        <label className="flex min-h-[90px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.03] px-4 text-center hover:border-[#D4AF37]/50 sm:col-span-2">
          <FileText className="h-6 w-6 text-[#F2D675]" />
          <span className="mt-2 text-sm font-black text-[#F2D675]">{lendo ? "Lendo a venda..." : form.arquivoVenda ? `Venda anexada: ${form.arquivoVenda.name}` : "Anexar a venda (PDF)"}</span>
          <span className="mt-1 text-[11px] text-gray-500">Preenche loja, cliente, telefone, CPF e pneu automaticamente</span>
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void anexarVenda(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
        </label>
      )}
      {aviso && <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-2 text-xs font-bold text-amber-200 sm:col-span-2">{aviso}</p>}
      {(form.vendaNumero || form.veiculo) && (
        <p className="text-xs text-gray-400 sm:col-span-2">
          Venda <b className="text-gray-200">{form.vendaNumero || "—"}</b>{form.vendaData ? ` de ${dataBr(form.vendaData)}` : ""}
          {form.veiculo ? <> • Veículo <b className="text-gray-200">{[form.veiculo, form.veiculoAno].filter(Boolean).join(" ")}</b></> : null}
          {form.placa ? <> • Placa <b className="text-gray-200">{form.placa}</b></> : null}
          {form.kmVenda != null ? <> • KM na venda <b className="text-gray-200">{form.kmVenda.toLocaleString("pt-BR")}</b></> : null}
        </p>
      )}
      <label className={rotulo}>Loja *<select value={form.lojaId} onChange={set("lojaId")} className={campo}><option value="">Selecione</option>{EMPRESAS.map((e) => <option key={e.lojaId} value={e.lojaId}>{e.loja}</option>)}</select></label>
      <label className={rotulo}>Data de entrada *<input type="date" value={form.dataEntrada} onChange={set("dataEntrada")} className={campo} /></label>
      <label className={`${rotulo} sm:col-span-2`}>Nome do cliente *<input value={form.clienteNome} onChange={set("clienteNome")} className={campo} /></label>
      <label className={rotulo}>Telefone<input value={form.clienteTelefone} onChange={set("clienteTelefone")} inputMode="tel" className={campo} /></label>
      <label className={rotulo}>CPF<input value={form.clienteCpf} onChange={set("clienteCpf")} inputMode="numeric" className={campo} /></label>
      {form.pneus.length > 1 ? (
        <label className={`${rotulo} sm:col-span-2`}>Pneu da garantia *<select value={form.pneu} onChange={(e) => setForm({ ...form, pneu: e.target.value, pneuCodigo: form.pneus.find((p) => p.descricao === e.target.value)?.codigo || "" })} className={campo}><option value="">Escolha o pneu da venda</option>{form.pneus.map((p) => <option key={p.codigo + p.descricao} value={p.descricao}>{p.descricao} ({p.quantidade} un.)</option>)}</select></label>
      ) : (
        <label className={`${rotulo} sm:col-span-2`}>Pneu *<input value={form.pneu} onChange={set("pneu")} placeholder="Ex.: PNEU 185/60/15 PEARLY BP MAX-PRL005 84H" className={campo} /></label>
      )}

      <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/[0.03] p-3 sm:col-span-2">
        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#D4AF37]/80">Preencher na hora</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          <label className={rotulo}>KM atual *<input value={form.kmAtual} onChange={(e) => setForm({ ...form, kmAtual: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" className={campo} /></label>
          <label className={rotulo}>KM na troca *<input value={form.kmVenda == null ? "" : String(form.kmVenda)} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setForm({ ...form, kmVenda: v === "" ? null : Number(v) }); }} inputMode="numeric" placeholder="Vem da venda" className={campo} /></label>
          <div className={`${rotulo} sm:col-span-2`}>KM rodado
            <p className={`mt-1 flex h-10 items-center rounded-xl border px-3 text-sm font-black ${form.kmAtual && form.kmVenda != null && kmRodado(form.kmAtual, form.kmVenda) == null ? "border-rose-400/40 text-rose-200" : "border-white/[0.06] text-[#F2D675]"}`}>
              {form.kmAtual && form.kmVenda != null ? (kmRodado(form.kmAtual, form.kmVenda) == null ? "KM atual menor que o KM na troca" : kmTexto(kmRodado(form.kmAtual, form.kmVenda))) : "—"}
            </p>
          </div>
          <label className={`${rotulo} sm:col-span-3`}>Posição do pneu *<input list="posicoes-pneu" value={form.posicao} onChange={set("posicao")} placeholder="Ex.: Dianteiro Direito" className={campo} /><datalist id="posicoes-pneu">{POSICOES.map((p) => <option key={p} value={p} />)}</datalist></label>
          <label className={rotulo}>Quantidade *<input value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" className={campo} /></label>
          <label className={`${rotulo} sm:col-span-4`}>Defeito alegado *<input value={form.defeito} onChange={set("defeito")} placeholder="Ex.: Bolha" className={campo} /></label>
        </div>
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancelar} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400">Cancelar</button>
        <button type="button" disabled={salvando || lendo} onClick={onSalvar} className="h-10 rounded-xl bg-[#D4AF37] px-4 text-xs font-black text-black disabled:opacity-50"><Save className="mr-2 inline h-4 w-4" />{form.id ? "Salvar" : "Salvar e gerar termo"}</button>
      </div>
    </div>
  );
}

const ETAPA_NOME: Record<string, string> = {
  termo: "Etapa 1 • aguardando termo assinado",
  fornecedor: "Etapa 2 • falta fornecedor e nota",
  envio: "Etapa 3 • documento do fornecedor",
};
function SituacaoChip({ g }: { g: any }) {
  const texto = g.status === "aberta" ? ETAPA_NOME[g.etapa] || STATUS_NOME.aberta : STATUS_NOME[g.status as Status];
  return <span className={`rounded-full px-2 py-1 text-[10px] font-black ${STATUS_COR[g.status as Status]}`}>{texto}</span>;
}

// Campos extras que cada formulário de fornecedor pode pedir (os comuns a todos ficam sempre na tela).
const CAMPOS_EXTRAS: Record<string, { rotulo: string; tipo?: "date" | "servico"; dica?: string }> = {
  notaSerie: { rotulo: "Série da nota (venda)" },
  notaData: { rotulo: "Data da nota (venda)", tipo: "date" },
  tipoServico: { rotulo: "Tipo de serviço", tipo: "servico" },
  sulco: { rotulo: "Sulco (mm)", dica: "Ex.: 6" },
  nfFornecedor: { rotulo: "NF de compra do fornecedor" },
  nfFornecedorSerie: { rotulo: "Série da NF de compra" },
  nfFornecedorData: { rotulo: "Data da NF de compra", tipo: "date" },
  pressao: { rotulo: "Pressão de ar (PSI)", dica: "Ex.: 32" },
  emailCompras: { rotulo: "E-mail de contato", dica: "E-mail do Compras" },
};
// Fotos que vão dentro do formulário (GF): tipo do formulário → categoria do anexo.
const FOTOS_FORMULARIO: Array<{ chave: keyof FotosFormulario; categoria: Categoria; nome: string }> = [
  { chave: "dot", categoria: "foto_dot", nome: "DOT" },
  { chave: "marca", categoria: "foto_marca", nome: "Marca" },
  { chave: "completa", categoria: "foto_completa", nome: "Pneu completo" },
  { chave: "interna", categoria: "foto_interna", nome: "Internas" },
  { chave: "banda", categoria: "foto_banda", nome: "Banda de rodagem" },
];

// Etapa 3 com modelo cadastrado: completa o que falta no formulário do fornecedor e gera o PDF preenchido.
function FormularioFornecedor({ g, anexos, modelo, onGerado, onSalvarDados }: {
  g: any; anexos: any[]; modelo: ModeloFornecedor;
  onGerado: (arquivo: { nome: string; mime: string; base64: string }) => Promise<void>;
  onSalvarDados: (dados: Record<string, string>) => Promise<void>;
}) {
  const baixarFoto = trpc.compras.garantias.baixarAnexo.useMutation();
  const pneu = separarPneu(g.pneu);
  const salvo = g.dadosFornecedor || {};
  const [d, setD] = useState<Record<string, string>>({
    codigoProduto: salvo.codigoProduto ?? g.pneuCodigo ?? "",
    medida: salvo.medida ?? pneu.medida,
    marca: salvo.marca ?? pneu.marca,
    modelo: salvo.modelo ?? pneu.modelo,
    carga: salvo.carga ?? pneu.carga,
    dot: salvo.dot ?? "",
    veiculoMarca: salvo.veiculoMarca ?? "",
    veiculoModelo: salvo.veiculoModelo ?? g.veiculo ?? "",
    veiculoAno: salvo.veiculoAno ?? g.veiculoAno ?? "",
    placa: salvo.placa ?? g.placa ?? "",
    notaSerie: salvo.notaSerie ?? "",
    notaData: salvo.notaData ?? g.vendaData ?? "",
    tipoServico: salvo.tipoServico ?? "passeio",
    sulco: salvo.sulco ?? "",
    nfFornecedor: salvo.nfFornecedor ?? "",
    nfFornecedorSerie: salvo.nfFornecedorSerie ?? "",
    nfFornecedorData: salvo.nfFornecedorData ?? "",
    pressao: salvo.pressao ?? "",
    emailCompras: salvo.emailCompras ?? "",
  });
  const [gerando, setGerando] = useState(false);
  const [erroLocal, setErroLocal] = useState("");
  const set = (k: string) => (e: any) => setD({ ...d, [k]: e.target.value });
  const fotosDoTipo = (c: Categoria) => anexos.filter((a) => a.categoria === c && /^image\/(jpeg|png)$/.test(a.mime));
  const faltaFoto = modelo.fotos ? FOTOS_FORMULARIO.filter((f) => fotosDoTipo(f.categoria).length < 2).map((f) => f.nome) : [];
  const temVideo = anexos.some((a) => a.categoria === "video");

  async function gerar() {
    const faltam = [!d.dot.trim() && "DOT", !d.medida.trim() && "medida", !d.marca.trim() && "marca do pneu"].filter(Boolean);
    if (faltam.length) {
      setErroLocal(`Preencha: ${faltam.join(", ")}.`);
      return;
    }
    setErroLocal("");
    setGerando(true);
    try {
      await onSalvarDados(d);
      const empresa = empresaDaLoja(g.lojaId);
      if (!empresa) throw new Error("Loja sem cadastro da empresa.");
      const fotos: FotosFormulario = {};
      if (modelo.fotos) {
        for (const f of FOTOS_FORMULARIO) {
          const lista = [];
          for (const a of fotosDoTipo(f.categoria).slice(0, 2)) {
            const arq = await baixarFoto.mutateAsync({ anexoId: a.id });
            const bin = atob(arq.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
            lista.push({ bytes, mime: arq.mime });
          }
          fotos[f.chave] = lista;
        }
      }
      const original = new Uint8Array(await (await fetch(modelo.arquivo)).arrayBuffer());
      const pronto = await modelo.preencher(original, {
        clienteNome: g.clienteNome, clienteCpf: g.clienteCpf, clienteEndereco: g.clienteEndereco, clienteBairro: g.clienteBairro, clienteCep: g.clienteCep,
        clienteCidade: g.clienteCidade, clienteUf: g.clienteUf, clienteTelefone: g.clienteTelefone,
        codigoProduto: d.codigoProduto, medida: d.medida, modelo: d.modelo, marca: d.marca, carga: d.carga, dot: d.dot,
        kmRodado: kmRodado(g.kmAtual, g.kmVenda), posicao: g.posicao, defeito: g.defeito, tipoServico: d.tipoServico as any,
        veiculoMarca: d.veiculoMarca, veiculoModelo: d.veiculoModelo, veiculoAno: d.veiculoAno, placa: d.placa,
        notaFiscal: g.notaFiscal, notaSerie: d.notaSerie, notaData: d.notaData || null,
        nfFornecedor: d.nfFornecedor, nfFornecedorSerie: d.nfFornecedorSerie, nfFornecedorData: d.nfFornecedorData || null, sulco: d.sulco,
        dataMontagem: g.vendaData, kmAtual: g.kmAtual, pressao: d.pressao, emailCompras: d.emailCompras,
      }, empresa, fotos);
      const blob = new Blob([pronto as BlobPart], { type: "application/pdf" });
      const nome = `garantia-${g.id}-${modelo.id}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      await onGerado({ nome, mime: "application/pdf", base64: await toBase64(blob) });
    } catch (e: any) {
      setErroLocal(e?.message || "Não foi possível gerar o formulário.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-[11px] text-gray-500">Formulário da {modelo.nome}: cliente, loja, nota, KM rodado, posição e defeito já vêm da garantia. Confira e complete:</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className={rotulo}>Código do produto<input value={d.codigoProduto} onChange={set("codigoProduto")} className={campo} /></label>
        <label className={rotulo}>Medida *<input value={d.medida} onChange={set("medida")} className={campo} /></label>
        <label className={rotulo}>DOT *<input value={d.dot} onChange={set("dot")} placeholder="Ex.: 3524" className={campo} /></label>
        <label className={rotulo}>Marca do pneu *<input value={d.marca} onChange={set("marca")} className={campo} /></label>
        <label className={rotulo}>Modelo do pneu<input value={d.modelo} onChange={set("modelo")} className={campo} /></label>
        <label className={rotulo}>Índice carga/veloc.<input value={d.carga} onChange={set("carga")} className={campo} /></label>
        <label className={rotulo}>Marca do veículo<input value={d.veiculoMarca} onChange={set("veiculoMarca")} placeholder="Ex.: Peugeot" className={campo} /></label>
        <label className={rotulo}>Modelo do veículo<input value={d.veiculoModelo} onChange={set("veiculoModelo")} className={campo} /></label>
        <label className={rotulo}>Ano<input value={d.veiculoAno} onChange={set("veiculoAno")} className={campo} /></label>
        <label className={rotulo}>Placa<input value={d.placa} onChange={set("placa")} className={campo} /></label>
        {modelo.campos.map((k) => {
          const c = CAMPOS_EXTRAS[k];
          if (!c) return null;
          if (c.tipo === "servico") return (
            <label key={k} className={rotulo}>{c.rotulo}<select value={d[k]} onChange={set(k)} className={campo}>
              <option value="passeio">Passeio</option><option value="taxi">Táxi</option><option value="onibus">Ônibus</option><option value="caminhao">Caminhão</option><option value="outros">Outros</option>
            </select></label>
          );
          return <label key={k} className={rotulo}>{c.rotulo}<input type={c.tipo === "date" ? "date" : "text"} value={d[k] || ""} onChange={set(k)} placeholder={c.dica} className={campo} /></label>;
        })}
      </div>
      {modelo.fotos && (
        <div className="rounded-xl border border-white/[0.06] p-2 text-[11px] text-gray-400">
          <p className="font-black text-gray-300">Fotos que vão dentro do formulário (2 de cada, anexe na seção "Fotos e vídeo do pneu"):</p>
          <p className="mt-1">{FOTOS_FORMULARIO.map((f) => `${f.nome}: ${Math.min(2, fotosDoTipo(f.categoria).length)}/2`).join(" • ")}</p>
          {faltaFoto.length > 0 && <p className="mt-1 font-bold text-amber-300">Faltam fotos de: {faltaFoto.join(", ")}. Dá para gerar assim mesmo, com a caixa vazia.</p>}
          <p className={`mt-1 font-bold ${temVideo ? "text-emerald-300" : "text-amber-300"}`}>{temVideo ? "Vídeo anexado: mande junto no e-mail." : "A GF exige um vídeo do pneu mostrando o defeito: anexe em \"Vídeo do pneu\" e mande no e-mail."}</p>
        </div>
      )}
      {erroLocal && <p className="text-xs font-bold text-rose-300">{erroLocal}</p>}
      <button type="button" disabled={gerando} onClick={() => void gerar()} className="h-9 rounded-xl bg-[#D4AF37] px-3 text-xs font-black text-black disabled:opacity-50">
        <Download className="mr-2 inline h-4 w-4" />{gerando ? "Gerando..." : `Gerar formulário ${modelo.nome} (PDF)`}
      </button>
    </div>
  );
}

// Etapa 3 para fornecedor sem formulário (Gomma, Cantu): monta a mensagem do WhatsApp com os dados da garantia,
// abre o WhatsApp com o texto pronto e guarda a mensagem enviada nos anexos da garantia.
function MensagemWhatsapp({ g, anexos, fornecedor, onSalvarDados, onArquivar }: {
  g: any; anexos: any[]; fornecedor: FornecedorWhatsapp;
  onSalvarDados: (dados: Record<string, string>) => Promise<void>;
  onArquivar: (arquivo: { nome: string; mime: string; base64: string }) => Promise<void>;
}) {
  const baixar = trpc.compras.garantias.baixarAnexo.useMutation();
  const pneu = separarPneu(g.pneu);
  const salvo = g.dadosFornecedor || {};
  const [d, setD] = useState<Record<string, string>>({
    medida: salvo.medida ?? pneu.medida,
    marca: salvo.marca ?? pneu.marca,
    modelo: salvo.modelo ?? pneu.modelo,
    dot: salvo.dot ?? "",
    sulco: salvo.sulco ?? "",
    veiculoMarca: salvo.veiculoMarca ?? "",
    nfFornecedor: salvo.nfFornecedor ?? "",
    nfFornecedorData: salvo.nfFornecedorData ?? "",
  });
  const [texto, setTexto] = useState<string>(salvo.mensagem || "");
  const [editado, setEditado] = useState(!!salvo.mensagem);
  const [aviso, setAviso] = useState("");
  const [baixando, setBaixando] = useState(false);
  const set = (k: string) => (e: any) => setD({ ...d, [k]: e.target.value });
  const midias = anexos.filter((a) => a.categoria.startsWith("foto") || a.categoria === "video");

  const montar = () => {
    const empresa = empresaDaLoja(g.lojaId);
    if (!empresa) return "";
    return mensagemWhatsapp({
      garantiaId: g.id, dataEntrada: g.dataEntrada, pneu: g.pneu,
      clienteNome: g.clienteNome, clienteCpf: g.clienteCpf, clienteEndereco: g.clienteEndereco, clienteBairro: g.clienteBairro, clienteCep: g.clienteCep,
      clienteCidade: g.clienteCidade, clienteUf: g.clienteUf, clienteTelefone: g.clienteTelefone,
      codigoProduto: g.pneuCodigo, medida: d.medida, modelo: d.modelo, marca: d.marca, carga: pneu.carga, dot: d.dot,
      kmRodado: kmRodado(g.kmAtual, g.kmVenda), posicao: g.posicao, defeito: g.defeito, tipoServico: "passeio",
      veiculoMarca: d.veiculoMarca, veiculoModelo: g.veiculo, veiculoAno: g.veiculoAno, placa: g.placa,
      notaFiscal: g.notaFiscal, notaSerie: "", notaData: g.vendaData,
      nfFornecedor: d.nfFornecedor, nfFornecedorSerie: "", nfFornecedorData: d.nfFornecedorData || null, sulco: d.sulco,
      dataMontagem: g.vendaData, kmAtual: g.kmAtual, pressao: "", emailCompras: "",
    }, empresa);
  };
  const mensagem = editado ? texto : montar();

  // Guarda a mensagem como enviada (dados + arquivo .txt nos anexos), uma vez por versão do texto.
  async function arquivar() {
    if (!d.dot.trim()) {
      setAviso("Preencha o DOT antes de mandar.");
      return false;
    }
    setAviso("");
    if (salvo.mensagem === mensagem) return true;
    await onSalvarDados({ ...d, mensagem });
    const blob = new Blob([mensagem], { type: "text/plain" });
    await onArquivar({ nome: `whatsapp-${fornecedor.id}-garantia-${g.id}.txt`, mime: "text/plain", base64: await toBase64(blob) });
    return true;
  }
  async function abrirWhatsapp() {
    if (!(await arquivar())) return;
    const numero = String(fornecedor.telefone || "").replace(/\D/g, "");
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, "_blank");
  }
  async function copiar() {
    if (!(await arquivar())) return;
    await navigator.clipboard.writeText(mensagem);
    setAviso("Mensagem copiada. É só colar na conversa do WhatsApp.");
  }
  async function baixarMidias() {
    setBaixando(true);
    try {
      for (const a of midias) {
        const arq = await baixar.mutateAsync({ anexoId: a.id });
        abrirArquivo(arq.nome, arq.mime, arq.base64);
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e: any) {
      setAviso(e?.message || "Não foi possível baixar.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-[11px] text-gray-500">{fornecedor.nome} recebe a garantia pelo WhatsApp. Complete os dados, confira a mensagem e mande pelo WhatsApp com as fotos e o vídeo.</p>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className={rotulo}>DOT *<input value={d.dot} onChange={set("dot")} className={campo} /></label>
        <label className={rotulo}>Medida<input value={d.medida} onChange={set("medida")} className={campo} /></label>
        <label className={rotulo}>Marca do pneu<input value={d.marca} onChange={set("marca")} className={campo} /></label>
        <label className={rotulo}>Modelo do pneu<input value={d.modelo} onChange={set("modelo")} className={campo} /></label>
        <label className={rotulo}>Sulco (mm)<input value={d.sulco} onChange={set("sulco")} className={campo} /></label>
        <label className={rotulo}>Marca do veículo<input value={d.veiculoMarca} onChange={set("veiculoMarca")} placeholder="Ex.: Peugeot" className={campo} /></label>
        <label className={rotulo}>NF de compra<input value={d.nfFornecedor} onChange={set("nfFornecedor")} className={campo} /></label>
        <label className={rotulo}>Data da NF de compra<input type="date" value={d.nfFornecedorData} onChange={set("nfFornecedorData")} className={campo} /></label>
      </div>
      <label className={rotulo}>Mensagem
        <textarea value={mensagem} onChange={(e) => { setTexto(e.target.value); setEditado(true); }} rows={10} className={`${campo} h-auto py-2 font-mono text-xs leading-5`} />
      </label>
      {editado && <button type="button" onClick={() => { setEditado(false); setTexto(""); }} className="text-[11px] font-black text-gray-500 hover:text-[#F2D675]"><RotateCcw className="mr-1 inline h-3 w-3" />Refazer a mensagem com os dados</button>}
      {aviso && <p className="text-xs font-bold text-amber-200">{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void abrirWhatsapp()} className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-black text-black">Abrir no WhatsApp</button>
        <button type="button" onClick={() => void copiar()} className="h-9 rounded-xl border border-white/10 px-3 text-xs font-black text-gray-300">Copiar mensagem</button>
        <button type="button" disabled={baixando || !midias.length} onClick={() => void baixarMidias()} className="h-9 rounded-xl border border-[#D4AF37]/25 px-3 text-xs font-black text-[#F2D675] disabled:opacity-40">
          <Download className="mr-2 inline h-4 w-4" />{baixando ? "Baixando..." : `Baixar fotos e vídeo (${midias.length})`}
        </button>
      </div>
      <p className="text-[10px] text-gray-600">A mensagem fica guardada nos anexos da garantia. Se quiser, anexe também o print da conversa em "Documento do fornecedor".</p>
    </div>
  );
}

// Mensagem para o cliente quando o laudo chega: só pede para vir à loja, sem falar o resultado.
function mensagemCliente(g: any) {
  const empresa = empresaDaLoja(g.lojaId);
  const nome = String(g.clienteNome || "").trim().split(/\s+/)[0] || "";
  const nomeFormatado = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : "";
  const endereco = empresa ? `${empresa.logradouro} - ${empresa.cidade}` : "";
  return [
    `Olá${nomeFormatado ? `, ${nomeFormatado}` : ""}! Aqui é da Impacto Prime ${g.loja}.`,
    `O laudo da análise do seu pneu (garantia nº ${g.id}) já chegou.`,
    `Por favor, compareça à nossa loja${endereco ? ` (${endereco})` : ""} com o termo de garantia em mãos para receber o laudo e as orientações sobre o seu pneu.`,
    "Qualquer dúvida, estamos à disposição!",
  ].join("\n\n");
}

function whatsappDoCliente(telefone: string) {
  const n = String(telefone || "").replace(/\D/g, "");
  if (!n) return "";
  return n.length <= 11 ? `55${n}` : n;
}

// Etapas depois do envio: 4) laudo do fornecedor; 5) avisar o cliente; 6) anexar a conversa e finalizar.
function EtapasFinais({ g, anexos, dataAcao, setDataAcao, enviando, onAnexar, onStatus, onFinalizar, onVoltar }: {
  g: any; anexos: any[]; dataAcao: string; setDataAcao: (v: string) => void; enviando: Categoria | null;
  onAnexar: (categoria: Categoria, files: FileList | null) => void;
  onStatus: (status: "aprovada" | "negada") => void;
  onFinalizar: (resultado: Resultado) => void;
  onVoltar: () => void;
}) {
  const [texto, setTexto] = useState(() => mensagemCliente(g));
  const [aviso, setAviso] = useState("");
  const qtd = (c: Categoria) => anexos.filter((a) => a.categoria === c && a.mime !== "text/plain").length;
  const respondida = g.status === "aprovada" || g.status === "negada" || (g.status === "finalizada" && !!g.dataResposta);
  const finalizada = g.status === "finalizada";
  const podeFinalizar = !finalizada && (respondida || g.vencida);
  const botaoAnexar = (categoria: Categoria, rotuloBotao: string) => (
    <label className={`flex h-9 cursor-pointer items-center rounded-xl border border-[#D4AF37]/25 px-3 text-xs font-black text-[#F2D675] ${enviando ? "pointer-events-none opacity-50" : ""}`}>
      <Paperclip className="mr-2 h-4 w-4" />{enviando === categoria ? "Enviando..." : rotuloBotao}
      <input type="file" multiple className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt" onChange={(e) => { onAnexar(categoria, e.target.files); e.currentTarget.value = ""; }} />
    </label>
  );
  const caixa = (ativo: boolean, feito: boolean) =>
    `rounded-2xl border p-3 ${feito ? "border-emerald-400/25 bg-emerald-400/[0.03]" : ativo ? "border-[#D4AF37]/40 bg-[#D4AF37]/[0.04]" : "border-white/[0.06] opacity-50"}`;
  const titulo = (n: number, t: string, feito: boolean) => (
    <p className="flex items-center gap-2 text-xs font-black text-gray-100">
      {feito ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#D4AF37]/20 text-[10px] text-[#F2D675]">{n}</span>}
      {t}
    </p>
  );
  const numeroCliente = whatsappDoCliente(g.clienteTelefone);

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#D4AF37]/80">Depois do envio</p>
        <label className="flex items-center gap-2 text-[10px] font-black uppercase text-gray-500">Data<input type="date" value={dataAcao} onChange={(e) => setDataAcao(e.target.value)} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white [color-scheme:dark]" /></label>
      </div>

      <div className={caixa(g.status !== "aberta", respondida)}>
        {titulo(4, "Laudo do fornecedor", respondida)}
        <p className="mt-1 text-[11px] text-gray-500">
          {respondida ? `${g.status === "negada" || g.resultado === "devolvido" || g.resultado === "descartado" ? "Negada" : "Aprovada"} pelo fornecedor em ${dataBr(g.dataResposta)} • laudo anexado (${qtd("laudo")}).`
            : g.status === "aberta" ? "Libera depois do envio ao fornecedor."
            : "Quando o fornecedor mandar o laudo, anexe aqui e marque o resultado."}
        </p>
        {g.status !== "aberta" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {botaoAnexar("laudo", qtd("laudo") ? `Laudo (${qtd("laudo")})` : "Anexar laudo")}
            {g.status === "enviada" && <>
              <button type="button" disabled={!g.laudoAnexado} onClick={() => onStatus("aprovada")} className="h-9 rounded-xl bg-emerald-400 px-3 text-xs font-black text-black disabled:opacity-40">Fornecedor aprovou</button>
              <button type="button" disabled={!g.laudoAnexado} onClick={() => onStatus("negada")} className="h-9 rounded-xl border border-rose-400/40 px-3 text-xs font-black text-rose-200 disabled:opacity-40">Fornecedor negou</button>
            </>}
          </div>
        )}
      </div>

      <div className={caixa(respondida && !finalizada, finalizada)}>
        {titulo(5, "Avisar o cliente", finalizada)}
        {respondida && !finalizada ? (
          <>
            <p className="mt-1 text-[11px] text-gray-500">A mensagem não fala o resultado: só pede para o cliente vir à loja receber o laudo.</p>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className={`${campo} h-auto py-2 text-xs leading-5`} />
            {aviso && <p className="mt-1 text-xs font-bold text-amber-200">{aviso}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => window.open(`https://wa.me/${numeroCliente}?text=${encodeURIComponent(texto)}`, "_blank")} className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-black text-black">
                Abrir WhatsApp do cliente{numeroCliente ? "" : " (sem telefone)"}
              </button>
              <button type="button" onClick={() => void navigator.clipboard.writeText(texto).then(() => setAviso("Mensagem copiada."))} className="h-9 rounded-xl border border-white/10 px-3 text-xs font-black text-gray-300">Copiar mensagem</button>
            </div>
          </>
        ) : <p className="mt-1 text-[11px] text-gray-500">{finalizada ? "Cliente atendido." : "Libera quando o laudo chegar."}</p>}
      </div>

      <div className={caixa(podeFinalizar, finalizada)}>
        {titulo(6, "Conversa com o cliente e finalização", finalizada)}
        {finalizada ? (
          <p className="mt-1 text-[11px] text-gray-500">Finalizada em {dataBr(g.dataFinalizacao)} • {RESULTADO_NOME[g.resultado as Resultado]} • conversa anexada ({qtd("cliente")}).</p>
        ) : podeFinalizar ? (
          <>
            <p className="mt-1 text-[11px] text-gray-500">
              {g.vencida && !respondida ? "Prazo de 30 dias vencido: resolva com o cliente (pneu novo ou reembolso). " : ""}
              Ao terminar o atendimento, anexe o print ou a conversa com o cliente e finalize.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {botaoAnexar("cliente", qtd("cliente") ? `Conversa (${qtd("cliente")})` : "Anexar print / conversa")}
              {(g.status === "negada" ? (["devolvido", "descartado"] as Resultado[]) : (["pneu_novo", "reembolso"] as Resultado[])).map((r) => (
                <button key={r} type="button" disabled={!g.conversaCliente} onClick={() => onFinalizar(r)} className="h-9 rounded-xl bg-[#D4AF37] px-3 text-xs font-black text-black disabled:opacity-40">
                  Finalizar: {RESULTADO_NOME[r].toLowerCase()}
                </button>
              ))}
            </div>
            {!g.conversaCliente && <p className="mt-1 text-[10px] text-amber-300">Finalizar libera depois de anexar a conversa com o cliente.</p>}
          </>
        ) : <p className="mt-1 text-[11px] text-gray-500">Libera depois do laudo.</p>}
      </div>

      {g.status !== "aberta" && (
        <button type="button" onClick={onVoltar} className="h-8 rounded-xl border border-white/10 px-3 text-[11px] font-black text-gray-500"><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Voltar etapa</button>
      )}
    </div>
  );
}

// Etapas antes do envio: 1) termo assinado; 2) fornecedor e nota fiscal; 3) documento do fornecedor e envio.
function EtapasIniciais({ g, anexos, dataAcao, enviando, onAnexar, onSalvarFornecedor, salvandoFornecedor, onEnviar, onFormularioGerado, onSalvarDadosFornecedor }: {
  g: any; anexos: any[]; dataAcao: string; enviando: Categoria | null;
  onAnexar: (categoria: Categoria, files: FileList | null) => void;
  onSalvarFornecedor: (fornecedor: string, notaFiscal: string) => void; salvandoFornecedor: boolean;
  onEnviar: () => void;
  onFormularioGerado: (arquivo: { nome: string; mime: string; base64: string }) => Promise<void>;
  onSalvarDadosFornecedor: (dados: Record<string, string>) => Promise<void>;
}) {
  const [fornecedor, setFornecedor] = useState(g.fornecedor || "");
  const [notaFiscal, setNotaFiscal] = useState(g.notaFiscal || "");
  const qtd = (c: Categoria) => anexos.filter((a) => a.categoria === c).length;
  const passo2Ok = !!g.fornecedor && !!g.notaFiscal;
  const botaoAnexar = (categoria: Categoria, texto: string, destaque = false) => (
    <label className={`flex h-9 cursor-pointer items-center rounded-xl px-3 text-xs font-black ${destaque ? "bg-[#D4AF37] text-black" : "border border-[#D4AF37]/25 text-[#F2D675]"} ${enviando ? "pointer-events-none opacity-50" : ""}`}>
      <Paperclip className="mr-2 h-4 w-4" />{enviando === categoria ? "Enviando..." : texto}
      <input type="file" multiple className="hidden" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => { onAnexar(categoria, e.target.files); e.currentTarget.value = ""; }} />
    </label>
  );
  const caixa = (ativo: boolean, feito: boolean) =>
    `rounded-2xl border p-3 ${feito ? "border-emerald-400/25 bg-emerald-400/[0.03]" : ativo ? "border-[#D4AF37]/40 bg-[#D4AF37]/[0.04]" : "border-white/[0.06] opacity-50"}`;
  const titulo = (n: number, texto: string, feito: boolean) => (
    <p className="flex items-center gap-2 text-xs font-black text-gray-100">
      {feito ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#D4AF37]/20 text-[10px] text-[#F2D675]">{n}</span>}
      {texto}
    </p>
  );

  return (
    <div className="mt-4 space-y-2">
      <div className={caixa(true, g.termoAssinado)}>
        {titulo(1, "Termo de garantia", g.termoAssinado)}
        <p className="mt-1 text-[11px] text-gray-500">{g.termoAssinado ? `Termo assinado anexado (${qtd("termo")}).` : "Baixe o termo, mande para o caixa imprimir e colher a assinatura do cliente; depois anexe o termo assinado."}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void baixarTermo(g)} className={`h-9 rounded-xl px-3 text-xs font-black ${g.termoAssinado ? "border border-white/10 text-gray-300" : "bg-[#D4AF37] text-black"}`}><Download className="mr-2 inline h-4 w-4" />Baixar termo (PDF)</button>
          {botaoAnexar("termo", g.termoAssinado ? "Anexar outro" : "Anexar termo assinado", false)}
        </div>
      </div>

      <div className={caixa(g.termoAssinado, passo2Ok)}>
        {titulo(2, "Fornecedor e nota fiscal", passo2Ok)}
        {g.termoAssinado ? (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className={rotulo}>Fornecedor *<input list="fornecedores-garantia" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Para quem vai a garantia" className={campo} /><datalist id="fornecedores-garantia">{MODELOS_FORNECEDOR.map((m) => <option key={m.id} value={m.nome} />)}{FORNECEDORES_WHATSAPP.map((m) => <option key={m.id} value={m.nome} />)}</datalist></label>
              <label className={rotulo}>Nº da nota fiscal *<input value={notaFiscal} onChange={(e) => setNotaFiscal(e.target.value)} className={campo} /></label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={salvandoFornecedor} onClick={() => onSalvarFornecedor(fornecedor, notaFiscal)} className="h-9 rounded-xl bg-[#D4AF37] px-3 text-xs font-black text-black disabled:opacity-50"><Save className="mr-2 inline h-4 w-4" />Salvar</button>
              {botaoAnexar("nota", qtd("nota") ? `Nota fiscal (${qtd("nota")})` : "Anexar nota fiscal")}
            </div>
          </>
        ) : <p className="mt-1 text-[11px] text-gray-500">Libera depois do termo assinado.</p>}
      </div>

      <div className={caixa(passo2Ok && g.termoAssinado, false)}>
        {titulo(3, "Documento do fornecedor e envio", false)}
        {passo2Ok && g.termoAssinado ? (
          <>
            {modeloDoFornecedor(g.fornecedor) ? (
              <FormularioFornecedor g={g} anexos={anexos} modelo={modeloDoFornecedor(g.fornecedor)!} onGerado={onFormularioGerado} onSalvarDados={onSalvarDadosFornecedor} />
            ) : fornecedorWhatsapp(g.fornecedor) ? (
              <MensagemWhatsapp g={g} anexos={anexos} fornecedor={fornecedorWhatsapp(g.fornecedor)!} onSalvarDados={onSalvarDadosFornecedor} onArquivar={onFormularioGerado} />
            ) : (
              <p className="mt-1 text-[11px] text-gray-500">O modelo de {g.fornecedor} ainda não foi cadastrado no sistema: preencha o documento que ele envia e anexe aqui.</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {botaoAnexar("fornecedor", qtd("fornecedor") ? `Documento (${qtd("fornecedor")})` : "Anexar documento preenchido")}
              <button type="button" onClick={onEnviar} className="h-9 rounded-xl bg-sky-400 px-3 text-xs font-black text-black">Enviada ao fornecedor em {dataBr(dataAcao)}</button>
            </div>
          </>
        ) : <p className="mt-1 text-[11px] text-gray-500">Libera depois do fornecedor e da nota fiscal.</p>}
      </div>
    </div>
  );
}

export default function ComprasGarantias() {
  const utils = trpc.useUtils();
  const [lojaFiltro, setLojaFiltro] = useState<number | null>(null);
  const [situacao, setSituacao] = useState<"andamento" | "finalizadas" | "todas">("andamento");
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState<Form | null>(null);
  const [abertaId, setAbertaId] = useState<number | null>(null);
  const [editando, setEditando] = useState<Form | null>(null);
  const [dataAcao, setDataAcao] = useState(hojeIso());
  const [obsCobranca, setObsCobranca] = useState("");
  const [enviando, setEnviando] = useState<Categoria | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [confirmacao, setConfirmacao] = useState<{ texto: string; acao: (senha: string) => void } | null>(null);
  const [senhaExclusao, setSenhaExclusao] = useState("");

  const listaQ = trpc.compras.garantias.lista.useQuery({ lojaId: lojaFiltro, situacao });
  const avisosQ = trpc.compras.garantias.avisos.useQuery();
  const detalheQ = trpc.compras.garantias.detalhe.useQuery({ garantiaId: abertaId || 0 }, { enabled: !!abertaId });

  async function atualizar() {
    await Promise.all([utils.compras.garantias.lista.invalidate(), utils.compras.garantias.avisos.invalidate(), utils.compras.garantias.detalhe.invalidate()]);
  }
  const ok = (texto: string) => async () => { setErro(""); setMensagem(texto); await atualizar(); };
  const falha = (e: any) => setErro(e.message);

  const salvar = trpc.compras.garantias.salvar.useMutation({
    onSuccess: async (d) => { setErro(""); setNovo(null); setEditando(null); setAbertaId(d.garantiaId); setMensagem(`Garantia #${d.garantiaId} salva.`); await atualizar(); },
    onError: falha,
  });
  const salvarDadosFornecedor = trpc.compras.garantias.salvarDadosFornecedor.useMutation({ onError: falha });
  const salvarFornecedor = trpc.compras.garantias.salvarFornecedor.useMutation({ onSuccess: ok("Fornecedor e nota fiscal salvos."), onError: falha });
  const definirStatus = trpc.compras.garantias.definirStatus.useMutation({ onSuccess: ok("Situação atualizada."), onError: falha });
  const cobrar = trpc.compras.garantias.registrarCobranca.useMutation({ onSuccess: async () => { setObsCobranca(""); await ok("Cobrança registrada. O aviso volta em 7 dias se o fornecedor não responder.")(); }, onError: falha });
  const adicionarAnexo = trpc.compras.garantias.adicionarAnexo.useMutation({ onError: falha });
  const baixarAnexo = trpc.compras.garantias.baixarAnexo.useMutation({ onSuccess: (d) => abrirArquivo(d.nome, d.mime, d.base64), onError: falha });
  const excluirAnexo = trpc.compras.garantias.excluirAnexo.useMutation({ onSuccess: ok("Anexo excluído."), onError: falha });
  const excluir = trpc.compras.garantias.excluir.useMutation({ onSuccess: async () => { setAbertaId(null); await ok("Garantia excluída.")(); }, onError: falha });

  async function salvarForm(f: Form) {
    const faltam = [!f.lojaId && "loja", f.clienteNome.trim().length < 2 && "nome do cliente", f.pneu.trim().length < 2 && "pneu", !f.kmAtual && "KM atual", f.kmVenda == null && "KM na troca", f.kmAtual && f.kmVenda != null && kmRodado(f.kmAtual, f.kmVenda) == null && "KM atual (está menor que o KM na troca)", !f.posicao.trim() && "posição do pneu", !f.defeito.trim() && "defeito alegado"].filter(Boolean);
    if (faltam.length) {
      setErro(`Preencha: ${faltam.join(", ")}.`);
      return;
    }
    let anexoVenda = null;
    try {
      anexoVenda = f.arquivoVenda ? await prepararArquivo(f.arquivoVenda) : null;
    } catch (e: any) {
      setErro(e?.message || "Não foi possível anexar a venda.");
      return;
    }
    salvar.mutate({
      id: f.id, lojaId: Number(f.lojaId) || 0, clienteNome: f.clienteNome, clienteTelefone: f.clienteTelefone, clienteCpf: f.clienteCpf,
      pneu: f.pneu, quantidade: Math.max(1, Number(f.quantidade) || 1), posicao: f.posicao, kmAtual: Number(f.kmAtual), defeito: f.defeito,
      dataEntrada: f.dataEntrada, vendaNumero: f.vendaNumero, vendaData: f.vendaData, veiculo: f.veiculo, veiculoAno: f.veiculoAno, placa: f.placa,
      kmVenda: f.kmVenda, anexoVenda, pneuCodigo: f.pneuCodigo, clienteEndereco: f.clienteEndereco, clienteBairro: f.clienteBairro,
      clienteCep: f.clienteCep, clienteCidade: f.clienteCidade, clienteUf: f.clienteUf,
    });
  }

  async function enviarArquivos(categoria: Categoria, files: FileList | null) {
    if (!files?.length || !abertaId) return;
    setEnviando(categoria);
    setErro("");
    try {
      for (const file of Array.from(files)) {
        const anexo = await prepararArquivo(file);
        await adicionarAnexo.mutateAsync({ garantiaId: abertaId, categoria, anexo });
      }
      setMensagem(`${files.length} arquivo(s) anexado(s).`);
      await atualizar();
    } catch (e: any) {
      setErro(e?.message || "Não foi possível anexar.");
    } finally {
      setEnviando(null);
    }
  }

  function pedirSenha(acao: (senha: string) => void, texto: string) {
    setErro("");
    setConfirmacao({ texto, acao });
  }

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const todas = listaQ.data || [];
    if (!termo) return todas;
    return todas.filter((g) => [g.clienteNome, g.clienteCpf, g.pneu, g.fornecedor, g.clienteTelefone].some((v) => String(v || "").toLowerCase().includes(termo)));
  }, [listaQ.data, busca]);

  const av = avisosQ.data;
  const g = detalheQ.data?.garantia;
  const anexos = detalheQ.data?.anexos || [];

  // Voltar uma etapa, quando a situação foi marcada errado.
  function voltarEtapa() {
    if (!g) return;
    if (g.status === "enviada") definirStatus.mutate({ garantiaId: g.id, status: "aberta", data: hojeIso() });
    else if (g.status === "aprovada" || g.status === "negada") definirStatus.mutate({ garantiaId: g.id, status: "enviada", data: g.dataEnvio || hojeIso() });
    else if (g.status === "finalizada") {
      const anterior: Status = g.dataResposta ? (g.resultado === "pneu_novo" || g.resultado === "reembolso" ? "aprovada" : "negada") : g.dataEnvio ? "enviada" : "aberta";
      definirStatus.mutate({ garantiaId: g.id, status: anterior, data: (anterior === "enviada" ? g.dataEnvio : g.dataResposta) || hojeIso() });
    }
  }
  const finalizar = (resultado: Resultado) => g && definirStatus.mutate({ garantiaId: g.id, status: "finalizada", data: dataAcao, resultado });

  return (
    <main className="min-h-full bg-[#050505] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="rounded-3xl border border-[#D4AF37]/20 bg-[#090909] p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]/60">COMPRAS • GARANTIAS</p>
              <h1 className="mt-2 text-3xl font-black">Garantia de pneus</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
                Termo de envio para análise, fotos, venda e nota. Prazo de 30 dias para resolver com o cliente; passou disso, é pneu novo ou reembolso.
                Enquanto o fornecedor não responde, o aviso pede cobrança toda semana.
              </p>
            </div>
            <button type="button" onClick={() => { setNovo(formVazio(lojaFiltro ? String(lojaFiltro) : "")); setAbertaId(null); }} className="h-11 rounded-xl bg-[#D4AF37] px-4 text-sm font-black text-black">
              <Plus className="mr-2 inline h-4 w-4" />Nova garantia
            </button>
          </div>

          {av && (
            <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { n: av.vencidas, t: "Prazo vencido", d: "Dar pneu novo ou reembolsar", c: "border-rose-400/30 text-rose-200" },
                { n: av.venceLogo, t: "Vencem em até 7 dias", d: "Apertar o fornecedor", c: "border-amber-400/30 text-amber-200" },
                { n: av.cobrar, t: "Cobrar o fornecedor", d: "Sem cobrança há 7 dias ou mais", c: "border-sky-400/30 text-sky-200" },
                { n: av.naoEnviadas, t: "Ainda não enviadas", d: "Mandar para o fornecedor", c: "border-amber-400/20 text-amber-100" },
                { n: av.avisarCliente, t: "Laudo chegou", d: "Avisar e atender o cliente", c: "border-emerald-400/30 text-emerald-200" },
                { n: av.total, t: "Em andamento", d: "Todas as garantias abertas", c: "border-white/10 text-gray-300" },
              ].map((x) => (
                <div key={x.t} className={`rounded-2xl border bg-black/30 p-3 ${x.n ? x.c : "border-white/[0.06] text-gray-600"}`}>
                  <p className="text-2xl font-black">{x.n}</p>
                  <p className="text-xs font-black">{x.t}</p>
                  <p className="text-[10px] opacity-70">{x.d}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select value={lojaFiltro ?? ""} onChange={(e) => setLojaFiltro(e.target.value ? Number(e.target.value) : null)} className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white">
              <option value="">Todas as lojas</option>
              {EMPRESAS.map((e) => <option key={e.lojaId} value={e.lojaId}>{e.loja}</option>)}
            </select>
            {(["andamento", "finalizadas", "todas"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSituacao(s)} className={`h-10 rounded-xl px-4 text-xs font-black ${situacao === s ? "bg-[#D4AF37] text-black" : "border border-white/10 text-gray-400"}`}>
                {s === "andamento" ? "Em andamento" : s === "finalizadas" ? "Finalizadas" : "Todas"}
              </button>
            ))}
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, CPF, pneu ou fornecedor" className="h-10 min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none" />
          </div>

          {mensagem && <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{mensagem}</div>}
          {erro && <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3 text-sm text-rose-200"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}</div>}
        </section>

        {novo && (
          <section className="mt-5 rounded-3xl border border-[#D4AF37]/25 bg-[#090909] p-5 sm:p-7">
            <h2 className="mb-4 text-lg font-black">Nova garantia</h2>
            <FormGarantia form={novo} setForm={setNovo} onSalvar={() => salvarForm(novo)} onCancelar={() => setNovo(null)} salvando={salvar.isPending} />
          </section>
        )}

        <div className={`mt-5 grid gap-5 ${abertaId ? "xl:grid-cols-[minmax(0,1fr)_560px]" : ""}`}>
          <section className="min-w-0 rounded-3xl border border-white/[0.06] bg-[#090909] p-3 sm:p-4">
            {listaQ.isLoading ? <p className="p-6 text-center text-sm text-gray-500">Carregando...</p> : !lista.length ? (
              <p className="p-8 text-center text-sm text-gray-500">Nenhuma garantia {situacao === "andamento" ? "em andamento" : situacao === "finalizadas" ? "finalizada" : ""}.</p>
            ) : (
              <div className="space-y-2">
                {lista.map((x) => (
                  <button key={x.id} type="button" onClick={() => { setAbertaId(x.id); setEditando(null); setNovo(null); setDataAcao(hojeIso()); }}
                    className={`block w-full rounded-2xl border p-3 text-left transition hover:border-[#D4AF37]/40 ${abertaId === x.id ? "border-[#D4AF37]/50 bg-[#D4AF37]/[0.04]" : x.vencida ? "border-rose-400/30 bg-rose-500/[0.04]" : "border-white/[0.06] bg-black/20"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-[#F2D675]">#{x.id}</span>
                      <span className="font-black">{x.clienteNome}</span>
                      <span className="text-xs text-gray-500">{x.loja}</span>
                      <span className="ml-auto"><SituacaoChip g={x} /></span>
                    </div>
                    <p className="mt-1 text-sm text-gray-300">{x.pneu} <span className="text-gray-500">• {x.defeito}</span></p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <PrazoChip g={x} />
                      {x.cobrarAgora && <span className="rounded-full bg-sky-400/[0.15] px-2 py-1 text-[10px] font-black text-sky-200"><BellRing className="mr-1 inline h-3 w-3" />Cobrar fornecedor</span>}
                      {x.guardaVencida && <span className="rounded-full bg-rose-400/[0.12] px-2 py-1 text-[10px] font-black text-rose-200">60 dias de guarda vencidos</span>}
                      <span>Entrada {dataBr(x.dataEntrada)}</span>
                      {x.fornecedor && <span>• {x.fornecedor}</span>}
                      <span>• {x.anexos} anexo(s)</span>
                      {x.cobrancas > 0 && <span>• {x.cobrancas} cobrança(s)</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {abertaId && (
            <aside className="min-w-0 rounded-3xl border border-[#D4AF37]/25 bg-[#090909] p-4 sm:p-5 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
              {!g ? <p className="p-6 text-center text-sm text-gray-500">{detalheQ.isError ? detalheQ.error.message : "Carregando..."}</p> : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-[#F2D675]">Garantia #{g.id} • {g.loja}</p>
                      <h2 className="text-xl font-black">{g.clienteNome}</h2>
                      <p className="text-sm text-gray-400">{g.pneu}</p>
                    </div>
                    <button type="button" onClick={() => setAbertaId(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-gray-400"><X className="h-4 w-4" /></button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <SituacaoChip g={g} />
                    <PrazoChip g={g} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span>Entrada: <b className="text-gray-300">{dataBr(g.dataEntrada)}</b></span>
                    <span>Prazo (30 dias): <b className="text-gray-300">{dataBr(g.prazo)}</b></span>
                    {g.dataEnvio && <span>Enviada: <b className="text-gray-300">{dataBr(g.dataEnvio)}</b></span>}
                    {g.dataResposta && <span>Resposta: <b className="text-gray-300">{dataBr(g.dataResposta)}</b></span>}
                    {g.guardaAte && <span className={g.guardaVencida ? "text-rose-300" : ""}>Guardar até: <b>{dataBr(g.guardaAte)}</b></span>}
                    {g.resultado && <span className="col-span-2">Resultado: <b className="text-gray-300">{RESULTADO_NOME[g.resultado as Resultado]}</b></span>}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {g.status !== "aberta" && <button type="button" onClick={() => void baixarTermo(g)} className="h-10 rounded-xl border border-white/10 px-3 text-xs font-black text-gray-300"><Download className="mr-2 inline h-4 w-4" />Baixar termo (PDF)</button>}
                    {!editando && <button type="button" onClick={() => setEditando(formDe(g))} className="h-10 rounded-xl border border-white/10 px-3 text-xs font-black text-gray-300"><FileText className="mr-2 inline h-4 w-4" />Editar dados</button>}
                    <button type="button" onClick={() => pedirSenha((senha) => excluir.mutate({ garantiaId: g.id, senha }), `Excluir a garantia #${g.id} de ${g.clienteNome}, com todos os anexos?`)} className="h-10 rounded-xl border border-rose-400/30 px-3 text-xs font-black text-rose-300 hover:bg-rose-400/[0.06]"><Trash2 className="mr-2 inline h-4 w-4" />Excluir garantia</button>
                  </div>

                  {editando ? (
                    <div className="mt-4 rounded-2xl border border-white/[0.06] p-3">
                      <FormGarantia form={editando} setForm={setEditando} onSalvar={() => salvarForm(editando)} onCancelar={() => setEditando(null)} salvando={salvar.isPending} />
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 rounded-2xl border border-white/[0.06] p-3 text-xs text-gray-400">
                      <span>Telefone: <b className="text-gray-200">{g.clienteTelefone || "—"}</b></span>
                      <span>CPF: <b className="text-gray-200">{g.clienteCpf || "—"}</b></span>
                      <span>Quantidade: <b className="text-gray-200">{[g.quantidade, g.posicao].filter(Boolean).join(" ")}</b></span>
                      <span>KM rodado: <b className="text-gray-200">{kmTexto(kmRodado(g.kmAtual, g.kmVenda)) || "—"}</b> <span className="text-gray-600">({g.kmAtual == null ? "—" : g.kmAtual.toLocaleString("pt-BR")} − {g.kmVenda == null ? "—" : g.kmVenda.toLocaleString("pt-BR")})</span></span>
                      <span className="col-span-2">Defeito: <b className="text-gray-200">{g.defeito}</b></span>
                      <span>Veículo: <b className="text-gray-200">{[g.veiculo, g.veiculoAno].filter(Boolean).join(" ") || "—"}{g.placa ? ` • ${g.placa}` : ""}</b></span>
                      <span>Venda: <b className="text-gray-200">{g.vendaNumero || "—"}{g.vendaData ? ` de ${dataBr(g.vendaData)}` : ""}</b></span>
                      {g.status !== "aberta" && <span>Fornecedor: <b className="text-gray-200">{g.fornecedor || "—"}</b></span>}
                      {g.status !== "aberta" && <span>Nota fiscal: <b className="text-gray-200">{g.notaFiscal || "—"}</b></span>}
                    </div>
                  )}

                  {g.status === "aberta" && (
                    <EtapasIniciais key={g.id} g={g} anexos={anexos} dataAcao={dataAcao} enviando={enviando} onAnexar={(c, f) => void enviarArquivos(c, f)}
                      salvandoFornecedor={salvarFornecedor.isPending} onSalvarFornecedor={(fornecedor, notaFiscal) => salvarFornecedor.mutate({ garantiaId: g.id, fornecedor, notaFiscal })}
                      onEnviar={() => definirStatus.mutate({ garantiaId: g.id, status: "enviada", data: dataAcao })}
                      onSalvarDadosFornecedor={async (dados) => { await salvarDadosFornecedor.mutateAsync({ garantiaId: g.id, dados }); }}
                      onFormularioGerado={async (anexo) => { await adicionarAnexo.mutateAsync({ garantiaId: g.id, categoria: "fornecedor", anexo }); setMensagem(anexo.mime === "text/plain" ? "Mensagem guardada nos anexos da garantia." : "Formulário gerado, baixado e anexado na garantia."); await atualizar(); }} />
                  )}

                  {(g.status !== "aberta" || g.vencida) && (
                    <EtapasFinais key={`${g.id}-${g.status}`} g={g} anexos={anexos} dataAcao={dataAcao} setDataAcao={setDataAcao} enviando={enviando}
                      onAnexar={(c, f) => void enviarArquivos(c, f)} onStatus={(status) => definirStatus.mutate({ garantiaId: g.id, status, data: dataAcao })}
                      onFinalizar={finalizar} onVoltar={voltarEtapa} />
                  )}

                  {/* Cobrança do fornecedor */}
                  {(g.status === "aberta" || g.status === "enviada") && (
                    <div className={`mt-4 rounded-2xl border p-3 ${g.cobrarAgora ? "border-sky-400/40 bg-sky-400/[0.05]" : "border-white/[0.06]"}`}>
                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-sky-200/80"><BellRing className="mr-1 inline h-3.5 w-3.5" />Cobrança do fornecedor</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {g.status === "aberta" ? "Começa quando a garantia for marcada como enviada."
                          : g.cobrarAgora ? `Hora de cobrar: ${g.ultimaCobranca ? `última cobrança em ${dataBr(g.ultimaCobranca)}` : `enviada em ${dataBr(g.dataEnvio)}, sem cobrança ainda`}.`
                          : g.ultimaCobranca ? `Última cobrança em ${dataBr(g.ultimaCobranca)}.` : "Sem cobranças ainda."}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <input value={obsCobranca} onChange={(e) => setObsCobranca(e.target.value)} placeholder="Observação (opcional): resposta do fornecedor" className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white outline-none" />
                        <button type="button" disabled={cobrar.isPending} onClick={() => cobrar.mutate({ garantiaId: g.id, observacao: obsCobranca })} className="h-9 shrink-0 rounded-xl bg-sky-400 px-3 text-xs font-black text-black disabled:opacity-50">Cobrei hoje</button>
                      </div>
                    </div>
                  )}
                  {(detalheQ.data?.cobrancas || []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {detalheQ.data!.cobrancas.map((c) => (
                        <p key={c.id} className="text-[11px] text-gray-500"><Clock className="mr-1 inline h-3 w-3" />{dataBr(c.data)} • {c.criadoPorNome}{c.observacao ? ` • ${c.observacao}` : ""}</p>
                      ))}
                    </div>
                  )}

                  {/* Anexos */}
                  <div className="mt-4 space-y-3">
                    {CATEGORIAS.map((cat) => {
                      const doTipo = anexos.filter((a) => a.categoria === cat.categoria);
                      const ehFoto = cat.categoria.startsWith("foto");
                      return (
                        <div key={cat.categoria}>
                        {cat.grupo && <p className="mb-2 mt-4 text-[10px] font-black uppercase tracking-[0.08em] text-[#D4AF37]/80">{cat.grupo}</p>}
                        <div className="rounded-2xl border border-white/[0.06] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-black text-gray-200">{cat.nome} <span className="text-gray-600">({doTipo.length})</span></p>
                              <p className="text-[10px] text-gray-600">{cat.dica}</p>
                            </div>
                            <label className={`flex h-9 cursor-pointer items-center rounded-xl border border-[#D4AF37]/25 px-3 text-xs font-black text-[#F2D675] ${enviando ? "pointer-events-none opacity-50" : ""}`}>
                              {ehFoto || cat.categoria === "video" ? <Camera className="mr-2 h-4 w-4" /> : <Paperclip className="mr-2 h-4 w-4" />}
                              {enviando === cat.categoria ? "Enviando..." : "Anexar"}
                              <input type="file" multiple className="hidden" accept={ehFoto ? "image/*" : cat.categoria === "video" ? "video/*" : "image/*,application/pdf,.doc,.docx,.xls,.xlsx"}
                                onChange={(e) => { void enviarArquivos(cat.categoria, e.target.files); e.currentTarget.value = ""; }} />
                            </label>
                          </div>
                          {doTipo.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {doTipo.map((a) => (
                                <div key={a.id} className="flex items-center gap-2 text-xs">
                                  <button type="button" onClick={() => baixarAnexo.mutate({ anexoId: a.id })} className="min-w-0 flex-1 truncate text-left text-gray-300 hover:text-[#F2D675]"><Download className="mr-1 inline h-3.5 w-3.5" />{a.nome}</button>
                                  <span className="shrink-0 text-[10px] text-gray-600">{Math.max(1, Math.round(a.tamanho / 1024))} KB</span>
                                  <button type="button" onClick={() => pedirSenha((senha) => excluirAnexo.mutate({ anexoId: a.id, senha }), `Excluir o anexo "${a.nome}"?`)} className="shrink-0 text-gray-600 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex justify-between gap-2 border-t border-white/[0.06] pt-4">
                    <p className="text-[10px] text-gray-600">Aberta por {g.criadoPorNome || "—"}</p>

                  </div>
                </>
              )}
            </aside>
          )}
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-700"><ShieldCheck className="h-4 w-4" />Garantias de pneus</p>

        {confirmacao && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={() => { setConfirmacao(null); setSenhaExclusao(""); }}>
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => { e.preventDefault(); if (!senhaExclusao) return; confirmacao.acao(senhaExclusao); setConfirmacao(null); setSenhaExclusao(""); }}
              className="w-full max-w-sm rounded-2xl border border-rose-400/30 bg-[#0b0b0b] p-5"
            >
              <p className="flex items-center gap-2 text-sm font-black text-rose-200"><Trash2 className="h-4 w-4" />Confirmar exclusão</p>
              <p className="mt-2 text-xs text-gray-400">{confirmacao.texto} Não dá para desfazer.</p>
              <label className={`${rotulo} mt-4`}>Senha de exclusão<input type="password" autoFocus autoComplete="off" value={senhaExclusao} onChange={(e) => setSenhaExclusao(e.target.value)} className={campo} /></label>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setConfirmacao(null); setSenhaExclusao(""); }} className="h-10 rounded-xl border border-white/10 px-4 text-xs font-black text-gray-400">Cancelar</button>
                <button type="submit" disabled={!senhaExclusao} className="h-10 rounded-xl bg-rose-500 px-4 text-xs font-black text-white disabled:opacity-50">Excluir</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
