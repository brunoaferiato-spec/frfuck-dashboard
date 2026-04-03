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

interface FolhaDetalhada {
  semana: number;
  liquidez: number;
  percentualComissao: number;
  valorComissao: number;
}

interface AnaliseFuncionarioData {
  funcionario: string;
  funcao: string;
  loja: string;
  mes: string;
  ano: string;
  folha: FolhaDetalhada[];
  totalLiquidez: number;
  totalComissao: number;
  premiacao: number;
  vales: number;
  aluguel: number;
  inss: number;
  adiantamento: number;
  holerite: number;
  boleto: number;
  observacoes: string[];
}

const MOCK_ANALISE: AnaliseFuncionarioData = {
  funcionario: "João Silva",
  funcao: "Mecânico",
  loja: "Joinville",
  mes: "março",
  ano: "2026",
  folha: [
    { semana: 1, liquidez: 5000, percentualComissao: 10, valorComissao: 500 },
    { semana: 2, liquidez: 8000, percentualComissao: 12, valorComissao: 960 },
    { semana: 3, liquidez: 10000, percentualComissao: 15, valorComissao: 1500 },
    { semana: 4, liquidez: 12000, percentualComissao: 15, valorComissao: 1800 },
  ],
  totalLiquidez: 35000,
  totalComissao: 4760,
  premiacao: 500,
  vales: 1000,
  aluguel: 800,
  inss: 500,
  adiantamento: 1000,
  holerite: 200,
  boleto: 1760,
  observacoes: ["Funcionário destaque do mês", "Atingiu meta em 120%"],
};

// Dados mock para comparativo
const MOCK_COMPARATIVO = [
  {
    funcionario: "João Silva",
    folha: [
      { semana: 1, liquidez: 5000, percentualComissao: 10, valorComissao: 500 },
      { semana: 2, liquidez: 8000, percentualComissao: 12, valorComissao: 960 },
      { semana: 3, liquidez: 10000, percentualComissao: 15, valorComissao: 1500 },
      { semana: 4, liquidez: 12000, percentualComissao: 15, valorComissao: 1800 },
    ],
    totalLiquidez: 35000,
    totalComissao: 4760,
    vales: 1000,
  },
  {
    funcionario: "Maria Santos",
    folha: [
      { semana: 1, liquidez: 6000, percentualComissao: 10, valorComissao: 600 },
      { semana: 2, liquidez: 7000, percentualComissao: 12, valorComissao: 840 },
      { semana: 3, liquidez: 9000, percentualComissao: 15, valorComissao: 1350 },
      { semana: 4, liquidez: 11000, percentualComissao: 15, valorComissao: 1650 },
    ],
    totalLiquidez: 33000,
    totalComissao: 4440,
    vales: 800,
  },
  {
    funcionario: "Pedro Costa",
    folha: [
      { semana: 1, liquidez: 7000, percentualComissao: 10, valorComissao: 700 },
      { semana: 2, liquidez: 9000, percentualComissao: 12, valorComissao: 1080 },
      { semana: 3, liquidez: 11000, percentualComissao: 15, valorComissao: 1650 },
      { semana: 4, liquidez: 13000, percentualComissao: 15, valorComissao: 1950 },
    ],
    totalLiquidez: 40000,
    totalComissao: 5380,
    vales: 1200,
  },
];

export default function AnaliseFuncionario() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedMonth, setSelectedMonth] = useState("3");
  const [selectedFuncionario, setSelectedFuncionario] = useState("1");
  const [somarTodosVales, setSomarTodosVales] = useState(false);
  const [analise, setAnalise] = useState<AnaliseFuncionarioData>(MOCK_ANALISE);
  
  // Estados para Comparativo
  const [comp1Loja, setComp1Loja] = useState("1");
  const [comp1Year, setComp1Year] = useState("2026");
  const [comp1Month, setComp1Month] = useState("3");
  const [comp1Funcionario, setComp1Funcionario] = useState("1");
  
  const [comp2Loja, setComp2Loja] = useState("1");
  const [comp2Year, setComp2Year] = useState("2026");
  const [comp2Month, setComp2Month] = useState("3");
  const [comp2Funcionario, setComp2Funcionario] = useState("2");
  
  const [comp3Loja, setComp3Loja] = useState("1");
  const [comp3Year, setComp3Year] = useState("2026");
  const [comp3Month, setComp3Month] = useState("3");
  const [comp3Funcionario, setComp3Funcionario] = useState("3");

  const chartData = useMemo(() => {
    return analise.folha.map(row => ({
      semana: `${row.semana}ª`,
      liquidez: row.liquidez,
      comissao: row.valorComissao,
    }));
  }, [analise]);

  const comparativoChartData = useMemo(() => {
    return [
      {
        semana: "1ª",
        funcionario1: MOCK_COMPARATIVO[0].folha[0].liquidez,
        funcionario2: MOCK_COMPARATIVO[1].folha[0].liquidez,
        funcionario3: MOCK_COMPARATIVO[2].folha[0].liquidez,
      },
      {
        semana: "2ª",
        funcionario1: MOCK_COMPARATIVO[0].folha[1].liquidez,
        funcionario2: MOCK_COMPARATIVO[1].folha[1].liquidez,
        funcionario3: MOCK_COMPARATIVO[2].folha[1].liquidez,
      },
      {
        semana: "3ª",
        funcionario1: MOCK_COMPARATIVO[0].folha[2].liquidez,
        funcionario2: MOCK_COMPARATIVO[1].folha[2].liquidez,
        funcionario3: MOCK_COMPARATIVO[2].folha[2].liquidez,
      },
      {
        semana: "4ª",
        funcionario1: MOCK_COMPARATIVO[0].folha[3].liquidez,
        funcionario2: MOCK_COMPARATIVO[1].folha[3].liquidez,
        funcionario3: MOCK_COMPARATIVO[2].folha[3].liquidez,
      },
    ];
  }, []);

  const totalVales = useMemo(() => {
    if (somarTodosVales) {
      return analise.vales * 3;
    }
    return analise.vales;
  }, [analise.vales, somarTodosVales]);

  const salarioFinal = useMemo(() => {
    return (
      analise.totalComissao +
      analise.premiacao -
      totalVales -
      analise.aluguel -
      analise.inss -
      analise.adiantamento -
      analise.holerite
    );
  }, [analise, totalVales]);

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
        {/* Header com Voltar */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="text-primary hover:bg-primary/20"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">Análise de Funcionário</h1>
            <p className="text-gray-400">Raío-X detalhado do desempenho e remuneração</p>
          </div>
        </div>

        {/* Abas */}
        <Tabs defaultValue="individual" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gray-900 border border-primary/30">
            <TabsTrigger value="individual" className="text-primary data-[state=active]:bg-primary/20">Análise Individual</TabsTrigger>
            <TabsTrigger value="comparativo" className="text-primary data-[state=active]:bg-primary/20">Comparativo (3 Funcionários)</TabsTrigger>
          </TabsList>

          {/* Aba: Análise Individual */}
          <TabsContent value="individual" className="space-y-6">
            {/* Filtros */}
            <Card className="bg-gray-900 border-primary/30">
              <CardHeader>
                <CardTitle className="text-primary">Seleção de Período e Funcionário</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="text-gray-300 mb-2 block text-sm">Loja</label>
                    <Select value={selectedLoja} onValueChange={setSelectedLoja}>
                      <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-primary/30">
                        {LOJAS.map(loja => (
                          <SelectItem key={loja.id} value={loja.id.toString()}>
                            {loja.nome}
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
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
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
                        <SelectItem value="1">Janeiro</SelectItem>
                        <SelectItem value="2">Fevereiro</SelectItem>
                        <SelectItem value="3">Março</SelectItem>
                        <SelectItem value="4">Abril</SelectItem>
                        <SelectItem value="5">Maio</SelectItem>
                        <SelectItem value="6">Junho</SelectItem>
                        <SelectItem value="7">Julho</SelectItem>
                        <SelectItem value="8">Agosto</SelectItem>
                        <SelectItem value="9">Setembro</SelectItem>
                        <SelectItem value="10">Outubro</SelectItem>
                        <SelectItem value="11">Novembro</SelectItem>
                        <SelectItem value="12">Dezembro</SelectItem>
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
                        <SelectItem value="1">João Silva</SelectItem>
                        <SelectItem value="2">Maria Santos</SelectItem>
                        <SelectItem value="3">Pedro Costa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gráfico de Desempenho */}
            <Card className="bg-gray-900 border-primary/30">
              <CardHeader>
                <CardTitle className="text-primary">Desempenho por Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="semana" stroke="#999" />
                    <YAxis stroke="#999" />
                    <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #fbbf24" }} />
                    <Legend />
                    <Line type="monotone" dataKey="liquidez" stroke="#fbbf24" strokeWidth={2} name="Liquidez" />
                    <Line type="monotone" dataKey="comissao" stroke="#10b981" strokeWidth={2} name="Comissão" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Detalhes da Folha */}
            <Card className="bg-gray-900 border-primary/30">
              <CardHeader>
                <CardTitle className="text-primary">Detalhes da Folha de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-primary/30 hover:bg-gray-800">
                        <TableHead className="text-primary">Semana</TableHead>
                        <TableHead className="text-primary">Liquidez</TableHead>
                        <TableHead className="text-primary">% Comissão</TableHead>
                        <TableHead className="text-primary">Valor Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analise.folha.map(row => (
                        <TableRow key={row.semana} className="border-primary/20 hover:bg-gray-800">
                          <TableCell className="text-gray-300">{row.semana}ª Semana</TableCell>
                          <TableCell className="text-gray-300">R$ {row.liquidez.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-gray-300">{row.percentualComissao}%</TableCell>
                          <TableCell className="text-gray-300">R$ {row.valorComissao.toLocaleString('pt-BR')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Resumo Financeiro */}
            <Card className="bg-gray-900 border-primary/30">
              <CardHeader>
                <CardTitle className="text-primary">Resumo Financeiro</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm">Total Liquidez</p>
                    <p className="text-2xl font-bold text-primary">R$ {analise.totalLiquidez.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Total Comissão</p>
                    <p className="text-2xl font-bold text-green-400">R$ {analise.totalComissao.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Premiação</p>
                    <p className="text-lg font-semibold text-gray-300">R$ {analise.premiacao.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Vales</p>
                    <p className="text-lg font-semibold text-gray-300">R$ {totalVales.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Aluguel</p>
                    <p className="text-lg font-semibold text-gray-300">R$ {analise.aluguel.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">INSS</p>
                    <p className="text-lg font-semibold text-gray-300">R$ {analise.inss.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Adiantamento</p>
                    <p className="text-lg font-semibold text-gray-300">R$ {analise.adiantamento.toLocaleString('pt-BR')}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Holerite</p>
                    <p className="text-lg font-semibold text-gray-300">R$ {analise.holerite.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="col-span-2 border-t border-primary/30 pt-4">
                    <p className="text-gray-400 text-sm">Boleto (Salário Final)</p>
                    <p className="text-3xl font-bold text-primary">R$ {salarioFinal.toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Opções Adicionais */}
            <Card className="bg-gray-900 border-primary/30">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="somarVales"
                    checked={somarTodosVales}
                    onCheckedChange={(checked) => setSomarTodosVales(checked === true)}
                  />
                  <label
                    htmlFor="somarVales"
                    className="text-sm font-medium text-gray-300 cursor-pointer"
                  >
                    Somar todos os vales de todos os meses (para demissão)
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Observações */}
            {analise.observacoes.length > 0 && (
              <Card className="bg-gray-900 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-primary">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analise.observacoes.map((obs, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-primary mt-1">•</span>
                        <span className="text-gray-300">{obs}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Aba: Comparativo */}
          <TabsContent value="comparativo" className="space-y-6">
            {/* 3 Colunas com Dados e Seleções Independentes */}
            <div className="grid grid-cols-3 gap-4">
              {/* Coluna 1 */}
              <Card className="bg-gray-900 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-primary text-lg">Funcionário 1</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Seleções Coluna 1 */}
                  <div className="grid grid-cols-4 gap-2 bg-gray-800 p-3 rounded">
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Loja</label>
                      <Select value={comp1Loja} onValueChange={setComp1Loja}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">Joinville</SelectItem>
                          <SelectItem value="2">Blumenau</SelectItem>
                          <SelectItem value="3">São José</SelectItem>
                          <SelectItem value="4">Florianópolis</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Ano</label>
                      <Select value={comp1Year} onValueChange={setComp1Year}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="2024">2024</SelectItem>
                          <SelectItem value="2025">2025</SelectItem>
                          <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Mês</label>
                      <Select value={comp1Month} onValueChange={setComp1Month}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">Janeiro</SelectItem>
                          <SelectItem value="2">Fevereiro</SelectItem>
                          <SelectItem value="3">Março</SelectItem>
                          <SelectItem value="4">Abril</SelectItem>
                          <SelectItem value="5">Maio</SelectItem>
                          <SelectItem value="6">Junho</SelectItem>
                          <SelectItem value="7">Julho</SelectItem>
                          <SelectItem value="8">Agosto</SelectItem>
                          <SelectItem value="9">Setembro</SelectItem>
                          <SelectItem value="10">Outubro</SelectItem>
                          <SelectItem value="11">Novembro</SelectItem>
                          <SelectItem value="12">Dezembro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Funcionário</label>
                      <Select value={comp1Funcionario} onValueChange={setComp1Funcionario}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">João Silva</SelectItem>
                          <SelectItem value="2">Maria Santos</SelectItem>
                          <SelectItem value="3">Pedro Costa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Dados Coluna 1 */}
                  {MOCK_COMPARATIVO[0].folha.map(semana => (
                    <div key={semana.semana} className="bg-gray-800 p-3 rounded">
                      <p className="text-gray-300 text-sm"><strong>Semana {semana.semana}:</strong> {semana.percentualComissao}% - R$ {semana.valorComissao.toLocaleString('pt-BR')}</p>
                    </div>
                  ))}
                  <div className="border-t border-primary/30 pt-3 mt-3">
                    <p className="text-gray-300 text-sm"><strong>Liquidez Total:</strong> R$ {MOCK_COMPARATIVO[0].totalLiquidez.toLocaleString('pt-BR')}</p>
                    <p className="text-gray-300 text-sm"><strong>Comissão Total:</strong> R$ {MOCK_COMPARATIVO[0].totalComissao.toLocaleString('pt-BR')}</p>
                    <p className="text-gray-300 text-sm"><strong>Vales:</strong> R$ {MOCK_COMPARATIVO[0].vales.toLocaleString('pt-BR')}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Coluna 2 */}
              <Card className="bg-gray-900 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-primary text-lg">Funcionário 2</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Seleções Coluna 2 */}
                  <div className="grid grid-cols-4 gap-2 bg-gray-800 p-3 rounded">
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Loja</label>
                      <Select value={comp2Loja} onValueChange={setComp2Loja}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">Joinville</SelectItem>
                          <SelectItem value="2">Blumenau</SelectItem>
                          <SelectItem value="3">São José</SelectItem>
                          <SelectItem value="4">Florianópolis</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Ano</label>
                      <Select value={comp2Year} onValueChange={setComp2Year}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="2024">2024</SelectItem>
                          <SelectItem value="2025">2025</SelectItem>
                          <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Mês</label>
                      <Select value={comp2Month} onValueChange={setComp2Month}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">Janeiro</SelectItem>
                          <SelectItem value="2">Fevereiro</SelectItem>
                          <SelectItem value="3">Março</SelectItem>
                          <SelectItem value="4">Abril</SelectItem>
                          <SelectItem value="5">Maio</SelectItem>
                          <SelectItem value="6">Junho</SelectItem>
                          <SelectItem value="7">Julho</SelectItem>
                          <SelectItem value="8">Agosto</SelectItem>
                          <SelectItem value="9">Setembro</SelectItem>
                          <SelectItem value="10">Outubro</SelectItem>
                          <SelectItem value="11">Novembro</SelectItem>
                          <SelectItem value="12">Dezembro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Funcionário</label>
                      <Select value={comp2Funcionario} onValueChange={setComp2Funcionario}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">João Silva</SelectItem>
                          <SelectItem value="2">Maria Santos</SelectItem>
                          <SelectItem value="3">Pedro Costa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Dados Coluna 2 */}
                  {MOCK_COMPARATIVO[1].folha.map(semana => (
                    <div key={semana.semana} className="bg-gray-800 p-3 rounded">
                      <p className="text-gray-300 text-sm"><strong>Semana {semana.semana}:</strong> {semana.percentualComissao}% - R$ {semana.valorComissao.toLocaleString('pt-BR')}</p>
                    </div>
                  ))}
                  <div className="border-t border-primary/30 pt-3 mt-3">
                    <p className="text-gray-300 text-sm"><strong>Liquidez Total:</strong> R$ {MOCK_COMPARATIVO[1].totalLiquidez.toLocaleString('pt-BR')}</p>
                    <p className="text-gray-300 text-sm"><strong>Comissão Total:</strong> R$ {MOCK_COMPARATIVO[1].totalComissao.toLocaleString('pt-BR')}</p>
                    <p className="text-gray-300 text-sm"><strong>Vales:</strong> R$ {MOCK_COMPARATIVO[1].vales.toLocaleString('pt-BR')}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Coluna 3 */}
              <Card className="bg-gray-900 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-primary text-lg">Funcionário 3</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Seleções Coluna 3 */}
                  <div className="grid grid-cols-4 gap-2 bg-gray-800 p-3 rounded">
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Loja</label>
                      <Select value={comp3Loja} onValueChange={setComp3Loja}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">Joinville</SelectItem>
                          <SelectItem value="2">Blumenau</SelectItem>
                          <SelectItem value="3">São José</SelectItem>
                          <SelectItem value="4">Florianópolis</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Ano</label>
                      <Select value={comp3Year} onValueChange={setComp3Year}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="2024">2024</SelectItem>
                          <SelectItem value="2025">2025</SelectItem>
                          <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Mês</label>
                      <Select value={comp3Month} onValueChange={setComp3Month}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">Janeiro</SelectItem>
                          <SelectItem value="2">Fevereiro</SelectItem>
                          <SelectItem value="3">Março</SelectItem>
                          <SelectItem value="4">Abril</SelectItem>
                          <SelectItem value="5">Maio</SelectItem>
                          <SelectItem value="6">Junho</SelectItem>
                          <SelectItem value="7">Julho</SelectItem>
                          <SelectItem value="8">Agosto</SelectItem>
                          <SelectItem value="9">Setembro</SelectItem>
                          <SelectItem value="10">Outubro</SelectItem>
                          <SelectItem value="11">Novembro</SelectItem>
                          <SelectItem value="12">Dezembro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-gray-300 text-xs block mb-1">Funcionário</label>
                      <Select value={comp3Funcionario} onValueChange={setComp3Funcionario}>
                        <SelectTrigger className="bg-gray-700 border-primary/20 text-white text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-primary/30">
                          <SelectItem value="1">João Silva</SelectItem>
                          <SelectItem value="2">Maria Santos</SelectItem>
                          <SelectItem value="3">Pedro Costa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Dados Coluna 3 */}
                  {MOCK_COMPARATIVO[2].folha.map(semana => (
                    <div key={semana.semana} className="bg-gray-800 p-3 rounded">
                      <p className="text-gray-300 text-sm"><strong>Semana {semana.semana}:</strong> {semana.percentualComissao}% - R$ {semana.valorComissao.toLocaleString('pt-BR')}</p>
                    </div>
                  ))}
                  <div className="border-t border-primary/30 pt-3 mt-3">
                    <p className="text-gray-300 text-sm"><strong>Liquidez Total:</strong> R$ {MOCK_COMPARATIVO[2].totalLiquidez.toLocaleString('pt-BR')}</p>
                    <p className="text-gray-300 text-sm"><strong>Comissão Total:</strong> R$ {MOCK_COMPARATIVO[2].totalComissao.toLocaleString('pt-BR')}</p>
                    <p className="text-gray-300 text-sm"><strong>Vales:</strong> R$ {MOCK_COMPARATIVO[2].vales.toLocaleString('pt-BR')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Gráfico Comparativo */}
            <Card className="bg-gray-900 border-primary/30">
              <CardHeader>
                <CardTitle className="text-primary">Comparativo de Liquidez por Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={comparativoChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="semana" stroke="#999" />
                    <YAxis stroke="#999" />
                    <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #fbbf24" }} />
                    <Legend />
                    <Line type="monotone" dataKey="funcionario1" stroke="#fbbf24" strokeWidth={2} name="João Silva" />
                    <Line type="monotone" dataKey="funcionario2" stroke="#10b981" strokeWidth={2} name="Maria Santos" />
                    <Line type="monotone" dataKey="funcionario3" stroke="#3b82f6" strokeWidth={2} name="Pedro Costa" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
