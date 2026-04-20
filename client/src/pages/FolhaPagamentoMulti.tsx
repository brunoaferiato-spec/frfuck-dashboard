import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export default function FolhaPagamentoMulti() {
  const [, setLocation] = useLocation();

  // 🔐 validação de login
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  if (meQuery.isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (!meQuery.data) {
    setLocation("/");
    return null;
  }

  // 🎯 estados da página
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [ano, setAno] = useState(2026);
  const [mes, setMes] = useState(new Date().getMonth() + 1);

  const lojaId = Number(selectedLoja);

  // 📡 buscar funcionários
  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId },
    {
      enabled: !!lojaId,
      retry: false,
    }
  );

  const funcionarios = funcionariosQuery.data || [];

  // 💰 cálculos simples (você pode evoluir depois)
  const totalLiquidez = 0;
  const totalComissao = 0;
  const totalBoleto = 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white px-6 py-6">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setLocation("/")}
          className="text-yellow-400 border border-yellow-400 px-4 py-2 rounded-md"
        >
          ← Voltar para Dashboard
        </button>

        <Button className="bg-yellow-400 text-black hover:bg-yellow-300">
          Exportar boletos
        </Button>
      </div>

      {/* TÍTULO */}
      <h1 className="text-3xl font-bold text-yellow-400 mb-2">
        Folha de Pagamento
      </h1>
      <p className="text-gray-400 mb-6">
        Dados centralizados no banco para todos os usuários
      </p>

      {/* FILTROS */}
      <div className="bg-gray-900 border border-yellow-500/30 rounded-xl p-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-gray-400 text-sm">Cidade</label>
          <select
            value={selectedLoja}
            onChange={(e) => setSelectedLoja(e.target.value)}
            className="w-full mt-2 bg-gray-800 border border-yellow-500/30 rounded-md px-3 py-2"
          >
            <option value="1">Joinville</option>
            <option value="2">Blumenau</option>
            <option value="3">São José</option>
          </select>
        </div>

        <div>
          <label className="text-gray-400 text-sm">Ano</label>
          <input
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="w-full mt-2 bg-gray-800 border border-yellow-500/30 rounded-md px-3 py-2"
          />
        </div>

        <div>
          <label className="text-gray-400 text-sm">Mês</label>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="w-full mt-2 bg-gray-800 border border-yellow-500/30 rounded-md px-3 py-2"
          >
            <option value={1}>Janeiro</option>
            <option value={2}>Fevereiro</option>
            <option value={3}>Março</option>
            <option value={4}>Abril</option>
            <option value={5}>Maio</option>
            <option value={6}>Junho</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-yellow-500/30 p-6 rounded-xl">
          <p className="text-gray-400 text-sm">Total Liquidez</p>
          <p className="text-2xl text-yellow-400 font-bold">
            R$ {totalLiquidez.toFixed(2)}
          </p>
        </div>

        <div className="bg-gray-900 border border-yellow-500/30 p-6 rounded-xl">
          <p className="text-gray-400 text-sm">
            Total Comissão / Premiação Auto
          </p>
          <p className="text-2xl text-yellow-400 font-bold">
            R$ {totalComissao.toFixed(2)}
          </p>
        </div>

        <div className="bg-gray-900 border border-yellow-500/30 p-6 rounded-xl">
          <p className="text-gray-400 text-sm">Total Boleto</p>
          <p className="text-2xl text-green-400 font-bold">
            R$ {totalBoleto.toFixed(2)}
          </p>
        </div>
      </div>

      {/* LISTA */}
      <div className="bg-gray-900 border border-yellow-500/30 rounded-xl p-6">
        {funcionariosQuery.isLoading && (
          <p className="text-gray-400">Carregando funcionários...</p>
        )}

        {!funcionariosQuery.isLoading && funcionarios.length === 0 && (
          <p className="text-gray-400 text-center">
            Nenhum funcionário ativo cadastrado para esta loja.
          </p>
        )}

        {funcionarios.length > 0 && (
          <div className="space-y-3">
            {funcionarios.map((f: any) => (
              <div
                key={f.id}
                className="border border-yellow-500/20 rounded-md p-4 flex justify-between"
              >
                <div>
                  <p className="text-yellow-400 font-semibold">{f.nome}</p>
                  <p className="text-gray-400 text-sm">{f.funcao}</p>
                </div>

                <div className="text-right">
                  <p className="text-gray-400 text-sm">Comissão</p>
                  <p className="text-yellow-400 font-bold">R$ 0,00</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}