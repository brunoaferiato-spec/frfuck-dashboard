import { Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

// Link fixo do fornecedor para responder as cotações de pneus sem planilha.
// O mesmo link vale para todas as cotações em aberto das cidades que ele atende.

function urlDoLink(token: string) {
  return `${window.location.origin}/cotacao/pneus/${token}`;
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export default function ComprasPneusLinkFornecedor({
  fornecedor,
  compacto = false,
}: {
  fornecedor: { id: number; nome: string };
  compacto?: boolean;
}) {
  const [link, setLink] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const pegarLink = trpc.compras.pneus.linkFornecedor.useMutation();
  const trocarLink = trpc.compras.pneus.trocarLinkFornecedor.useMutation();
  const ocupado = pegarLink.isPending || trocarLink.isPending;

  async function obterLink() {
    if (link) return link;
    const { token } = await pegarLink.mutateAsync({ id: Number(fornecedor.id) });
    const url = urlDoLink(token);
    setLink(url);
    return url;
  }

  async function acao(tipo: "link" | "aviso") {
    setErro("");
    setMensagem("");
    try {
      const url = await obterLink();
      const texto =
        tipo === "link"
          ? url
          : `Olá, ${fornecedor.nome}! Tem cotação de pneus aguardando o seu preço. Responda direto por este link (é o mesmo de sempre, pode salvar): ${url}`;
      const ok = await copiar(texto);
      setMensagem(
        ok
          ? tipo === "link"
            ? "Link copiado."
            : "Aviso copiado. É só colar no WhatsApp ou e-mail."
          : "Não deu para copiar automaticamente: copie o link abaixo."
      );
    } catch (e: any) {
      setErro(e?.message || "Não foi possível gerar o link.");
    }
  }

  async function trocar() {
    if (
      !window.confirm(
        `Trocar o link de ${fornecedor.nome}? O link antigo para de funcionar na hora e você precisa mandar o novo.`
      )
    )
      return;
    setErro("");
    setMensagem("");
    try {
      const { token } = await trocarLink.mutateAsync({ id: Number(fornecedor.id) });
      const url = urlDoLink(token);
      setLink(url);
      const ok = await copiar(url);
      setMensagem(ok ? "Link novo gerado e copiado." : "Link novo gerado: copie abaixo.");
    } catch (e: any) {
      setErro(e?.message || "Não foi possível trocar o link.");
    }
  }

  const botao =
    "inline-flex items-center rounded-lg border px-2.5 py-1 font-black disabled:opacity-50";

  return (
    <div className={compacto ? "text-[11px]" : "text-xs"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!compacto && <Link2 className="mr-1 h-4 w-4 text-fri-f2d675" />}
        <button type="button" disabled={ocupado} onClick={() => void acao("link")} className={`${botao} border-fr-d4af37/30 text-fri-f2d675`}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link
        </button>
        <button type="button" disabled={ocupado} onClick={() => void acao("aviso")} className={`${botao} border-emerald-400/25 text-emerald-200`}>
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Copiar aviso
        </button>
        <button type="button" disabled={ocupado} onClick={() => void trocar()} className={`${botao} border-white/10 text-gray-400`}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Trocar link
        </button>
      </div>
      {mensagem && <p className="mt-1.5 text-emerald-300">{mensagem}</p>}
      {erro && <p className="mt-1.5 text-rose-300">{erro}</p>}
      {link && (
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1.5 h-8 w-full rounded-lg border border-white/10 bg-black/30 px-2 text-[11px] text-gray-300"
        />
      )}
    </div>
  );
}
