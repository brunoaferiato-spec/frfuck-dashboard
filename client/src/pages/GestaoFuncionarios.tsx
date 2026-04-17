import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
];

const FUNCOES = [
  { id: "mecanico", nome: "Mecânico" },
  { id: "vendedor", nome: "Vendedor" },
  { id: "consultor_vendas", nome: "Consultor de Vendas" },
  { id: "alinhador", nome: "Alinhador" },
  { id: "aux_alinhador", nome: "Aux. Alinhador" },
  { id: "recepcionista", nome: "Recepcionista" },
  { id: "auxiliar_estoque", nome: "Auxiliar de Estoque" },
  { id: "lider_estoque", nome: "Líder de Estoque" },
  { id: "auxiliar_caixa", nome: "Auxiliar de Caixa" },
  { id: "administrativo", nome: "Administrativo" },
  { id: "gerente", nome: "Gerente" },
  { id: "supervisor", nome: "Supervisor" },
] as const;

type FuncaoId = (typeof FUNCOES)[number]["id"];
type TipoMeta = "meta1" | "meta2" | "";

export default function GestaoFuncionarios() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [selectedLoja, setSelectedLoja] = useState("1");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    cpf: "",
    pix: "",
    funcao: "mecanico" as FuncaoId,
    tipoMeta: "" as TipoMeta,
    dataAdmissao: new Date().toISOString().split("T")[0],
  });

  const lojaId = Number(selectedLoja);

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId },
    {
      enabled: !!lojaId,
      retry: false,
    }
  );

  const createFuncionario = trpc.funcionarios.create.useMutation({
    onSuccess: async () => {
      await utils.funcionarios.listByLoja.invalidate({ lojaId });
      setFormData({
        nome: "",
        cpf: "",
        pix: "",
        funcao: "mecanico",
        tipoMeta: "",
        dataAdmissao: new Date().toISOString().split("T")[0],
      });
      setIsOpen(false);
    },
  });

  const lojaNome = useMemo(() => {
    return LOJAS.find((l) => l.id === lojaId)?.nome ?? "Loja";
  }, [lojaId]);

  const handleAddFuncionario = async () => {
    if (!formData.nome.trim()) {
      alert("Preencha o nome do funcionário");
      return;
    }

    try {
      await createFuncionario.mutateAsync({
        lojaId,
        nome: formData.nome.trim(),
        cpf: formData.cpf.trim() || null,
        pix: formData.pix.trim() || null,
        funcao: formData.funcao,
        tipoMeta:
          formData.funcao === "consultor_vendas" && formData.tipoMeta
            ? (formData.tipoMeta as "meta1" | "meta2")
            : null,
        dataAdmissao: new Date(`${formData.dataAdmissao}T00:00:00`),
      });
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erro ao salvar funcionário");
    }
  };

  const funcionarios = funcionariosQuery.data ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-8 flex items-center gap-4">
          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Voltar
          </Button>

          <div>
            <h1 className="mb-2 text-3xl font-bold text-yellow-400">
              Gestão de Funcionários
            </h1>
            <p className="text-gray-400">
              Admissão, demissão e histórico de funcionários
            </p>
          </div>
        </div>

        <Card className="border-yellow-500/30 bg-gray-900 text-white">
          <CardHeader>
            <CardTitle className="text-yellow-400">Seleção de Loja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className="mb-2 block text-sm text-gray-300">Loja</label>
                <select
                  value={selectedLoja}
                  onChange={(e) => setSelectedLoja(e.target.value)}
                  className="w-full rounded-md border border-yellow-500/30 bg-gray-800 px-3 py-2 text-white outline-none"
                >
                  {LOJAS.map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                onClick={() => setIsOpen(true)}
                className="bg-yellow-400 text-black hover:bg-yellow-300"
              >
                + Novo Funcionário
              </Button>
            </div>
          </CardContent>
        </Card>

        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl rounded-lg border border-yellow-500/30 bg-gray-950 p-6">
              <h3 className="mb-4 text-lg font-semibold text-yellow-400">
                Novo Funcionário
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: João Silva"
                    value={formData.nome}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, nome: e.target.value }))
                    }
                    className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">CPF</label>
                  <input
                    type="text"
                    placeholder="Somente números ou formatado"
                    value={formData.cpf}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, cpf: e.target.value }))
                    }
                    className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">PIX</label>
                  <input
                    type="text"
                    placeholder="Chave PIX"
                    value={formData.pix}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, pix: e.target.value }))
                    }
                    className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-2 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">Função</label>
                  <select
                    value={formData.funcao}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        funcao: e.target.value as FuncaoId,
                        tipoMeta:
                          e.target.value === "consultor_vendas" ? prev.tipoMeta : "",
                      }))
                    }
                    className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-2 text-white outline-none"
                  >
                    {FUNCOES.map((funcao) => (
                      <option key={funcao.id} value={funcao.id}>
                        {funcao.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.funcao === "consultor_vendas" && (
                  <div>
                    <label className="mb-2 block text-sm text-gray-300">
                      Tipo de Meta / Comissão
                    </label>
                    <select
                      value={formData.tipoMeta}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          tipoMeta: e.target.value as TipoMeta,
                        }))
                      }
                      className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-2 text-white outline-none"
                    >
                      <option value="">Selecione</option>
                      <option value="meta1">Meta 1</option>
                      <option value="meta2">Meta 2</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Data de Admissão
                  </label>
                  <input
                    type="date"
                    value={formData.dataAdmissao}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dataAdmissao: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-2 text-white outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  onClick={handleAddFuncionario}
                  disabled={createFuncionario.isPending}
                  className="flex-1 bg-yellow-400 text-black hover:bg-yellow-300"
                >
                  {createFuncionario.isPending ? "Salvando..." : "Salvar"}
                </Button>

                <Button
                  onClick={() => setIsOpen(false)}
                  variant="outline"
                  className="flex-1 border-yellow-500/30 bg-transparent text-yellow-400 hover:bg-yellow-500/10"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        <Card className="border-yellow-500/30 bg-gray-900 text-white">
          <CardHeader>
            <CardTitle className="text-yellow-400">
              Funcionários - {lojaNome}
            </CardTitle>
            <CardDescription className="text-gray-400">
              Total: {funcionarios.length} funcionário(s)
            </CardDescription>
          </CardHeader>

          <CardContent>
            {funcionariosQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
              </div>
            ) : funcionariosQuery.error ? (
              <div className="py-8 text-center text-red-400">
                {funcionariosQuery.error.message}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-yellow-500/30">
                      <th className="p-3 text-left font-semibold text-yellow-400">Nome</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">CPF</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">PIX</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Função</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Tipo Meta</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Data Admissão</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionarios.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-400">
                          Nenhum funcionário registrado
                        </td>
                      </tr>
                    ) : (
                      funcionarios.map((func: any) => (
                        <tr key={func.id} className="border-b border-yellow-500/20">
                          <td className="p-3 font-medium text-white">{func.nome}</td>
                          <td className="p-3 text-gray-300">{func.cpf || "-"}</td>
                          <td className="p-3 text-gray-300">{func.pix || "-"}</td>
                          <td className="p-3 text-gray-300">
                            {FUNCOES.find((f) => f.id === func.funcao)?.nome ?? func.funcao}
                          </td>
                          <td className="p-3 text-gray-300">{func.tipoMeta || "-"}</td>
                          <td className="p-3 text-gray-300">
                            {func.dataAdmissao
                              ? new Date(func.dataAdmissao).toLocaleDateString("pt-BR")
                              : "-"}
                          </td>
                          <td className="p-3">
                            <span
                              className={
                                func.status === "ativo"
                                  ? "rounded px-2 py-1 text-xs text-green-400 bg-green-500/10"
                                  : "rounded px-2 py-1 text-xs text-red-400 bg-red-500/10"
                              }
                            >
                              {func.status === "ativo" ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}