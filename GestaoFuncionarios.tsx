import React from "react";
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Edit2, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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
  { id: "recepcionista", nome: "Recepcionista" },
  { id: "auxiliar_estoque", nome: "Auxiliar de Estoque" },
  { id: "lider_estoque", nome: "Líder de Estoque" },
  { id: "auxiliar_caixa", nome: "Auxiliar de Caixa" },
  { id: "administrativo", nome: "Administrativo" },
];

interface Funcionario {
  id: number;
  nome: string;
  funcao: string;
  lojaId: number;
  dataAdmissao: Date;
  status: "ativo" | "inativo";
}

interface Aviso {
  id: string;
  tipo: "experiencia" | "feedback" | "ferias1" | "ferias2" | "saida_ferias";
  funcionario: Funcionario;
  titulo: string;
  descricao: string;
  data: Date;
  diasAte: number;
  cor: string;
}

// Função para obter cor baseada em dias até o evento
const getAvisoCor = (diasAte: number): string => {
  if (diasAte > 7) return "bg-blue-500/20 text-blue-400";
  if (diasAte === 7) return "bg-blue-600/20 text-blue-300";
  if (diasAte === 6) return "bg-cyan-500/20 text-cyan-400";
  if (diasAte === 5) return "bg-cyan-600/20 text-cyan-300";
  if (diasAte === 4) return "bg-green-500/20 text-green-400";
  if (diasAte === 3) return "bg-yellow-500/20 text-yellow-400";
  if (diasAte === 2) return "bg-orange-500/20 text-orange-400";
  if (diasAte === 1) return "bg-red-500/20 text-red-400";
  return "bg-red-600/20 text-red-300";
};

const calcularAvisos = (funcionarios: Funcionario[]): Aviso[] => {
  const avisos: Aviso[] = [];
  const hoje = new Date();
  
  funcionarios.forEach(func => {
    const dataAdmissao = new Date(func.dataAdmissao);
    const data45 = new Date(dataAdmissao);
    data45.setDate(data45.getDate() + 45);
    const data90 = new Date(dataAdmissao);
    data90.setDate(data90.getDate() + 90);

    // Avisos de Experiência
    const diasAteExp = Math.ceil((data90.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diasAteExp >= 0 && diasAteExp <= 7) {
      const titulo = diasAteExp === 0 
        ? `${func.nome} - Experiência VENCE HOJE`
        : diasAteExp === 1
        ? `${func.nome} - Experiência vence AMANHÃ`
        : `${func.nome} - Experiência vence em ${diasAteExp} dias`;
      
      avisos.push({
        id: `exp-${func.id}-${diasAteExp}`,
        tipo: "experiencia",
        funcionario: func,
        titulo,
        descricao: `Faltam ${diasAteExp} dias para o fim do período de experiência`,
        data: data90,
        diasAte: diasAteExp,
        cor: getAvisoCor(diasAteExp),
      });
    }
  });
  
  return avisos;
};

export default function GestaoFuncionarios() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    funcao: "",
    lojaId: "1",
    dataAdmissao: "",
  });

  // Queries tRPC
  const { data: funcionarios = [], isLoading, refetch } = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: parseInt(selectedLoja) },
    { enabled: !!user }
  );

  // Mutations tRPC
  const createMutation = trpc.funcionarios.create.useMutation({
    onSuccess: () => {
      toast.success("Funcionário adicionado com sucesso!");
      setFormData({ nome: "", funcao: "", lojaId: "1", dataAdmissao: "" });
      setIsOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao adicionar funcionário: ${error.message}`);
    },
  });

  const funcionariosFiltrados = useMemo(() => {
    return funcionarios.filter((f: any) => {
      const statusMatch = mostrarInativos ? f.status === "inativo" : f.status !== "inativo";
      return statusMatch;
    });
  }, [funcionarios, mostrarInativos]);

  const handleAddFuncionario = async () => {
    if (!formData.nome || !formData.funcao || !formData.dataAdmissao) {
      toast.error("Preencha todos os campos");
      return;
    }

    try {
      await createMutation.mutateAsync({
        nome: formData.nome,
        funcao: formData.funcao as any,
        lojaId: parseInt(formData.lojaId),
        dataAdmissao: new Date(formData.dataAdmissao),
      });
    } catch (error) {
      console.error("Erro ao adicionar funcionário:", error);
    }
  };

  const handleDeleteFuncionario = (id: number) => {
    if (confirm("Tem certeza que deseja deletar este funcionário?")) {
      // TODO: Implementar delete mutation
      toast.info("Função de deletar ainda não implementada");
    }
  };

  const handleEditFuncionario = (funcionario: Funcionario) => {
    setFormData({
      nome: funcionario.nome,
      funcao: funcionario.funcao,
      lojaId: funcionario.lojaId.toString(),
      dataAdmissao: new Date(funcionario.dataAdmissao).toISOString().split("T")[0],
    });
    setEditingId(funcionario.id);
    setIsOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ativo":
        return "bg-green-500/20 text-green-400";
      case "inativo":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ativo":
        return "Ativo";
      case "inativo":
        return "Inativo";
      default:
        return status;
    }
  };

  const avisos = useMemo(() => calcularAvisos(funcionarios as Funcionario[]), [funcionarios]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Avisos */}
        {avisos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {avisos.map(aviso => (
              <Card key={aviso.id} className={`${aviso.cor} border-0`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{aviso.titulo}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm opacity-90">{aviso.descricao}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-primary hover:bg-primary/20"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-3xl font-bold text-primary">Gestão de Funcionários</h1>
            </div>
            <p className="text-gray-400">Admissão, demissão e histórico de funcionários</p>
            <div className="flex gap-4 mt-4">
              <Button
                variant={mostrarInativos ? "outline" : "default"}
                onClick={() => setMostrarInativos(false)}
                className={mostrarInativos ? "" : "bg-primary text-black hover:bg-yellow-300"}
              >
                Funcionários Ativos
              </Button>
              <Button
                variant={mostrarInativos ? "default" : "outline"}
                onClick={() => setMostrarInativos(true)}
                className={mostrarInativos ? "bg-red-600 hover:bg-red-700" : ""}
              >
                Funcionários Antigos/Inativos
              </Button>
            </div>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary text-black hover:bg-yellow-300 font-semibold"
                onClick={() => {
                  setEditingId(null);
                  setFormData({ nome: "", funcao: "", lojaId: "1", dataAdmissao: "" });
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Funcionário
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-primary/30 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-primary">
                  {editingId ? "Editar Funcionário" : "Adicionar Novo Funcionário"}
                </DialogTitle>
                <DialogDescription className="text-gray-400">
                  Preencha os dados do funcionário para {editingId ? "atualizar" : "adicionar"} ao sistema
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-300 mb-2 block">Nome Completo</Label>
                  <Input
                    placeholder="Ex: João Silva"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="bg-gray-800 border-primary/30 text-white"
                  />
                </div>

                <div>
                  <Label className="text-gray-300 mb-2 block">Função</Label>
                  <Select value={formData.funcao} onValueChange={(value) => setFormData({ ...formData, funcao: value })}>
                    <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                      <SelectValue placeholder="Selecionar função" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-primary/30">
                      {FUNCOES.map((funcao: any) => (
                        <SelectItem key={funcao.id} value={funcao.id} className="text-white">
                          {funcao.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300 mb-2 block">Loja</Label>
                  <Select value={formData.lojaId} onValueChange={(value) => setFormData({ ...formData, lojaId: value })}>
                    <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                      <SelectValue placeholder="Selecionar loja" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-primary/30">
                      {LOJAS.map(loja => (
                        <SelectItem key={loja.id} value={loja.id.toString()} className="text-white">
                          {loja.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300 mb-2 block">Data de Admissão</Label>
                  <Input
                    type="date"
                    value={formData.dataAdmissao}
                    onChange={(e) => setFormData({ ...formData, dataAdmissao: e.target.value })}
                    className="bg-gray-800 border-primary/30 text-white"
                  />
                </div>

                <Button
                  onClick={handleAddFuncionario}
                  disabled={createMutation.isPending}
                  className="w-full bg-primary text-black hover:bg-yellow-300 font-semibold"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : editingId ? (
                    "Atualizar"
                  ) : (
                    "Adicionar"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filtro por Loja */}
        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">Filtrar por Loja</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedLoja} onValueChange={setSelectedLoja}>
              <SelectTrigger className="w-full md:w-64 bg-gray-800 border-primary/30 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-primary/30">
                {LOJAS.map(loja => (
                  <SelectItem key={loja.id} value={loja.id.toString()} className="text-white">
                    {loja.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Tabela de Funcionários */}
        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">
              Funcionários - {LOJAS.find(l => l.id === parseInt(selectedLoja))?.nome}
            </CardTitle>
            <CardDescription className="text-gray-400">
              Total: {funcionariosFiltrados.length} funcionário(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-primary/30 hover:bg-gray-800">
                      <TableHead className="text-primary">Nome</TableHead>
                      <TableHead className="text-primary">Função</TableHead>
                      <TableHead className="text-primary">Data Admissão</TableHead>
                      <TableHead className="text-primary">Status</TableHead>
                      <TableHead className="text-primary text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {funcionariosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                          Nenhum funcionário cadastrado nesta loja
                        </TableCell>
                      </TableRow>
                    ) : (
                      funcionariosFiltrados.map((func: any) => (
                        <TableRow key={func.id} className="border-primary/20 hover:bg-gray-800">
                          <TableCell className="text-white font-semibold">{func.nome}</TableCell>
                          <TableCell className="text-gray-300">
                            {FUNCOES.find(f => f.id === func.funcao)?.nome}
                          </TableCell>
                          <TableCell className="text-gray-300">
                            {new Date(func.dataAdmissao).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(func.status)}`}>
                              {getStatusLabel(func.status)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {!mostrarInativos && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditFuncionario(func)}
                                  className="text-blue-400 hover:bg-blue-500/20"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteFuncionario(func.id)}
                                  className="text-red-400 hover:bg-red-500/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
