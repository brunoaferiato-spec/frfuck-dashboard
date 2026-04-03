import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useMemo, useState } from "react";
import { TrendingUp, DollarSign, Target, Users } from "lucide-react";

const mockChartData = [
  { mes: "Jan", joinville: 85000, blumenau: 72000, sao_jose: 68000, florianopolis: 75000 },
  { mes: "Fev", joinville: 92000, blumenau: 78000, sao_jose: 71000, florianopolis: 82000 },
  { mes: "Mar", joinville: 88000, blumenau: 75000, sao_jose: 69000, florianopolis: 79000 },
  { mes: "Abr", joinville: 95000, blumenau: 81000, sao_jose: 73000, florianopolis: 85000 },
  { mes: "Mai", joinville: 102000, blumenau: 87000, sao_jose: 78000, florianopolis: 91000 },
];

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
];

const mockUser = {
  name: "bruno.aferiato",
  email: "bruno.aferiato",
  role: "admin",
};

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663377652496/kpwoMd7wiTukTcSXXvoqVP/fr-fuck-logo_dc35dea1.png";

export default function Home() {
  const [selectedCity, setSelectedCity] = useState("1");
  const [selectedYear, setSelectedYear] = useState("2026");
  const [selectedMonth, setSelectedMonth] = useState(
    (new Date().getMonth() + 1).toString()
  );

  const mockKpis = useMemo(() => {
    const cityData: Record<string, any> = {
      "1": {
        liquidez: "R$ 125k",
        gastoFolha: "R$ 38k",
        gastoComissao: "R$ 19k",
        meta: "92%",
        funcionarios: 12,
      },
      "2": {
        liquidez: "R$ 98k",
        gastoFolha: "R$ 31k",
        gastoComissao: "R$ 15k",
        meta: "85%",
        funcionarios: 10,
      },
      "3": {
        liquidez: "R$ 85k",
        gastoFolha: "R$ 27k",
        gastoComissao: "R$ 13k",
        meta: "78%",
        funcionarios: 8,
      },
      "4": {
        liquidez: "R$ 105k",
        gastoFolha: "R$ 33k",
        gastoComissao: "R$ 16k",
        meta: "88%",
        funcionarios: 12,
      },
    };
    return cityData[selectedCity] || cityData["1"];
  }, [selectedCity]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white">
      <div className="bg-black border-b border-yellow-500/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={LOGO_URL} alt="FR FUCK" className="h-12" />
              <div>
                <h1 className="text-2xl font-bold text-yellow-400">Dashboard</h1>
                <p className="text-xs text-gray-400">Sistema de Gestão Integrado</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-300">
                Olá, <span className="text-yellow-400 font-semibold">{mockUser.name}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Função: <span className="text-yellow-400 uppercase">{mockUser.role}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="min-w-[180px]">
            <label className="text-sm text-gray-400 mb-2 block">Cidade</label>
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="bg-gray-900 border-yellow-500/30 text-white">
                <SelectValue placeholder="Selecionar cidade" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-yellow-500/30 text-white">
                {LOJAS.map((loja) => (
                  <SelectItem key={loja.id} value={loja.id.toString()}>
                    {loja.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[140px]">
            <label className="text-sm text-gray-400 mb-2 block">Ano</label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="bg-gray-900 border-yellow-500/30 text-white">
                <SelectValue placeholder="Selecionar ano" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-yellow-500/30 text-white">
                {[2026, 2027, 2028].map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[140px]">
            <label className="text-sm text-gray-400 mb-2 block">Mês</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="bg-gray-900 border-yellow-500/30 text-white">
                <SelectValue placeholder="Selecionar mês" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-yellow-500/30 text-white">
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(2024, i).toLocaleDateString("pt-BR", { month: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/40 text-white">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-300">Liquidez</CardTitle>
                <TrendingUp className="w-4 h-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-400">{mockKpis.liquidez}</p>
              <p className="text-xs text-gray-400 mt-1">↑ 12%</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/40 text-white">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-300">Gasto Folha</CardTitle>
                <DollarSign className="w-4 h-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-400">{mockKpis.gastoFolha}</p>
              <p className="text-xs text-gray-400 mt-1">↓ 3%</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/40 text-white">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-300">Gasto Comissão</CardTitle>
                <DollarSign className="w-4 h-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-400">{mockKpis.gastoComissao}</p>
              <p className="text-xs text-gray-400 mt-1">↑ 8%</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/40 text-white">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-300">Meta Atingida</CardTitle>
                <Target className="w-4 h-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-400">{mockKpis.meta}</p>
              <p className="text-xs text-gray-400 mt-1">↑ 5%</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/40 text-white">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-300">Funcionários</CardTitle>
                <Users className="w-4 h-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-400">{mockKpis.funcionarios}</p>
              <p className="text-xs text-gray-400 mt-1">Ativos</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gray-900 border-yellow-500/30 text-white">
          <CardHeader>
            <CardTitle className="text-yellow-400">Desempenho Mensal</CardTitle>
            <CardDescription className="text-gray-400">
              Comparativo de liquidez entre lojas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="mes" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111827",
                    border: "1px solid #facc15",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#facc15" }}
                />
                <Legend />
                <Line type="monotone" dataKey="joinville" stroke="#facc15" strokeWidth={3} name="Joinville" />
                <Line type="monotone" dataKey="blumenau" stroke="#f59e0b" strokeWidth={2} name="Blumenau" />
                <Line type="monotone" dataKey="sao_jose" stroke="#fbbf24" strokeWidth={2} name="São José" />
                <Line type="monotone" dataKey="florianopolis" stroke="#fde68a" strokeWidth={2} name="Florianópolis" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-bold text-yellow-400 mb-4">Acesso Rápido aos Módulos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <a href="/folha-pagamento">
              <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 hover:border-yellow-400 transition-all h-full text-white">
                <CardHeader>
                  <CardTitle className="text-yellow-400">Folha de Pagamento</CardTitle>
                  <CardDescription className="text-gray-400">
                    Gestão de liquidez e comissões
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            </a>

            <a href="/metas">
              <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 hover:border-yellow-400 transition-all h-full text-white">
                <CardHeader>
                  <CardTitle className="text-yellow-400">Gestão de Metas</CardTitle>
                  <CardDescription className="text-gray-400">
                    Configuração de comissões
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            </a>

            <a href="/analise-funcionario">
              <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 hover:border-yellow-400 transition-all h-full text-white">
                <CardHeader>
                  <CardTitle className="text-yellow-400">Análise de Funcionários</CardTitle>
                  <CardDescription className="text-gray-400">
                    Desempenho individual
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            </a>

            <a href="/funcionarios">
              <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 hover:border-yellow-400 transition-all h-full text-white">
                <CardHeader>
                  <CardTitle className="text-yellow-400">RH</CardTitle>
                  <CardDescription className="text-gray-400">
                    Gestão de funcionários e alertas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            </a>

            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 h-full text-white">
              <CardHeader>
                <CardTitle className="text-yellow-400">Registro de Compras</CardTitle>
                <CardDescription className="text-gray-400">
                  Controle de gastos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300">
                  Acessar
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 h-full text-white">
              <CardHeader>
                <CardTitle className="text-yellow-400">Conciliação Bancária</CardTitle>
                <CardDescription className="text-gray-400">
                  Matching de extratos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300">
                  Acessar
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}