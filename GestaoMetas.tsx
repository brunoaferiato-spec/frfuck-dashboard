import React from "react";
import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, ArrowLeft } from "lucide-react";
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
];

interface MetaFaixa {
  liquidezMinima: number;
  percentualComissao: number;
}

export default function GestaoMetas() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [selectedFuncao, setSelectedFuncao] = useState("mecanico");
  const [ano] = useState(2026);
  const [mes] = useState(3);
  const [isOpen, setIsOpen] = useState(false);
  const [novasFaixas, setNovasFaixas] = useState<MetaFaixa[]>([
    { liquidezMinima: 0, percentualComissao: 10 },
    { liquidezMinima: 8000, percentualComissao: 12 },
    { liquidezMinima: 10000, percentualComissao: 15 },
    { liquidezMinima: 20000, percentualComissao: 17 },
  ]);

  // Query para obter metas
  const { data: metas = [], isLoading, refetch } = trpc.metas.listByLojaAnoMes.useQuery(
    { lojaId: parseInt(selectedLoja), ano, mes },
    { enabled: !!user }
  );

  // Mutation para criar/atualizar meta
  const createMutation = trpc.metas.create.useMutation({
    onSuccess: () => {
      toast.success("Meta salva com sucesso!");
      setNovasFaixas([
        { liquidezMinima: 0, percentualComissao: 10 },
        { liquidezMinima: 8000, percentualComissao: 12 },
        { liquidezMinima: 10000, percentualComissao: 15 },
        { liquidezMinima: 20000, percentualComissao: 17 },
      ]);
      setIsOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar meta: ${error.message}`);
    },
  });

  const metaSelecionada = useMemo(() => {
    return metas.find(
      (m: any) => m.funcao === selectedFuncao && m.lojaId === parseInt(selectedLoja)
    );
  }, [metas, selectedFuncao, selectedLoja]);

  const handleAddFaixa = async () => {
    if (novasFaixas.some(f => f.liquidezMinima === undefined || f.percentualComissao === undefined)) {
      toast.error("Preencha todos os campos das faixas");
      return;
    }

    try {
      await createMutation.mutateAsync({
        lojaId: parseInt(selectedLoja),
        funcao: selectedFuncao,
        ano,
        mes,
        faixas: novasFaixas,
        aplicacaoEm: "imediata",
      });
    } catch (error) {
      console.error("Erro ao adicionar meta:", error);
    }
  };

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
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="hover:bg-primary/20 text-primary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">Gestão de Metas</h1>
            <p className="text-gray-400">Configuração de comissões e metas por função</p>
          </div>
        </div>

        {/* Filtros */}
        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">Seleção de Loja e Função</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-300 mb-2 block">Loja</Label>
                <Select value={selectedLoja} onValueChange={setSelectedLoja}>
                  <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
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
              </div>

              <div>
                <Label className="text-gray-300 mb-2 block">Função</Label>
                <Select value={selectedFuncao} onValueChange={setSelectedFuncao}>
                  <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-primary/30">
                    {FUNCOES.map(funcao => (
                      <SelectItem key={funcao.id} value={funcao.id} className="text-white">
                        {funcao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                  <Button
                    onClick={() => setIsOpen(true)}
                    className="w-full bg-primary text-black hover:bg-yellow-300 font-semibold"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Faixa
                  </Button>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dialog para adicionar faixa */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="bg-gray-900 border-primary/30 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-primary">Adicionar Faixa de Comissão</DialogTitle>
              <DialogDescription className="text-gray-400">
                Adicione uma nova faixa de comissão para {FUNCOES.find(f => f.id === selectedFuncao)?.nome}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-gray-300 font-semibold block">Faixas de Comissão</Label>
                {novasFaixas.map((faixa, index) => (
                  <div key={index} className="grid grid-cols-2 gap-2 p-3 bg-gray-800 rounded border border-primary/20">
                    <div>
                      <Label className="text-gray-400 text-xs mb-1 block">Liquidez Mínima (R$)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={faixa.liquidezMinima}
                        onChange={(e) => {
                          const newFaixas = [...novasFaixas];
                          newFaixas[index].liquidezMinima = parseFloat(e.target.value) || 0;
                          setNovasFaixas(newFaixas);
                        }}
                        className="bg-gray-700 border-primary/30 text-white text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs mb-1 block">Comissão (%)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        step="0.1"
                        value={faixa.percentualComissao}
                        onChange={(e) => {
                          const newFaixas = [...novasFaixas];
                          newFaixas[index].percentualComissao = parseFloat(e.target.value) || 0;
                          setNovasFaixas(newFaixas);
                        }}
                        className="bg-gray-700 border-primary/30 text-white text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => {
                  setNovasFaixas([...novasFaixas, { liquidezMinima: 0, percentualComissao: 0 }]);
                }}
                variant="outline"
                className="w-full border-primary/30 text-primary hover:bg-primary/10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Faixa
              </Button>

              <Button
                onClick={handleAddFaixa}
                disabled={createMutation.isPending}
                className="w-full bg-primary text-black hover:bg-yellow-300 font-semibold"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Meta"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tabela de Metas */}
        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">
              Metas - {LOJAS.find(l => l.id === parseInt(selectedLoja))?.nome}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {ano}/{String(mes).padStart(2, '0')} - Total: {metas.length} meta(s)
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
                      <TableHead className="text-primary">Função</TableHead>
                      <TableHead className="text-primary">Faixas de Comissão</TableHead>
                      <TableHead className="text-primary">Data Atualização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-gray-400 py-8">
                          Nenhuma meta registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      metas.map((meta: any) => {
                        const faixas = typeof meta.faixas === 'string' ? JSON.parse(meta.faixas) : meta.faixas;
                        return (
                          <TableRow key={meta.id} className="border-primary/20 hover:bg-gray-800">
                            <TableCell className="text-white font-semibold">
                              {FUNCOES.find(f => f.id === meta.funcao)?.nome || meta.funcao}
                            </TableCell>
                            <TableCell className="text-gray-300">
                              {Array.isArray(faixas) && faixas.map((f: any, i: number) => (
                                <div key={i} className="text-sm">
                                  R$ {Number(f.liquidezMinima).toLocaleString('pt-BR')} → {Number(f.percentualComissao).toFixed(2)}%
                                </div>
                              ))}
                            </TableCell>
                            <TableCell className="text-gray-300">
                              {meta.updatedAt ? new Date(meta.updatedAt).toLocaleDateString('pt-BR') : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })
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
