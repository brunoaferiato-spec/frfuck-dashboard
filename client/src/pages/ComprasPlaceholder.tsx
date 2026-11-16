import { Boxes, Wrench } from "lucide-react";

export default function ComprasPlaceholder({ tipo }: { tipo: "pecas" | "insumos" }) {
  const pecas = tipo === "pecas";
  const Icon = pecas ? Wrench : Boxes;

  return (
    <main className="min-h-full bg-fr-050505 p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-fr-d4af37/20 bg-fr-0a0a0a p-6 sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fr-d4af37/20 bg-fr-d4af37/[0.06]">
            <Icon className="h-7 w-7 text-fri-f2d675" />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-fri-d4af37/60">
            COMPRAS
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {pecas ? "Peças" : "Insumos"}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-gray-500">
            Menu já preparado. Vamos construir este fluxo depois de fechar e validar Compras de Pneus.
          </p>
        </div>
      </div>
    </main>
  );
}
