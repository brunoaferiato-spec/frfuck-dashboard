import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useEffect, useState } from "react";
import { TrendingUp, DollarSign, Target, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

const mockChartData = [
  { mes: "Jan", valor: 85000 },
  { mes: "Fev", valor: 92000 },
  { mes: "Mar", valor: 88000 },
  { mes: "Abr", valor: 95000 },
  { mes: "Mai", valor: 102000 },
];

const kpis = {
  liquidez: "R$ 120k",
  folha: "R$ 38k",
  comissao: "R$ 19k",
  meta: "92%",
  funcionarios: 12,
};

export default function Home() {
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedUser, setLoggedUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess(data) {
      localStorage.setItem("auth_token", data.token);
      utils.auth.me.invalidate();
      window.location.reload();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess() {
      localStorage.removeItem("auth_token");
      utils.auth.me.invalidate();
      setLoggedUser(null);
      window.location.reload();
    },
  });

  useEffect(() => {
    if (meQuery.isFetched) setAuthChecked(true);

    if (meQuery.data) {
      setLoggedUser(meQuery.data);
    } else {
      setLoggedUser(null);
    }
  }, [meQuery.data, meQuery.isFetched]);

  const handleLogin = async () => {
    if (!email || !password) return;

    try {
      await loginMutation.mutateAsync({
        email,
        password,
      });
    } catch (error) {
      console.error("Erro no login:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      console.error("Erro no logout:", error);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  if (!loggedUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <Card className="bg-gray-950 border-yellow-500/30 text-white">
            <CardHeader className="text-center space-y-3">
              <CardTitle className="text-3xl text-yellow-400">
                Entrar no sistema
              </CardTitle>
              <CardDescription className="text-gray-400">
                Faça login para acessar o dashboard
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Email
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-3 text-white outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Senha
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-3 text-white outline-none focus:border-yellow-400"
                />
              </div>

              {loginMutation.error && (
                <p className="text-sm text-red-400">
                  {loginMutation.error.message}
                </p>
              )}

              <Button
                onClick={handleLogin}
                disabled={loginMutation.isPending}
                className="w-full bg-yellow-400 text-black hover:bg-yellow-300"
              >
                {loginMutation.isPending ? "Entrando..." : "Entrar"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white">
      <div className="bg-black border-b border-yellow-500/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-yellow-400">Dashboard</h1>
              <p className="text-xs text-gray-400">Sistema de Gestão Integrado</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-gray-300">
                  Olá,{" "}
                  <span className="text-yellow-400 font-semibold">
                    {loggedUser?.name || loggedUser?.email || "Usuário"}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  Função:{" "}
                  <span className="text-yellow-400 uppercase">
                    {loggedUser?.role}
                  </span>
                </p>
              </div>

              <Button
                onClick={handleLogout}
                variant="outline"
                className="border-yellow-500/40 text-yellow-400 bg-transparent hover:bg-yellow-500/10"
              >
                {logoutMutation.isPending ? "Saindo..." : "Sair"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/40 text-white">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-300">Liquidez</CardTitle>
                <TrendingUp className="w-4 h-4 text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-400">{kpis.liquidez}</p>
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
              <p className="text-3xl font-bold text-yellow-400">{kpis.folha}</p>
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
              <p className="text-3xl font-bold text-yellow-400">{kpis.comissao}</p>
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
              <p className="text-3xl font-bold text-yellow-400">{kpis.meta}</p>
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
              <p className="text-3xl font-bold text-yellow-400">{kpis.funcionarios}</p>
              <p className="text-xs text-gray-400 mt-1">Ativos</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gray-900 border-yellow-500/30 text-white">
          <CardHeader>
            <CardTitle className="text-yellow-400">Desempenho Mensal</CardTitle>
            <CardDescription className="text-gray-400">
              Comparativo mensal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
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
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="#facc15"
                  strokeWidth={3}
                  name="Receita"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-bold text-yellow-400 mb-4">
            Acesso Rápido aos Módulos
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div onClick={() => setLocation("/folha-pagamento")} style={{ cursor: "pointer" }}>
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
            </div>

            <div onClick={() => setLocation("/folha-multi")} style={{ cursor: "pointer" }}>
             <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 hover:border-yellow-400 transition-all h-full text-white">
              <CardHeader>
               <CardTitle className="text-yellow-400">Folha Multi</CardTitle>
               <CardDescription className="text-gray-400">
                 Teste da folha com banco de dados
              </CardDescription>
            </CardHeader>
            <CardContent>
             <Button className="w-full bg-yellow-400 text-black hover:bg-yellow-300">
               Acessar
             </Button>
            </CardContent>
           </Card>
        </div>
        
            <div onClick={() => setLocation("/metas")} style={{ cursor: "pointer" }}>
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
            </div>

            <div onClick={() => setLocation("/analise-funcionario")} style={{ cursor: "pointer" }}>
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
            </div>

            <div onClick={() => setLocation("/funcionarios")} style={{ cursor: "pointer" }}>
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
            </div>

            <div onClick={() => setLocation("/usuarios")} style={{ cursor: "pointer" }}>
              <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-yellow-500/30 hover:border-yellow-400 transition-all h-full text-white">
                <CardHeader>
                  <CardTitle className="text-yellow-400">Usuários</CardTitle>
                  <CardDescription className="text-gray-400">
                    Gestão de acessos e permissões
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
    </div>
  );
}