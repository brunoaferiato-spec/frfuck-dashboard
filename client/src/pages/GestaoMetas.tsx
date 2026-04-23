import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import {
  getMetas,
  saveMetas,
  getFuncionarios,
  type Meta,
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
  { id: "vendedor", nome: "Vendedor" },
  { id: "mecanico", nome: "Mecânico" },
  { id: "consultor_vendas", nome: "Consultor de Vendas" },
  { id: "recepcionista", nome: "Recepcionista" },
  { id: "alinhador", nome: "Alinhador" },
  { id: "aux_alinhador", nome: "Aux. Alinhador" },
  { id: "vendedor_gerente", nome: "Vendedor Gerente" },
  { id: "gerente", nome: "Gerente" },
  { id: "supervisor", nome: "Supervisor" },
];

type TipoMetaForm = TipoMeta | "padrao" | "funcionario_especifico";

type MetaUI = Meta & {
  dataAtualizacao?: string;
};

export default function GestaoMetas() {
  const [, navigate] = useLocation();

  const [metas, setMetas] = useState<MetaUI[]>(getMetas() as MetaUI[]);
  const [selectedLoja, setSelectedLoja] = useState("1");

  const [formData, setFormData] = useState({
    cidade: "1",
    funcao: "vendedor",
    tipoMeta: "padrao" as TipoMetaForm,
    funcionario: "",
    regra: "",
  });

  const funcionarios = useMemo(() => getFuncionarios(), []);

  const funcionariosDaCidade = useMemo(() => {
    return funcionarios.filter(
      (f) => f.loja_id.toString() === formData.cidade && f.status !== "inativo"
    );
  }, [funcionarios, formData.cidade]);

  const metasFiltradas = useMemo(() => {
    return metas.filter((m) => String(m.cidade) === selectedLoja);
  }, [metas, selectedLoja]);

  const updateMetas = (novas: MetaUI[]) => {
    setMetas(novas);
    saveMetas(novas as Meta[]);
  };

  const resetForm = () => {
    setFormData({
      cidade: "1",
      funcao: "vendedor",
      tipoMeta: "padrao",
      funcionario: "",
      regra: "",
    });
  };

  const handleSalvarMeta = () => {
    if (!formData.regra.trim()) {
      alert("Preencha a regra da meta");
      return;
    }

    if (
      formData.tipoMeta === "funcionario_especifico" &&
      !formData.funcionario
    ) {
      alert("Selecione o funcionário específico");
      return;
    }

    const novaMeta: MetaUI = {
      id: Date.now().toString(),
      cidade: formData.cidade,
      funcao: formData.funcao,
      tipoMeta:
        formData.tipoMeta === "padrao" ||
        formData.tipoMeta === "funcionario_especifico"
          ? undefined
          : formData.tipoMeta,
      funcionario:
        formData.tipoMeta === "funcionario_especifico"
          ? formData.funcionario
          : undefined,
      funcionarioNome:
        formData.tipoMeta === "funcionario_especifico"
          ? formData.funcionario
          : undefined,
      regra: formData.regra,
      dataAtualizacao: new Date().toISOString().split("T")[0],
    };

    updateMetas([...metas, novaMeta]);
    resetForm();
  };

  const handleDeleteMeta = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta meta?")) {
      updateMetas(metas.filter((m) => String(m.id) !== id));
    }
  };

  const getTipoMetaLabel = (tipo?: TipoMetaForm) => {
    if (!tipo) return "Padrão";
    if (tipo === "padrao") return "Padrão";
    if (tipo === "meta1") return "Meta 1";
    if (tipo === "meta2") return "Meta 2";
    if (tipo === "funcionario_especifico") return "Funcionário específico";
    return tipo;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="text-primary hover:bg-primary/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="mb-2 text-3xl font-bold text-primary">
              Gestão de Metas
            </h1>
            <p className="text-gray-400">
              Cadastro de metas por cidade, função e funcionário
            </p>
          </div>
        </div>

        <Card className="border-primary/30 bg-gray-900">
          <CardHeader>
            <CardTitle className="text-primary">Adicionar Meta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block text-gray-300">Cidade</Label>
              <Select
                value={formData.cidade}
                onValueChange={(value) =>
                  setFormData({ ...formData, cidade: value, funcionario: "" })
                }
              >
                <SelectTrigger className="border-primary/30 bg-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-primary/30 bg-gray-900">
                  {LOJAS.map((loja) => (
                    <SelectItem
                      key={loja.id}
                      value={loja.id.toString()}
                      className="text-white"
                    >
                      {loja.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block text-gray-300">Função</Label>
              <Select
                value={formData.funcao}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    funcao: value,
                    tipoMeta:
                      value === "consultor_vendas" ? formData.tipoMeta : "padrao",
                    funcionario: "",
                  })
                }
              >
                <SelectTrigger className="border-primary/30 bg-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-primary/30 bg-gray-900">
                  {FUNCOES.map((funcao) => (
                    <SelectItem
                      key={funcao.id}
                      value={funcao.id}
                      className="text-white"
                    >
                      {funcao.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block text-gray-300">Tipo de Meta</Label>
              <Select
                value={formData.tipoMeta}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    tipoMeta: value as TipoMetaForm,
                    funcionario:
                      value === "funcionario_especifico"
                        ? formData.funcionario
                        : "",
                  })
                }
              >
                <SelectTrigger className="border-primary/30 bg-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-primary/30 bg-gray-900">
                  {formData.funcao === "consultor_vendas" ? (
                    <>
                      <SelectItem value="meta1" className="text-white">
                        Meta 1 (Antiga)
                      </SelectItem>
                      <SelectItem value="meta2" className="text-white">
                        Meta 2 (Nova)
                      </SelectItem>
                      <SelectItem
                        value="funcionario_especifico"
                        className="text-white"
                      >
                        Funcionário específico
                      </SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="padrao" className="text-white">
                        Padrão
                      </SelectItem>
                      <SelectItem
                        value="funcionario_especifico"
                        className="text-white"
                      >
                        Funcionário específico
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {formData.tipoMeta === "funcionario_especifico" && (
              <div>
                <Label className="mb-2 block text-gray-300">Funcionário</Label>
                <Select
                  value={formData.funcionario}
                  onValueChange={(value) =>
                    setFormData({ ...formData, funcionario: value })
                  }
                >
                  <SelectTrigger className="border-primary/30 bg-gray-800 text-white">
                    <SelectValue placeholder="Selecione o funcionário" />
                  </SelectTrigger>
                  <SelectContent className="border-primary/30 bg-gray-900">
                    {funcionariosDaCidade
                      .filter((f) => f.funcao === formData.funcao)
                      .map((func) => (
                        <SelectItem
                          key={func.id}
                          value={func.nome}
                          className="text-white"
                        >
                          {func.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="mb-2 block text-gray-300">Regra da Meta</Label>
              <Input
                placeholder="Ex: até 33.000 = 5% | 33.000 a 39.999 = 6%"
                value={formData.regra}
                onChange={(e) =>
                  setFormData({ ...formData, regra: e.target.value })
                }
                className="border-primary/30 bg-gray-800 text-white"
              />
            </div>

            <Button
              onClick={handleSalvarMeta}
              className="w-full bg-primary font-semibold text-black hover:bg-yellow-300"
            >
              Salvar Meta
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-gray-900">
          <CardHeader>
            <CardTitle className="text-primary">Visualizar Metas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Label className="mb-2 block text-gray-300">Cidade</Label>
              <Select value={selectedLoja} onValueChange={setSelectedLoja}>
                <SelectTrigger className="w-full border-primary/30 bg-gray-800 text-white md:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-primary/30 bg-gray-900">
                  {LOJAS.map((loja) => (
                    <SelectItem
                      key={loja.id}
                      value={loja.id.toString()}
                      className="text-white"
                    >
                      {loja.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-primary/30 hover:bg-gray-800">
                    <TableHead className="text-primary">Função</TableHead>
                    <TableHead className="text-primary">Tipo</TableHead>
                    <TableHead className="text-primary">Funcionário</TableHead>
                    <TableHead className="text-primary">Regra</TableHead>
                    <TableHead className="text-primary">Atualização</TableHead>
                    <TableHead className="text-right text-primary">
                      Ações
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metasFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-gray-400"
                      >
                        Nenhuma meta cadastrada para esta cidade
                      </TableCell>
                    </TableRow>
                  ) : (
                    metasFiltradas.map((meta) => (
                      <TableRow
                        key={String(meta.id)}
                        className="border-primary/20 hover:bg-gray-800"
                      >
                        <TableCell className="font-semibold text-white">
                          {FUNCOES.find((f) => f.id === meta.funcao)?.nome ||
                            meta.funcao}
                        </TableCell>
                        <TableCell className="text-yellow-300">
                          {getTipoMetaLabel(
                            meta.funcionario || meta.funcionarioNome
                              ? "funcionario_especifico"
                              : (meta.tipoMeta as TipoMetaForm | undefined) ??
                                  "padrao"
                          )}
                        </TableCell>
                        <TableCell className="text-gray-300">
                          {meta.funcionario || meta.funcionarioNome || "-"}
                        </TableCell>
                        <TableCell className="text-gray-300">
                          {meta.regra}
                        </TableCell>
                        <TableCell className="text-gray-300">
                          {meta.dataAtualizacao
                            ? new Date(meta.dataAtualizacao).toLocaleDateString(
                                "pt-BR"
                              )
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteMeta(String(meta.id))}
                            className="text-red-400 hover:bg-red-500/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}