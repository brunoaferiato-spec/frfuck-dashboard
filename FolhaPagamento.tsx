import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';

const LOJAS = [
  { id: 1, nome: 'Joinville' },
  { id: 2, nome: 'Blumenau' },
  { id: 3, nome: 'São José' },
  { id: 4, nome: 'Florianópolis' },
];

interface FolhaFormData {
  funcionarioId: number;
  lojaId: number;
  ano: number;
  mes: number;
  semana: number;
  liquidez: number;
  percentualComissao: number;
  valorComissao: number;
}

export default function FolhaPagamento() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedLoja, setSelectedLoja] = useState('1');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [isOpen, setIsOpen] = useState(false);
  
  const [formData, setFormData] = useState<Partial<FolhaFormData>>({
    funcionarioId: 0,
    lojaId: parseInt(selectedLoja),
    ano,
    mes,
    semana: 1,
    liquidez: 0,
    percentualComissao: 0,
    valorComissao: 0,
  });

  // Queries
  const { data: funcionarios = [], isLoading: loadingFuncionarios } = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: parseInt(selectedLoja) },
    { enabled: !!user }
  );

  const { data: folhas = [], isLoading: loadingFolhas, refetch } = trpc.folhaPagamento.getByLojaAnoMes.useQuery(
    { lojaId: parseInt(selectedLoja), ano, mes },
    { enabled: !!user }
  );

  // Mutations
  const createMutation = trpc.folhaPagamento.create.useMutation({
    onSuccess: () => {
      toast.success('Folha de pagamento adicionada com sucesso!');
      setFormData({
        funcionarioId: 0,
        lojaId: parseInt(selectedLoja),
        ano,
        mes,
        semana: 1,
        liquidez: 0,
        percentualComissao: 0,
        valorComissao: 0,
      });
      setIsOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao adicionar folha: ${error.message}`);
    },
  });

  const handleAddFolha = async () => {
    if (!formData.funcionarioId || formData.liquidez === undefined) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      await createMutation.mutateAsync({
        funcionarioId: formData.funcionarioId,
        lojaId: parseInt(selectedLoja),
        ano,
        mes,
        semana: formData.semana || 1,
        liquidez: formData.liquidez,
        percentualComissao: formData.percentualComissao || 0,
        valorComissao: formData.valorComissao || 0,
      });
    } catch (error) {
      console.error('Erro ao adicionar folha:', error);
    }
  };

  const calcularComissao = (liquidez: number, percentual: number): number => {
    return (liquidez * percentual) / 100;
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/')}
                className="text-primary hover:bg-primary/20"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-3xl font-bold text-primary">Folha de Pagamento</h1>
            </div>
            <p className="text-gray-400">Gestão de comissões e pagamentos semanais</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <Button
              className="bg-primary text-black hover:bg-yellow-300 font-semibold"
              onClick={() => setIsOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Folha
            </Button>
            <DialogContent className="bg-gray-900 border-primary/30 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-primary">Adicionar Folha de Pagamento</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Registre os dados de pagamento do funcionário
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-300 mb-2 block">Funcionário</Label>
                  <Select 
                    value={formData.funcionarioId?.toString() || ''} 
                    onValueChange={(value) => setFormData({ ...formData, funcionarioId: parseInt(value) })}
                  >
                    <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                      <SelectValue placeholder="Selecionar funcionário" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-primary/30">
                      {funcionarios.map((func: any) => (
                        <SelectItem key={func.id} value={func.id.toString()} className="text-white">
                          {func.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300 mb-2 block">Semana</Label>
                  <Select 
                    value={formData.semana?.toString() || '1'} 
                    onValueChange={(value) => setFormData({ ...formData, semana: parseInt(value) })}
                  >
                    <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                      <SelectValue placeholder="Selecionar semana" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-primary/30">
                      {[1, 2, 3, 4].map(sem => (
                        <SelectItem key={sem} value={sem.toString()} className="text-white">
                          Semana {sem}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-300 mb-2 block">Liquidez (R$)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.liquidez || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const comissao = calcularComissao(val, formData.percentualComissao || 0);
                      setFormData({ 
                        ...formData, 
                        liquidez: val,
                        valorComissao: comissao
                      });
                    }}
                    className="bg-gray-800 border-primary/30 text-white"
                  />
                </div>

                <div>
                  <Label className="text-gray-300 mb-2 block">Percentual Comissão (%)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.percentualComissao || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const comissao = calcularComissao(formData.liquidez || 0, val);
                      setFormData({ 
                        ...formData, 
                        percentualComissao: val,
                        valorComissao: comissao
                      });
                    }}
                    className="bg-gray-800 border-primary/30 text-white"
                  />
                </div>

                <Button
                  onClick={handleAddFolha}
                  disabled={createMutation.isPending}
                  className="w-full bg-primary text-black hover:bg-yellow-300 font-semibold"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Adicionar'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filtros */}
        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">Filtros</CardTitle>
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
                <Label className="text-gray-300 mb-2 block">Ano</Label>
                <Input
                  type="number"
                  value={ano}
                  onChange={(e) => setAno(parseInt(e.target.value))}
                  className="bg-gray-800 border-primary/30 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-300 mb-2 block">Mês</Label>
                <Select value={mes.toString()} onValueChange={(value) => setMes(parseInt(value))}>
                  <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-primary/30">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={m.toString()} className="text-white">
                        {new Date(2026, m - 1).toLocaleDateString('pt-BR', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Folhas */}
        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">
              Folhas de Pagamento - {LOJAS.find(l => l.id === parseInt(selectedLoja))?.nome}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {ano}/{String(mes).padStart(2, '0')} - Total: {folhas.length} registro(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingFolhas ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-primary/30 hover:bg-gray-800">
                      <TableHead className="text-primary">Funcionário</TableHead>
                      <TableHead className="text-primary">Semana</TableHead>
                      <TableHead className="text-primary text-right">Liquidez</TableHead>
                      <TableHead className="text-primary text-right">Percentual</TableHead>
                      <TableHead className="text-primary text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {folhas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                          Nenhuma folha de pagamento registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      folhas.map((folha: any) => {
                        const func = funcionarios.find((f: any) => f.id === folha.funcionarioId);
                        return (
                          <TableRow key={folha.id} className="border-primary/20 hover:bg-gray-800">
                            <TableCell className="text-white font-semibold">{func?.nome || 'Desconhecido'}</TableCell>
                            <TableCell className="text-gray-300">Semana {folha.semana}</TableCell>
                            <TableCell className="text-gray-300 text-right">
                              R$ {Number(folha.liquidez).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-gray-300 text-right">
                              {Number(folha.percentualComissao).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-green-400 text-right font-semibold">
                              R$ {Number(folha.valorComissao).toFixed(2)}
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
