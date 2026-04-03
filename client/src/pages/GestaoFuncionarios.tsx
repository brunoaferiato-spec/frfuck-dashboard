import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFuncionarios,
  saveFuncionarios,
  type Funcionario,
  type TipoMeta,
} from "@/lib/payrollStore";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "Contrato PJ" },
];

const FUNCOES = [
  { value: "gerente", label: "Gerente" },
  { value: "vendedor", label: "Vendedor" },
  { value: "mecanico", label: "Mecânico" },
  { value: "aux_mecanico", label: "Auxiliar de Mecânico" },
  { value: "consultor_vendas", label: "Consultor de Vendas" },
  { value: "alinhador", label: "Alinhador" },
  { value: "aux_alinhador", label: "Auxiliar de Alinhador" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "caixa_lider", label: "Caixa Líder" },
  { value: "caixa", label: "Caixa" },
  { value: "estoquista_lider", label: "Estoquista Líder" },
  { value: "estoquista", label: "Estoquista" },
  { value: "aux_limpeza", label: "Auxiliar de Limpeza" },
  { value: "administrativo", label: "Administrativo" },
  { value: "supervisor", label: "Supervisor" },
];

function generateId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

export default function GestaoFuncionarios() {
  const [, setLocation] = useLocation();

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>(
    getFuncionarios()
  );
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [modalOpen, setModalOpen] = useState(false);

  const [novoFuncionario, setNovoFuncionario] = useState({
    cidade: "1",
    funcao: "",
    nome: "",
    cpf: "",
    pix: "",
    dataNascimento: "",
    dataAdmissao: "",
    tipoMeta: "" as TipoMeta | "",
  });

  const lojaId = Number(selectedLoja);

  const funcionariosFiltrados = useMemo(() => {
    return funcionarios.filter(
      (f) => f.loja_id === lojaId && f.status !== "inativo"
    );
  }, [funcionarios, lojaId]);

  function handleAddFuncionario() {
    if (
      !novoFuncionario.cidade ||
      !novoFuncionario.funcao ||
      !novoFuncionario.nome.trim() ||
      !novoFuncionario.cpf.trim() ||
      !novoFuncionario.dataNascimento ||
      !novoFuncionario.dataAdmissao
    ) {
      return;
    }

    const funcionario: Funcionario = {
      id: generateId(),
      nome: novoFuncionario.nome.trim(),
      cpf: novoFuncionario.cpf.trim(),
      pix: novoFuncionario.pix.trim(),
      dataNascimento: novoFuncionario.dataNascimento,
      funcao: novoFuncionario.funcao,
      loja_id: Number(novoFuncionario.cidade),
      dataAdmissao: novoFuncionario.dataAdmissao,
      status: "ativo",
      tipoMeta:
        novoFuncionario.funcao === "consultor_vendas"
          ? (novoFuncionario.tipoMeta || "meta1")
          : "",
      dataExperiencia45: "",
      dataExperiencia90: "",
      dataDemissao: "",
      debitoPendente: 0,
      dataFeedbackProxima: "",
      dataFeriasInicio: "",
      dataFeriasFim: "",
      dataFerias2Inicio: "",
      dataFerias2Fim: "",
    };

    const next = [...funcionarios, funcionario];
    setFuncionarios(next);
    saveFuncionarios(next);

    setNovoFuncionario({
      cidade: selectedLoja,
      funcao: "",
      nome: "",
      cpf: "",
      pix: "",
      dataNascimento: "",
      dataAdmissao: "",
      tipoMeta: "",
    });

    setModalOpen(false);
  }

  function handleDeleteFuncionario(id: number) {
    const next = funcionarios.map((f) =>
      f.id === id ? { ...f, status: "inativo" as const } : f
    );
    setFuncionarios(next);
    saveFuncionarios(next);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black p-6 text-white">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/")}
                className="text-primary hover:bg-primary/20"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-3xl font-bold text-primary">
                Gestão de Funcionários
              </h1>
            </div>
            <p className="text-gray-400">
              Cadastre e gerencie os funcionários por cidade
            </p>
          </div>

          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-black hover:bg-yellow-300 font-semibold">
                <UserPlus className="w-4 h-4 mr-2" />
                Adicionar Funcionário
              </Button>
            </DialogTrigger>

            <DialogContent className="bg-gray-950 border-primary/30 text-white max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-primary">
                  Adicionar Funcionário
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  Preencha os dados do funcionário
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Cidade</Label>
                  <Select
                    value={novoFuncionario.cidade}
                    onValueChange={(value) =>
                      setNovoFuncionario((prev) => ({
                        ...prev,
                        cidade: value,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-primary/30">
                      {LOJAS.map((loja) => (
                        <SelectItem
                          key={loja.id}
                          value={String(loja.id)}
                          className="text-white"
                        >
                          {loja.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">Função</Label>
                  <Select
                    value={novoFuncionario.funcao}
                    onValueChange={(value) =>
                      setNovoFuncionario((prev) => ({
                        ...prev,
                        funcao: value,
                        tipoMeta: value === "consultor_vendas" ? "meta1" : "",
                      }))
                    }
                  >
                    <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                      <SelectValue placeholder="Selecionar função" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-primary/30">
                      {FUNCOES.map((funcao) => (
                        <SelectItem
                          key={funcao.value}
                          value={funcao.value}
                          className="text-white"
                        >
                          {funcao.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-gray-300">Nome</Label>
                  <Input
                    value={novoFuncionario.nome}
                    onChange={(e) =>
                      setNovoFuncionario((prev) => ({
                        ...prev,
                        nome: e.target.value,
                      }))
                    }
                    className="bg-gray-800 border-primary/30 text-white"
                    placeholder="Nome completo"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">CPF</Label>
                  <Input
                    value={novoFuncionario.cpf}
                    onChange={(e) =>
                      setNovoFuncionario((prev) => ({
                        ...prev,
                        cpf: e.target.value,
                      }))
                    }
                    className="bg-gray-800 border-primary/30 text-white"
                    placeholder="000.000.000-00"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">PIX</Label>
                  <Input
                    value={novoFuncionario.pix}
                    onChange={(e) =>
                      setNovoFuncionario((prev) => ({
                        ...prev,
                        pix: e.target.value,
                      }))
                    }
                    className="bg-gray-800 border-primary/30 text-white"
                    placeholder="CPF, e-mail, telefone ou chave aleatória"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">Data de Nascimento</Label>
                  <Input
                    type="date"
                    value={novoFuncionario.dataNascimento}
                    onChange={(e) =>
                      setNovoFuncionario((prev) => ({
                        ...prev,
                        dataNascimento: e.target.value,
                      }))
                    }
                    className="bg-gray-800 border-primary/30 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-300">Data de Admissão</Label>
                  <Input
                    type="date"
                    value={novoFuncionario.dataAdmissao}
                    onChange={(e) =>
                      setNovoFuncionario((prev) => ({
                        ...prev,
                        dataAdmissao: e.target.value,
                      }))
                    }
                    className="bg-gray-800 border-primary/30 text-white"
                  />
                </div>

                {novoFuncionario.funcao === "consultor_vendas" && (
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-gray-300">Tipo de Meta</Label>
                    <Select
                      value={novoFuncionario.tipoMeta || "meta1"}
                      onValueChange={(value: TipoMeta) =>
                        setNovoFuncionario((prev) => ({
                          ...prev,
                          tipoMeta: value,
                        }))
                      }
                    >
                      <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-primary/30">
                        <SelectItem value="meta1" className="text-white">
                          Meta 1 (antiga)
                        </SelectItem>
                        <SelectItem value="meta2" className="text-white">
                          Meta 2 (nova)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  className="bg-primary text-black hover:bg-yellow-300 w-full font-semibold"
                  onClick={handleAddFuncionario}
                >
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">Funcionários</CardTitle>
            <CardDescription className="text-gray-400">
              Filtre por cidade e visualize os funcionários cadastrados
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <Label className="text-gray-300 mb-2 block">Cidade</Label>
              <Select value={selectedLoja} onValueChange={setSelectedLoja}>
                <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-primary/30">
                  {LOJAS.map((loja) => (
                    <SelectItem
                      key={loja.id}
                      value={String(loja.id)}
                      className="text-white"
                    >
                      {loja.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead>
                  <tr className="border-b border-primary/30 text-primary">
                    <th className="text-left p-3">Nome</th>
                    <th className="text-left p-3">CPF</th>
                    <th className="text-left p-3">PIX</th>
                    <th className="text-left p-3">Função</th>
                    <th className="text-left p-3">Nascimento</th>
                    <th className="text-left p-3">Admissão</th>
                    <th className="text-left p-3">Meta</th>
                    <th className="text-right p-3">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {funcionariosFiltrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-6 text-center text-gray-400"
                      >
                        Nenhum funcionário cadastrado para esta cidade.
                      </td>
                    </tr>
                  ) : (
                    funcionariosFiltrados.map((funcionario) => (
                      <tr
                        key={funcionario.id}
                        className="border-b border-primary/10 hover:bg-gray-800"
                      >
                        <td className="p-3 text-white font-medium">
                          {funcionario.nome}
                        </td>
                        <td className="p-3 text-gray-300">{funcionario.cpf}</td>
                        <td className="p-3 text-gray-300">
                          {funcionario.pix || "-"}
                        </td>
                        <td className="p-3 text-gray-300">
                          {FUNCOES.find((f) => f.value === funcionario.funcao)
                            ?.label || funcionario.funcao}
                        </td>
                        <td className="p-3 text-gray-300">
                          {funcionario.dataNascimento || "-"}
                        </td>
                        <td className="p-3 text-gray-300">
                          {funcionario.dataAdmissao || "-"}
                        </td>
                        <td className="p-3 text-gray-300">
                          {funcionario.funcao === "consultor_vendas"
                            ? funcionario.tipoMeta === "meta2"
                              ? "Meta 2"
                              : "Meta 1"
                            : "-"}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            className="bg-red-600 hover:bg-red-500 text-white"
                            size="sm"
                            onClick={() => handleDeleteFuncionario(funcionario.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Excluir
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}