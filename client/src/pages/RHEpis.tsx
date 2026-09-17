import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  PackageCheck,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LOJAS_RH = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
] as const;

const ITENS_EPI = [
  { value: "luva", label: "Luva" },
  { value: "protetor_ouvido", label: "Protetor de ouvido" },
  { value: "creme_protecao", label: "Creme de proteção" },
  { value: "oculos_protecao", label: "Óculos de proteção" },
  { value: "oculos", label: "Óculos" },
  { value: "botina", label: "Botina" },
  { value: "uniforme", label: "Uniforme" },
] as const;

type ItemEpi = (typeof ITENS_EPI)[number]["value"];

type EntregaEpi = {
  id: number;
  lojaId: number;
  lojaNome: string;
  funcionarioId: number;
  funcionarioNome: string;
  funcionarioFuncao?: string | null;
  item: ItemEpi;
  quantidade: number;
  uniformeCamiseta?: number | null;
  uniformeCalca?: number | null;
  uniformeMoletom?: number | null;
  uniformeCamisa?: number | null;
  uniformeCamisetaPolo?: number | null;
  tamanho?: string | null;
  dataEntrega: string;
  observacao?: string | null;
  comprovanteNome?: string | null;
  comprovanteMime?: string | null;
  comprovanteTamanho?: number | null;
  comprovantePendente: boolean;
  entreguePorNome?: string | null;
  comprovantePorNome?: string | null;
  criadoEm?: string | null;
  comprovanteAnexadoEm?: string | null;
  proximaTroca?: string | null;
};

function hojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function labelItem(item: string) {
  return ITENS_EPI.find((opcao) => opcao.value === item)?.label || item;
}

function prazoItem(item: string) {
  if (item === "luva") return "Troca a cada 7 dias";
  if (item === "protetor_ouvido") return "Troca a cada 15 dias";
  if (item === "creme_protecao") return "Troca a cada 3 meses";
  if (item === "oculos_protecao") return "Troca a cada 2 meses";
  if (item === "botina") return "Troca a cada 6 meses";
  return "Sem prazo definido";
}

function diasAte(valor?: string | null) {
  if (!valor) return null;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return null;

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const destino = new Date(ano, mes - 1, dia);
  return Math.round((destino.getTime() - inicioHoje.getTime()) / 86_400_000);
}

function statusPrazo(valor?: string | null) {
  const dias = diasAte(valor);

  if (dias === null) {
    return {
      label: "Sem prazo",
      classe: "border-white/10 bg-white/[0.03] text-gray-400",
    };
  }

  if (dias < 0) {
    return {
      label: `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`,
      classe: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200",
    };
  }

  if (dias === 0) {
    return {
      label: "Troca hoje",
      classe: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200",
    };
  }

  if (dias <= 7) {
    return {
      label: `Troca em ${dias} dia${dias === 1 ? "" : "s"}`,
      classe: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
    };
  }

  return {
    label: "Em dia",
    classe: "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200",
  };
}

function formatarData(valor?: string | null) {
  if (!valor) return "—";
  const data = String(valor).slice(0, 10);
  const [ano, mes, dia] = data.split("-");
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarTamanho(bytes?: number | null) {
  const valor = Number(bytes || 0);
  if (!valor) return "";
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(0)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function arquivoParaBase64(file: File) {
  if (file.size > 6 * 1024 * 1024) {
    throw new Error("O comprovante deve ter no máximo 6 MB.");
  }

  const permitidos = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ]);

  if (!permitidos.has(file.type)) {
    throw new Error("Envie PDF, JPG, PNG, WEBP ou foto HEIC/HEIF.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const bloco = 0x8000;

  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }

  return btoa(binario);
}

export default function RHEpis() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);
  const caixaLider = role === "rh" && lojaUsuario > 0;
  const liderRh = role === "rh" && lojaUsuario <= 0;
  const adminOuGestor = role === "admin" || role === "gestor";

  const hoje = hojeCivil();

  const [lojaEnvio, setLojaEnvio] = useState(caixaLider ? String(lojaUsuario) : "");
  const [funcionarioEnvio, setFuncionarioEnvio] = useState("");
  const [itemEnvio, setItemEnvio] = useState<ItemEpi>("luva");
  const [quantidade, setQuantidade] = useState("1");
  const [uniformeCamiseta, setUniformeCamiseta] = useState("0");
  const [uniformeCalca, setUniformeCalca] = useState("0");
  const [uniformeMoletom, setUniformeMoletom] = useState("0");
  const [uniformeCamisa, setUniformeCamisa] = useState("0");
  const [uniformeCamisetaPolo, setUniformeCamisetaPolo] = useState("0");
  const [tamanho, setTamanho] = useState("");
  const [dataEntrega, setDataEntrega] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const [lojaConsulta, setLojaConsulta] = useState(
    caixaLider ? String(lojaUsuario) : "todas"
  );
  const [itemConsulta, setItemConsulta] = useState("todos");
  const [busca, setBusca] = useState("");

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [abrindoId, setAbrindoId] = useState<number | null>(null);
  const [anexandoId, setAnexandoId] = useState<number | null>(null);

  const lojasQuery = trpc.lojas.list.useQuery(undefined, { retry: false });

  const lojas = useMemo(() => {
    const recebidas = (lojasQuery.data || []) as Array<{ id: number; nome: string }>;
    const porId = new Map(recebidas.map((loja) => [Number(loja.id), loja]));

    return LOJAS_RH.map((loja) => {
      const recebida = porId.get(loja.id);
      return recebida
        ? { ...loja, ...recebida, id: Number(recebida.id), nome: recebida.nome || loja.nome }
        : { ...loja };
    });
  }, [lojasQuery.data]);

  const lojaEnvioNumero = Number(lojaEnvio || 0);

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: lojaEnvioNumero },
    {
      enabled: lojaEnvioNumero > 0,
      retry: false,
    }
  );

  const funcionarios = useMemo(
    () => ((funcionariosQuery.data || []) as Array<any>),
    [funcionariosQuery.data]
  );

  const entregasQuery = trpc.rhEpis.listar.useQuery(
    {
      lojaId:
        caixaLider
          ? lojaUsuario
          : lojaConsulta === "todas"
          ? null
          : Number(lojaConsulta),
      funcionarioId: null,
      item: itemConsulta === "todos" ? null : (itemConsulta as ItemEpi),
      dataInicio: null,
      dataFim: null,
    },
    { retry: false }
  );

  const entregas = useMemo(
    () => ((entregasQuery.data || []) as EntregaEpi[]),
    [entregasQuery.data]
  );

  const entregasFiltradas = useMemo(() => {
    const alvo = normalizarTexto(busca);
    if (!alvo) return entregas;

    return entregas.filter((entrega) =>
      [
        entrega.funcionarioNome,
        entrega.lojaNome,
        entrega.funcionarioFuncao,
        labelItem(entrega.item),
        entrega.tamanho,
        entrega.observacao,
      ].some((valor) => normalizarTexto(valor).includes(alvo))
    );
  }, [entregas, busca]);

  const resumo = useMemo(() => {
    const colaboradores = new Set<number>();
    let quantidadeTotal = 0;
    let pendentes = 0;
    let vencidas = 0;
    let proximas = 0;

    for (const entrega of entregas) {
      colaboradores.add(Number(entrega.funcionarioId));
      quantidadeTotal += Number(entrega.quantidade || 0);
      if (entrega.comprovantePendente) pendentes += 1;

      const dias = diasAte(entrega.proximaTroca);
      if (dias !== null && dias < 0) vencidas += 1;
      if (dias !== null && dias >= 0 && dias <= 7) proximas += 1;
    }

    return {
      entregas: entregas.length,
      quantidadeTotal,
      colaboradores: colaboradores.size,
      pendentes,
      vencidas,
      proximas,
    };
  }, [entregas]);

  const salvarMutation = trpc.rhEpis.salvar.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Entrega de EPI registrada com sucesso.");
      setFuncionarioEnvio("");
      setQuantidade("1");
      setUniformeCamiseta("0");
      setUniformeCalca("0");
      setUniformeMoletom("0");
      setUniformeCamisa("0");
      setUniformeCamisetaPolo("0");
      setTamanho("");
      setObservacao("");
      setArquivo(null);
      await utils.rhEpis.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível registrar a entrega.");
    },
  });

  const anexarMutation = trpc.rhEpis.anexarComprovante.useMutation({
    onSuccess: async () => {
      setAnexandoId(null);
      setErro("");
      setMensagem("Termo/comprovante anexado com sucesso.");
      await utils.rhEpis.listar.invalidate();
    },
    onError: (error) => {
      setAnexandoId(null);
      setMensagem("");
      setErro(error.message || "Não foi possível anexar o comprovante.");
    },
  });

  async function registrarEntrega() {
    setErro("");
    setMensagem("");

    const lojaId = caixaLider ? lojaUsuario : Number(lojaEnvio || 0);
    const funcionarioId = Number(funcionarioEnvio || 0);
    const uniformeSelecionado = itemEnvio === "uniforme";
    const uniformeCampos = [
      uniformeCamiseta,
      uniformeCalca,
      uniformeMoletom,
      uniformeCamisa,
      uniformeCamisetaPolo,
    ];
    const uniformeQuantidades = {
      camiseta: Number(uniformeCamiseta),
      calca: Number(uniformeCalca),
      moletom: Number(uniformeMoletom),
      camisa: Number(uniformeCamisa),
      camisetaPolo: Number(uniformeCamisetaPolo),
    };
    const quantidadeNumero = uniformeSelecionado
      ? Object.values(uniformeQuantidades).reduce((total, valor) => total + valor, 0)
      : Number(quantidade || 0);

    if (!lojaId) {
      setErro("Selecione a loja.");
      return;
    }

    if (!funcionarioId) {
      setErro("Selecione o funcionário.");
      return;
    }

    if (uniformeSelecionado) {
      const algumVazio = uniformeCampos.some((valor) => valor.trim() === "");
      const algumInvalido = Object.values(uniformeQuantidades).some(
        (valor) => !Number.isInteger(valor) || valor < 0 || valor > 99
      );

      if (algumVazio || algumInvalido) {
        setErro(
          "Preencha camiseta, calça, moletom, camisa e camiseta polo com valores entre 0 e 99."
        );
        return;
      }

      if (quantidadeNumero <= 0) {
        setErro("Informe pelo menos uma peça de uniforme entregue.");
        return;
      }

      if (!arquivo) {
        setErro("Para uniforme, anexe a ficha assinada antes de registrar.");
        return;
      }
    } else if (
      !Number.isInteger(quantidadeNumero) ||
      quantidadeNumero <= 0 ||
      quantidadeNumero > 99
    ) {
      setErro("Informe uma quantidade válida entre 1 e 99.");
      return;
    }

    if (!dataEntrega) {
      setErro("Informe a data da entrega.");
      return;
    }

    try {
      let arquivoPayload:
        | {
            comprovanteNome: string;
            comprovanteMime: string;
            comprovanteTamanho: number;
            comprovanteBase64: string;
          }
        | {
            comprovanteNome: null;
            comprovanteMime: null;
            comprovanteTamanho: null;
            comprovanteBase64: null;
          };

      if (arquivo) {
        const comprovanteBase64 = await arquivoParaBase64(arquivo);
        arquivoPayload = {
          comprovanteNome: arquivo.name,
          comprovanteMime: arquivo.type,
          comprovanteTamanho: arquivo.size,
          comprovanteBase64,
        };
      } else {
        arquivoPayload = {
          comprovanteNome: null,
          comprovanteMime: null,
          comprovanteTamanho: null,
          comprovanteBase64: null,
        };
      }

      salvarMutation.mutate({
        lojaId,
        funcionarioId,
        item: itemEnvio,
        quantidade: quantidadeNumero,
        uniformeCamiseta: uniformeSelecionado ? uniformeQuantidades.camiseta : null,
        uniformeCalca: uniformeSelecionado ? uniformeQuantidades.calca : null,
        uniformeMoletom: uniformeSelecionado ? uniformeQuantidades.moletom : null,
        uniformeCamisa: uniformeSelecionado ? uniformeQuantidades.camisa : null,
        uniformeCamisetaPolo: uniformeSelecionado
          ? uniformeQuantidades.camisetaPolo
          : null,
        tamanho: uniformeSelecionado ? null : tamanho.trim() || null,
        dataEntrega,
        observacao: observacao.trim() || null,
        ...arquivoPayload,
      });
    } catch (error: any) {
      setErro(error?.message || "Não foi possível preparar o comprovante.");
    }
  }

  async function anexarComprovante(entrega: EntregaEpi, file: File | null) {
    if (!file) return;

    setErro("");
    setMensagem("");

    try {
      setAnexandoId(entrega.id);
      const comprovanteBase64 = await arquivoParaBase64(file);

      anexarMutation.mutate({
        id: entrega.id,
        lojaId: entrega.lojaId,
        comprovanteNome: file.name,
        comprovanteMime: file.type,
        comprovanteTamanho: file.size,
        comprovanteBase64,
      });
    } catch (error: any) {
      setAnexandoId(null);
      setErro(error?.message || "Não foi possível preparar o comprovante.");
    }
  }

  async function abrirComprovante(entrega: EntregaEpi) {
    setAbrindoId(entrega.id);
    setErro("");

    try {
      const resposta = await utils.rhEpis.arquivo.fetch({ id: entrega.id });
      const binario = atob(resposta.arquivoBase64);
      const bytes = new Uint8Array(binario.length);

      for (let i = 0; i < binario.length; i += 1) {
        bytes[i] = binario.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: resposta.arquivoMime });
      const url = URL.createObjectURL(blob);
      const novaAba = window.open(url, "_blank", "noopener,noreferrer");

      if (!novaAba) {
        const link = document.createElement("a");
        link.href = url;
        link.download = resposta.arquivoNome;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) {
      setErro(error?.message || "Não foi possível abrir o comprovante.");
    } finally {
      setAbrindoId(null);
    }
  }

  const destinoVoltar = caixaLider ? "/rh/meu-dia" : "/rh/gestao";

  if (!caixaLider && !liderRh && !adminOuGestor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <Card className="w-full max-w-lg border-rose-400/20 bg-[#0b0b0b]">
          <CardContent className="p-7 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-300" />
            <h1 className="mt-4 text-xl font-black">Acesso restrito</h1>
            <p className="mt-2 text-sm text-gray-400">Usuário sem acesso ao controle de EPIs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-[#D4AF37]/15 bg-[#080808]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(destinoVoltar)}
              className="h-10 w-10 shrink-0 rounded-xl border border-[#D4AF37]/20 p-0 text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8f8a80] sm:text-xs">
                Dossiê do colaborador
              </p>
              <h1 className="truncate text-xl font-black text-[#F2D675] sm:text-2xl">
                Entrega de EPIs
              </h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-3 py-2 text-xs text-[#b9a46a] sm:flex">
            <ShieldCheck className="h-4 w-4 text-[#F2D675]" />
            {caixaLider ? "Sua loja" : "Visão gerencial"}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-7 lg:px-8">
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.55fr]">
          <Card className="border-[#D4AF37]/20 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#080808]">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8f8a80]">
                    Nova entrega
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">Registrar EPI</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    Cada entrega gera um registro próprio e mantém todo o histórico do colaborador.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-3">
                  <PackageCheck className="h-6 w-6 text-[#F2D675]" />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                  {caixaLider ? (
                    <div className="flex h-11 items-center rounded-xl border border-white/[0.08] bg-black/30 px-3 text-sm font-bold text-white">
                      {lojas.find((loja) => loja.id === lojaUsuario)?.nome || `Loja ${lojaUsuario}`}
                    </div>
                  ) : (
                    <Select value={lojaEnvio} onValueChange={(valor) => { setLojaEnvio(valor); setFuncionarioEnvio(""); }}>
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                        <SelectValue placeholder="Selecione a loja" />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#111111] text-white">
                        {lojas.map((loja) => (
                          <SelectItem key={loja.id} value={String(loja.id)}>{loja.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Funcionário</label>
                  <Select value={funcionarioEnvio} onValueChange={setFuncionarioEnvio} disabled={!lojaEnvioNumero || funcionariosQuery.isLoading}>
                    <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                      <SelectValue placeholder={lojaEnvioNumero ? (funcionariosQuery.isLoading ? "Carregando funcionários..." : "Selecione o funcionário") : "Selecione primeiro a loja"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 border-white/10 bg-[#111111] text-white">
                      {funcionarios.map((funcionario: any) => (
                        <SelectItem key={funcionario.id} value={String(funcionario.id)}>{funcionario.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">EPI / item entregue</label>
                  <Select value={itemEnvio} onValueChange={(valor) => setItemEnvio(valor as ItemEpi)}>
                    <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#111111] text-white">
                      {ITENS_EPI.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs font-bold text-[#b9a46a]">
                    {prazoItem(itemEnvio)}
                  </p>
                </div>

                {itemEnvio === "uniforme" ? (
                  <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.035] p-4">
                    <div className="mb-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#F2D675]">
                        Peças do uniforme
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Todos os campos são obrigatórios. Informe 0 quando o colaborador não receber determinada peça.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-gray-400">Camiseta</label>
                        <input type="number" min={0} max={99} value={uniformeCamiseta} onChange={(event) => setUniformeCamiseta(event.target.value)} placeholder="0" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-gray-400">Calça</label>
                        <input type="number" min={0} max={99} value={uniformeCalca} onChange={(event) => setUniformeCalca(event.target.value)} placeholder="0" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-gray-400">Moletom</label>
                        <input type="number" min={0} max={99} value={uniformeMoletom} onChange={(event) => setUniformeMoletom(event.target.value)} placeholder="0" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-gray-400">Camisa</label>
                        <input type="number" min={0} max={99} value={uniformeCamisa} onChange={(event) => setUniformeCamisa(event.target.value)} placeholder="0" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-bold text-gray-400">Camiseta polo</label>
                        <input type="number" min={0} max={99} value={uniformeCamisetaPolo} onChange={(event) => setUniformeCamisetaPolo(event.target.value)} placeholder="0" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-gray-400">Quantidade</label>
                      <input type="number" min={1} max={99} value={quantidade} onChange={(event) => setQuantidade(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-gray-400">Tamanho / numeração</label>
                      <input value={tamanho} onChange={(event) => setTamanho(event.target.value)} placeholder="Opcional" maxLength={80} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Data da entrega</label>
                  <input type="date" value={dataEntrega} onChange={(event) => setDataEntrega(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Observação</label>
                  <textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Opcional" rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50" />
                </div>

                <label className="block cursor-pointer rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.035] p-4 transition hover:bg-[#D4AF37]/[0.07]">
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(event) => setArquivo(event.target.files?.[0] || null)} />
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.08] p-2.5">
                      <FileUp className="h-5 w-5 text-[#F2D675]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{arquivo
                        ? arquivo.name
                        : itemEnvio === "uniforme"
                        ? "Anexar ficha de uniforme assinada (obrigatório)"
                        : "Anexar termo assinado (opcional agora)"}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{itemEnvio === "uniforme"
                        ? "PDF ou foto • máximo 6 MB. A ficha assinada é obrigatória para uniforme."
                        : "PDF ou foto • máximo 6 MB. Sem anexo, a entrega fica com documento pendente."}</p>
                    </div>
                  </div>
                </label>

                {erro && <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-sm text-rose-200">{erro}</div>}
                {mensagem && <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{mensagem}</div>}

                <Button type="button" onClick={registrarEntrega} disabled={salvarMutation.isPending} className="h-12 w-full bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]">
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  {salvarMutation.isPending ? "Registrando..." : "Registrar entrega"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden border-[#D4AF37]/15 bg-[#0b0b0b]">
              <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-3">
                <div className="bg-[#090909] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Entregas</p><p className="mt-2 text-2xl font-black text-white">{resumo.entregas}</p><p className="mt-1 text-[11px] text-gray-600">no filtro atual</p></div>
                <div className="bg-[#090909] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Itens entregues</p><p className="mt-2 text-2xl font-black text-white">{resumo.quantidadeTotal}</p><p className="mt-1 text-[11px] text-gray-600">somando quantidades</p></div>
                <div className="bg-[#090909] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Colaboradores</p><p className="mt-2 text-2xl font-black text-white">{resumo.colaboradores}</p><p className="mt-1 text-[11px] text-gray-600">com entrega registrada</p></div>
                <div className="bg-[#090909] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Trocas vencidas</p><p className={`mt-2 text-2xl font-black ${resumo.vencidas > 0 ? "text-rose-300" : "text-emerald-300"}`}>{resumo.vencidas}</p><p className="mt-1 text-[11px] text-gray-600">necessitam nova entrega</p></div>
                <div className="bg-[#090909] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Próximos 7 dias</p><p className={`mt-2 text-2xl font-black ${resumo.proximas > 0 ? "text-amber-300" : "text-emerald-300"}`}>{resumo.proximas}</p><p className="mt-1 text-[11px] text-gray-600">trocas programadas</p></div>
                <div className="bg-[#090909] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">Termos pendentes</p><p className={`mt-2 text-2xl font-black ${resumo.pendentes > 0 ? "text-rose-300" : "text-emerald-300"}`}>{resumo.pendentes}</p><p className="mt-1 text-[11px] text-gray-600">aguardando comprovante</p></div>
              </div>
            </Card>

            <Card className="border-white/[0.08] bg-[#0b0b0b]">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[190px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                    <Select value={caixaLider ? String(lojaUsuario) : lojaConsulta} onValueChange={setLojaConsulta} disabled={caixaLider}>
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#111111] text-white">
                        {!caixaLider && <SelectItem value="todas">Todas as lojas</SelectItem>}
                        {lojas.map((loja) => <SelectItem key={loja.id} value={String(loja.id)}>{loja.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-[220px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">EPI</label>
                    <Select value={itemConsulta} onValueChange={setItemConsulta}>
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#111111] text-white">
                        <SelectItem value="todos">Todos os EPIs</SelectItem>
                        {ITENS_EPI.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative min-w-[240px] flex-[1.3]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar funcionário, EPI ou tamanho" className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-white">Histórico de entregas</h2>
                <p className="mt-1 text-sm text-gray-500">{entregasFiltradas.length} registro{entregasFiltradas.length === 1 ? "" : "s"} encontrado{entregasFiltradas.length === 1 ? "" : "s"}.</p>
              </div>
              <PackageCheck className="h-6 w-6 text-[#F2D675]" />
            </div>

            {entregasQuery.isLoading ? (
              <Card className="border-white/[0.08] bg-[#0b0b0b]"><CardContent className="p-6 text-sm text-gray-500">Carregando entregas...</CardContent></Card>
            ) : entregasQuery.error ? (
              <Card className="border-rose-400/20 bg-rose-400/[0.04]"><CardContent className="p-6 text-sm text-rose-200">Não foi possível carregar as entregas. {entregasQuery.error.message}</CardContent></Card>
            ) : entregasFiltradas.length === 0 ? (
              <Card className="border-white/[0.08] bg-[#0b0b0b]"><CardContent className="p-8 text-center"><FileText className="mx-auto h-8 w-8 text-gray-700" /><p className="mt-3 font-bold text-gray-300">Nenhuma entrega encontrada</p><p className="mt-1 text-sm text-gray-600">As entregas de EPI aparecerão aqui.</p></CardContent></Card>
            ) : (
              <div className="space-y-3">
                {entregasFiltradas.map((entrega) => (
                  <Card key={entrega.id} className={`bg-[#0b0b0b] ${entrega.comprovantePendente ? "border-amber-400/20" : "border-white/[0.08] hover:border-[#D4AF37]/20"}`}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <UserRound className="h-4 w-4 text-[#F2D675]" />
                            <p className="font-black text-white">{entrega.funcionarioNome}</p>
                            <span className="rounded-full border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-2 py-0.5 text-[10px] font-black text-[#F2D675]">{entrega.lojaNome}</span>
                            {entrega.comprovantePendente ? <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2 py-0.5 text-[10px] font-black text-amber-200">Termo pendente</span> : <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.05] px-2 py-0.5 text-[10px] font-black text-emerald-200">Completo</span>}
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusPrazo(entrega.proximaTroca).classe}`}>
                              {statusPrazo(entrega.proximaTroca).label}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-black text-gray-200">{labelItem(entrega.item)}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            {entrega.item === "uniforme" &&
                            [
                              entrega.uniformeCamiseta,
                              entrega.uniformeCalca,
                              entrega.uniformeMoletom,
                              entrega.uniformeCamisa,
                              entrega.uniformeCamisetaPolo,
                            ].some((valor) => valor !== null && valor !== undefined) ? (
                              <>
                                <span>Camiseta: {entrega.uniformeCamiseta ?? 0}</span>
                                <span>Calça: {entrega.uniformeCalca ?? 0}</span>
                                <span>Moletom: {entrega.uniformeMoletom ?? 0}</span>
                                <span>Camisa: {entrega.uniformeCamisa ?? 0}</span>
                                <span>Camiseta polo: {entrega.uniformeCamisetaPolo ?? 0}</span>
                                <span>Total: {entrega.quantidade}</span>
                              </>
                            ) : (
                              <span>Quantidade: {entrega.quantidade}</span>
                            )}
                            {entrega.tamanho && <span>Tamanho: {entrega.tamanho}</span>}
                            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Entrega: {formatarData(entrega.dataEntrega)}</span>
                            {entrega.proximaTroca && (
                              <span className="inline-flex items-center gap-1.5 text-[#b9a46a]">
                                Próxima troca: {formatarData(entrega.proximaTroca)}
                              </span>
                            )}
                          </div>
                          {entrega.observacao && <p className="mt-2 text-xs leading-5 text-gray-500">{entrega.observacao}</p>}
                          <p className="mt-2 text-[10px] text-gray-700">Registrado por {entrega.entreguePorNome || "Usuário"} • {formatarDataHora(entrega.criadoEm)}</p>
                          {!entrega.comprovantePendente && entrega.comprovanteNome && <p className="mt-1 text-[10px] text-[#b9a46a]">{entrega.comprovanteNome}{entrega.comprovanteTamanho ? ` • ${formatarTamanho(entrega.comprovanteTamanho)}` : ""}</p>}
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {entrega.comprovantePendente ? (
                            <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-4 text-sm font-bold text-amber-200 transition hover:bg-amber-400/[0.1]">
                              <FileUp className="mr-2 h-4 w-4" />
                              {anexandoId === entrega.id ? "Enviando..." : "Anexar termo"}
                              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" disabled={anexandoId === entrega.id} onChange={(event) => { const file = event.target.files?.[0] || null; void anexarComprovante(entrega, file); event.currentTarget.value = ""; }} />
                            </label>
                          ) : (
                            <Button type="button" variant="outline" onClick={() => void abrirComprovante(entrega)} disabled={abrindoId === entrega.id} className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]">
                              <Download className="mr-2 h-4 w-4" />{abrindoId === entrega.id ? "Abrindo..." : "Abrir termo"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
