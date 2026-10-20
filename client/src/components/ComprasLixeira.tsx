import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

// Lixeira de Compras: planejamentos excluídos, com quem excluiu e quando, e o botão Restaurar.
export type ItemLixeira = {
  id: number;
  lojaNome: string;
  status: string;
  totalItens: number;
  createdAt: string | Date;
  excluidoEm: string | Date | null;
  excluidoPorNome: string;
};

function dataHora(v: string | Date | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

const STATUS: Record<string, string> = { pedido_salvo: "Pedido salvo", cotacao: "Em cotação", planejamento: "Planejamento" };

export default function ComprasLixeira({
  itens,
  carregando,
  restaurando,
  onRestaurar,
  rotuloItens = "itens",
}: {
  itens: ItemLixeira[];
  carregando?: boolean;
  restaurando?: boolean;
  onRestaurar: (id: number) => void;
  rotuloItens?: string;
}) {
  const [aberta, setAberta] = useState(false);

  return (
    <div className="mt-6 border-t border-white/[0.06] pt-4">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black text-gray-400 hover:border-rose-400/30 hover:text-rose-200"
      >
        <Trash2 className="h-4 w-4" />
        {aberta ? "Fechar lixeira" : `Lixeira${itens.length ? ` (${itens.length})` : ""}`}
      </button>

      {aberta && (
        <div className="mt-3">
          <p className="text-xs text-gray-600">Planejamentos excluídos ficam guardados aqui. Restaurar devolve o planejamento ao Histórico, com cotações e pedidos.</p>
          {carregando ? (
            <p className="mt-3 text-sm text-gray-500">Carregando...</p>
          ) : itens.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-white/[0.06] p-6 text-center text-sm text-gray-500">A lixeira está vazia.</div>
          ) : (
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {itens.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/15 bg-rose-400/[0.03] px-4 py-3">
                  <div>
                    <p className="font-black text-white">
                      Planejamento #{p.id} <span className="ml-1 text-xs font-bold text-gray-500">{p.lojaNome || "Sem cidade"}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {p.totalItens} {rotuloItens} • {STATUS[p.status] || p.status} • criado em {dataHora(p.createdAt)}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold text-rose-300/80">
                      Excluído por {p.excluidoPorNome || "—"} em {dataHora(p.excluidoEm)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={restaurando}
                    onClick={() => onRestaurar(p.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-400/25 px-3 text-xs font-black text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
