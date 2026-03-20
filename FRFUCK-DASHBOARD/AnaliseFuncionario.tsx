import React, { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

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
];

export default function AnaliseFuncionario() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedMonth, setSelectedMonth] = useState("3");
  const [selectedFuncionario, setSelectedFuncionario] = useState("1");
  const [somarTodosVales, setSomarTodosVales] = useState(false);

  // Queries
  const { data: funcionarios = [], isLoading: loadingFuncionarios } = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: parseInt(selectedLoja) },
    { enabled: !!user }
  );

  const { data: folhas = [], isLoading: loadingFolhas } = trpc.folhaPagamento.getByLojaAnoMes.useQuery(
    { lojaId: parseInt(selectedLoja), ano: parseInt(selectedYear), mes: parseInt(selectedMonth) },
    { enabled: !!user }
  );

  const { data: vales = [], isLoading: loadingVales } = trpc.vales.getByFuncionarioAnoMes.useQuery(
    { funcionarioId: parseInt(selectedFuncionario), ano: parseInt(selectedYear), mes: parseInt(selectedMonth) },
    { enabled: !!user && selectedFuncionario !== "0" }
  );

  const { data: descontos = [], isLoading: loadingDescontos } = trpc.descontos.getByFuncionarioAnoMes.useQuery(
    { funcionarioId: parseInt(selectedFuncionario), ano: parseInt(selectedYear), mes: parseInt(selectedMonth) },
    { enabled: !!user && selectedFuncionario !== "0" }
  );

  const { data: premiacoes = [], isLoading: loadingPremiacoes } = trpc.premiacoes.getByFuncionarioAnoMes.useQuery(
    { funcionarioId: parseInt(selectedFuncionario), ano: parseInt(selectedYear), mes: parseInt(selectedMonth) },
    { enabled: !!user && selectedFuncionario !== "0" }
  );

  const { data: observacoes = [], isLoading: loadingObservacoes } = trpc.observacoes.getByFuncionarioAnoMes.useQuery(
    { funcionarioId: parseInt(selectedFuncionario), ano: parseInt(selectedYear), mes: parseInt(selectedMonth) },
    { enabled: !!user && selectedFuncionario !== "0" }
  );

  // Construir análise do funcionário
  const analise = useMemo(() => {
    if (!selectedFuncionario || selectedFuncionario === "0") return null;

    const func = funcionarios.find((f: any) => f.id === parseInt(selectedFuncionario));
    if (!func) return null;

    const folhasFunc = folhas.filter((f: any) => f.funcionarioId === parseInt(selectedFuncionario));
    const totalLiquidez = folhasFunc.reduce((sum: number, f: any) => sum + Number(f.liquidez), 0);
    const totalComissao = folhasFunc.reduce((sum: number, f: any) => sum + Number(f.valorComissao), 0);

    const totalVales = somarTodosVales 
      ? vales.reduce((sum: number, v: any) => sum + Number(v.valorTotal), 0) * 3
      : vales.reduce((sum: number, v: any) => sum + Number(v.valorTotal), 0);

    const totalDescontos = descontos.reduce((sum: number, d: any) => sum + Number(d.valor), 0);
    const totalPremiacoes = premiacoes.reduce((sum: number, p: any) => sum + Number(p.valor), 0);

    const salarioFinal = totalComissao + totalPremiacoes - totalVales - totalDescontos;

    return {
      funcionario: func.nome,
      funcao: func.funcao,
      loja: LOJAS.find(l => l.id === parseInt(selectedLoja))?.nome || "",
      mes: selectedMonth,
      ano: selectedYear,
      folha: folhasFunc.map((f: any) => ({
        semana: f.semana,
        liquidez: Number(f.liquidez),
        percentualComissao: Number(f.percentualComissao),
        valorComissao: Number(f.valorComissao),
      })),
      totalLiquidez,
      totalComissao,
      premiacao: totalPremiacoes,
      vales: totalVales,
      descontos: totalDescontos,
      observacoes: observacoes.map((o: any) => o.texto),
      salarioFinal,
    };
  }, [selectedFuncionario, funcionarios, folhas, vales, descontos, premiacoes, observacoes, selectedLoja, selectedMonth, selectedYear, somarTodosVales]);

  const chartData = useMemo(() => {
    if (!analise) return [];
    return analise.folha.map((row: any) => ({
      semana: `${row.semana}ª`,
      liquidez: row.liquidez,
      comissao: row.valorComissao,
    }));
  }, [analise]);

  const comparativoChartData = useMemo(() => {
    if (folhas.length === 0) return [];
    
    const semanas = [1, 2, 3, 4];
    return semanas.map((semana: number) => {
      const data: any = { semana: `${semana}ª` };
      const funcionariosSemana = Array.from(new Set(folhas.filter((f: any) => f.semana === semana).map((f: any) => f.funcionarioId)));
      
      funcionariosSemana.forEach((funcId: any, index: number) => {
        const folha = folhas.find((f: any) => f.funcionarioId === funcId && f.semana === semana);
        if (folha) {
          data[`func${index + 1}`] = Number(folha.liquidez);
        }
      });
      return data;
    });
  }, [folhas]);

  const isLoading = loadingFuncionarios || loadingFolhas || loadingVales || loadingDescontos || loadingPremiacoes || loadingObservacoes;

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
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="text-primary hover:bg-primary/20"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-primary">Análise de Funcionário</h1>
              <p className="text-gray-400">Visualize dados detalhados de comissões e descontos</p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-gray-300 mb-2 block text-sm">Loja</label>
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
                <label className="text-gray-300 mb-2 block text-sm">Funcionário</label>
                <Select value={selectedFuncionario} onValueChange={setSelectedFuncionario}>
                  <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-primary/30">
                    <SelectItem value="0" className="text-white">Selecionar...</SelectItem>
                    {funcionarios.map((func: any) => (
                      <SelectItem key={func.id} value={func.id.toString()} className="text-white">
                        {func.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-gray-300 mb-2 block text-sm">Ano</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-primary/30">
                    {[2025, 2026, 2027].map(year => (
                      <SelectItem key={year} value={year.toString()} className="text-white">
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-gray-300 mb-2 block text-sm">Mês</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
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

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : analise ? (
          <>
            {/* Resumo */}
            <Card className="bg-gray-900 border-primary/30">
              <CardHeader>
                <CardTitle className="text-primary">{analise.funcionario}</CardTitle>
                <CardDescription className="text-gray-400">
                  {FUNCOES.find(f => f.id === analise.funcao)?.nome} | {analise.loja} | {analise.mes}/{analise.ano}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800 p-4 rounded border border-primary/20">
                    <p className="text-gray-400 text-sm mb-1">Total Liquidez</p>
                    <p className="text-primary text-xl font-bold">R$ {analise.totalLiquidez.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded border border-primary/20">
                    <p className="text-gray-400 text-sm mb-1">Total Comissão</p>
                    <p className="text-green-400 text-xl font-bold">R$ {analise.totalComissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded border border-primary/20">
                    <p className="text-gray-400 text-sm mb-1">Premiações</p>
                    <p className="text-yellow-400 text-xl font-bold">R$ {analise.premiacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded border border-primary/20">
                    <p className="text-gray-400 text-sm mb-1">Salário Final</p>
                    <p className={`text-xl font-bold ${analise.salarioFinal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      R$ {analise.salarioFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="folha" className="space-y-4">
              <TabsList className="bg-gray-900 border-primary/30">
                <TabsTrigger value="folha" className="text-primary">Folha</TabsTrigger>
                <TabsTrigger value="descontos" className="text-primary">Descontos</TabsTrigger>
                <TabsTrigger value="observacoes" className="text-primary">Observações</TabsTrigger>
                <TabsTrigger value="comparativo" className="text-primary">Comparativo</TabsTrigger>
              </TabsList>

              {/* Tab Folha */}
              <TabsContent value="folha" className="space-y-4">
                <Card className="bg-gray-900 border-primary/30">
                  <CardHeader>
                    <CardTitle className="text-primary">Folha de Pagamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-primary/30">
                            <TableHead className="text-primary">Semana</TableHead>
                            <TableHead className="text-primary text-right">Liquidez</TableHead>
                            <TableHead className="text-primary text-right">%</TableHead>
                            <TableHead className="text-primary text-right">Comissão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analise.folha.map((row: any, i: number) => (
                            <TableRow key={i} className="border-primary/20 hover:bg-gray-800">
                              <TableCell className="text-white">Semana {row.semana}</TableCell>
                              <TableCell className="text-gray-300 text-right">R$ {row.liquidez.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-gray-300 text-right">{row.percentualComissao.toFixed(2)}%</TableCell>
                              <TableCell className="text-green-400 text-right font-semibold">R$ {row.valorComissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {chartData.length > 0 && (
                  <Card className="bg-gray-900 border-primary/30">
                    <CardHeader>
                      <CardTitle className="text-primary">Gráfico de Liquidez e Comissão</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="semana" stroke="#999" />
                          <YAxis stroke="#999" />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #fbbf24' }} />
                          <Legend />
                          <Line type="monotone" dataKey="liquidez" stroke="#fbbf24" name="Liquidez" />
                          <Line type="monotone" dataKey="comissao" stroke="#22c55e" name="Comissão" />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Tab Descontos */}
              <TabsContent value="descontos" className="space-y-4">
                <Card className="bg-gray-900 border-primary/30">
                  <CardHeader>
                    <CardTitle className="text-primary">Descontos e Vales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="bg-gray-800 p-4 rounded border border-primary/20">
                          <p className="text-gray-400 text-sm mb-1">Total Vales</p>
                          <p className="text-red-400 text-lg font-bold">R$ {analise.vales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded border border-primary/20">
                          <p className="text-gray-400 text-sm mb-1">Total Descontos</p>
                          <p className="text-red-400 text-lg font-bold">R$ {analise.descontos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded border border-primary/20">
                          <p className="text-gray-400 text-sm mb-1">
                            <Checkbox checked={somarTodosVales} onCheckedChange={(checked) => setSomarTodosVales(!!checked)} className="mr-2 inline" />
                            Somar todos os vales
                          </p>
                        </div>
                      </div>

                      {descontos.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-primary font-semibold mb-2">Descontos Detalhados</h3>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-primary/30">
                                  <TableHead className="text-primary">Tipo</TableHead>
                                  <TableHead className="text-primary text-right">Valor</TableHead>
                                  <TableHead className="text-primary">Descrição</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {descontos.map((desc: any) => (
                                  <TableRow key={desc.id} className="border-primary/20">
                                    <TableCell className="text-white capitalize">{desc.tipo}</TableCell>
                                    <TableCell className="text-red-400 text-right font-semibold">R$ {Number(desc.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-gray-300">{desc.descricao || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab Observações */}
              <TabsContent value="observacoes" className="space-y-4">
                <Card className="bg-gray-900 border-primary/30">
                  <CardHeader>
                    <CardTitle className="text-primary">Observações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {observacoes.length === 0 ? (
                      <p className="text-gray-400">Nenhuma observação registrada</p>
                    ) : (
                      <ul className="space-y-2">
                        {observacoes.map((obs: any, i: number) => (
                          <li key={i} className="text-gray-300 flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            {obs.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab Comparativo */}
              <TabsContent value="comparativo" className="space-y-4">
                <Card className="bg-gray-900 border-primary/30">
                  <CardHeader>
                    <CardTitle className="text-primary">Comparativo de Liquidez</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {comparativoChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={comparativoChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="semana" stroke="#999" />
                          <YAxis stroke="#999" />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #fbbf24' }} />
                          <Legend />
                          <Line type="monotone" dataKey="func1" stroke="#fbbf24" name="Func 1" />
                          <Line type="monotone" dataKey="func2" stroke="#22c55e" name="Func 2" />
                          <Line type="monotone" dataKey="func3" stroke="#3b82f6" name="Func 3" />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-gray-400">Sem dados para comparação</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card className="bg-gray-900 border-primary/30">
            <CardContent className="py-12">
              <p className="text-center text-gray-400">Selecione um funcionário para visualizar a análise</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
