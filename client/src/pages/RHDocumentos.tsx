import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  FileUp,
  Search,
  ShieldCheck,
  Trash2,
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

const TIPOS = [
  { value: "advertencia_avulsa", label: "Advertência avulsa" },
  { value: "adiantamento_assinado", label: "Folha de adiantamento assinada" },
  { value: "folha_pagamento_assinada", label: "Folha de pagamento assinada" },
  { value: "cartao_ponto_assinado", label: "Cartão-ponto assinado" },
] as const;

type TipoDocumento = (typeof TIPOS)[number]["value"];

type DocumentoRh = {
  id: number;
  lojaId: number;
  lojaNome: string;
  funcionarioId: number;
  funcionarioNome: string;
  funcionarioFuncao?: string | null;
  tipo: TipoDocumento;
  dataDocumento: string;
  competencia?: string | null;
  observacao?: string | null;
  arquivoNome: string;
  arquivoMime: string;
  arquivoTamanho: number;
  enviadoPorNome?: string | null;
  criadoEm?: string | null;
};

function hojeCivil() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate()
  ).padStart(2, "0")}`;
}

function labelTipo(tipo: string) {
  return TIPOS.find((item) => item.value === tipo)?.label || tipo;
}

function exigeCompetencia(tipo: string) {
  return tipo !== "advertencia_avulsa";
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

function formatarTamanho(bytes: number) {
  const valor = Number(bytes || 0);
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
    throw new Error("O documento deve ter no máximo 6 MB.");
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

export default function RHDocumentos() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const role = String(user?.role || "");
  const lojaUsuario = Number(user?.lojaId || 0);
  const caixaLider = role === "rh" && lojaUsuario > 0;
  const liderRh = role === "rh" && lojaUsuario <= 0;
  const adminOuGestor = role === "admin" || role === "gestor";

  const hoje = hojeCivil();
  const [lojaConsulta, setLojaConsulta] = useState(
    caixaLider ? String(lojaUsuario) : "todas"
  );
  const [tipoConsulta, setTipoConsulta] = useState("todos");
  const [funcionarioConsulta, setFuncionarioConsulta] = useState("todos");
  const [competenciaConsulta, setCompetenciaConsulta] = useState("");
  const [busca, setBusca] = useState("");

  const [lojaEnvio, setLojaEnvio] = useState(
    caixaLider ? String(lojaUsuario) : ""
  );
  const [funcionarioEnvio, setFuncionarioEnvio] = useState("");
  const [tipoEnvio, setTipoEnvio] = useState<TipoDocumento>("advertencia_avulsa");
  const [dataDocumento, setDataDocumento] = useState(hoje);
  const [competencia, setCompetencia] = useState(hoje.slice(0, 7));
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [abrindoId, setAbrindoId] = useState<number | null>(null);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);

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

  const lojaConsultaNumero = caixaLider
    ? lojaUsuario
    : lojaConsulta === "todas"
    ? 0
    : Number(lojaConsulta || 0);

  const funcionariosConsultaQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId: lojaConsultaNumero },
    {
      enabled: lojaConsultaNumero > 0,
      retry: false,
    }
  );

  const funcionariosConsulta = useMemo(
    () => ((funcionariosConsultaQuery.data || []) as Array<any>),
    [funcionariosConsultaQuery.data]
  );

  const documentosQuery = trpc.rhDocumentos.listar.useQuery(
    {
      lojaId:
        caixaLider
          ? lojaUsuario
          : lojaConsulta === "todas"
          ? null
          : Number(lojaConsulta),
      funcionarioId:
        funcionarioConsulta === "todos" ? null : Number(funcionarioConsulta),
      tipo: tipoConsulta === "todos" ? null : (tipoConsulta as TipoDocumento),
      competencia: competenciaConsulta || null,
      dataInicio: null,
      dataFim: null,
    },
    { retry: false }
  );

  const documentos = useMemo(
    () => ((documentosQuery.data || []) as DocumentoRh[]),
    [documentosQuery.data]
  );

  const documentosFiltrados = useMemo(() => {
    const alvo = normalizarTexto(busca);
    if (!alvo) return documentos;

    return documentos.filter((documento) =>
      [
        documento.funcionarioNome,
        documento.lojaNome,
        documento.arquivoNome,
        labelTipo(documento.tipo),
        documento.competencia,
      ].some((valor) => normalizarTexto(valor).includes(alvo))
    );
  }, [documentos, busca]);

  const resumo = useMemo(() => {
    const contador = new Map<string, number>();
    for (const documento of documentos) {
      contador.set(documento.tipo, (contador.get(documento.tipo) || 0) + 1);
    }
    return contador;
  }, [documentos]);

  const salvarMutation = trpc.rhDocumentos.salvar.useMutation({
    onSuccess: async () => {
      setErro("");
      setMensagem("Documento arquivado com sucesso.");
      setArquivo(null);
      setObservacao("");
      setFuncionarioEnvio("");
      await utils.rhDocumentos.listar.invalidate();
    },
    onError: (error) => {
      setMensagem("");
      setErro(error.message || "Não foi possível salvar o documento.");
    },
  });

  const excluirDocumentoMutation = trpc.rhDocumentos.excluir.useMutation({
    onSuccess: async () => {
      setExcluindoId(null);
      setErro("");
      setMensagem("Documento excluído com sucesso.");
      await utils.rhDocumentos.listar.invalidate();
    },
    onError: (error) => {
      setExcluindoId(null);
      setMensagem("");
      setErro(error.message || "Não foi possível excluir o documento.");
    },
  });

  async function salvarDocumento() {
    setErro("");
    setMensagem("");

    const lojaId = caixaLider ? lojaUsuario : Number(lojaEnvio || 0);
    const funcionarioId = Number(funcionarioEnvio || 0);

    if (!lojaId) {
      setErro("Selecione a loja.");
      return;
    }

    if (!funcionarioId) {
      setErro("Selecione o funcionário.");
      return;
    }

    if (!dataDocumento) {
      setErro("Informe a data do documento.");
      return;
    }

    if (exigeCompetencia(tipoEnvio) && !competencia) {
      setErro("Informe a competência do documento.");
      return;
    }

    if (!arquivo) {
      setErro("Selecione o PDF ou a foto assinada.");
      return;
    }

    try {
      const arquivoBase64 = await arquivoParaBase64(arquivo);

      salvarMutation.mutate({
        lojaId,
        funcionarioId,
        tipo: tipoEnvio,
        dataDocumento,
        competencia: exigeCompetencia(tipoEnvio) ? competencia : null,
        observacao: observacao.trim() || null,
        arquivoNome: arquivo.name,
        arquivoMime: arquivo.type,
        arquivoTamanho: arquivo.size,
        arquivoBase64,
      });
    } catch (error: any) {
      setErro(error?.message || "Não foi possível preparar o documento.");
    }
  }

  function excluirDocumento(documento: DocumentoRh) {
    const confirmou = window.confirm(
      [
        "Esta ação excluirá permanentemente este documento.",
        "",
        `Funcionário: ${documento.funcionarioNome}`,
        `Documento: ${labelTipo(documento.tipo)}`,
        `Arquivo: ${documento.arquivoNome}`,
        "",
        "Essa ação não pode ser desfeita. Deseja continuar?",
      ].join("\n")
    );

    if (!confirmou) return;

    setErro("");
    setMensagem("");
    setExcluindoId(documento.id);

    excluirDocumentoMutation.mutate({
      id: documento.id,
    });
  }

  async function abrirDocumento(documento: DocumentoRh) {
    setAbrindoId(documento.id);
    setErro("");

    try {
      const resposta = await utils.rhDocumentos.arquivo.fetch({ id: documento.id });
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
      setErro(error?.message || "Não foi possível abrir o documento.");
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
            <p className="mt-2 text-sm text-gray-400">Usuário sem acesso aos Documentos RH.</p>
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
                Documentos RH
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
                    Novo arquivo
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">Arquivar documento</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    Advertências avulsas e documentos assinados ficam vinculados ao funcionário.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.07] p-3">
                  <Archive className="h-6 w-6 text-[#F2D675]" />
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
                    <Select
                      value={lojaEnvio}
                      onValueChange={(valor) => {
                        setLojaEnvio(valor);
                        setFuncionarioEnvio("");
                      }}
                    >
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                        <SelectValue placeholder="Selecione a loja" />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#111111] text-white">
                        {lojas.map((loja) => (
                          <SelectItem key={loja.id} value={String(loja.id)}>
                            {loja.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Funcionário</label>
                  <Select
                    value={funcionarioEnvio}
                    onValueChange={setFuncionarioEnvio}
                    disabled={!lojaEnvioNumero || funcionariosQuery.isLoading}
                  >
                    <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                      <SelectValue
                        placeholder={
                          lojaEnvioNumero
                            ? funcionariosQuery.isLoading
                              ? "Carregando funcionários..."
                              : "Selecione o funcionário"
                            : "Selecione primeiro a loja"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 border-white/10 bg-[#111111] text-white">
                      {funcionarios.map((funcionario: any) => (
                        <SelectItem key={funcionario.id} value={String(funcionario.id)}>
                          {funcionario.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Tipo de documento</label>
                  <Select
                    value={tipoEnvio}
                    onValueChange={(valor) => setTipoEnvio(valor as TipoDocumento)}
                  >
                    <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#111111] text-white">
                      {TIPOS.map((tipo) => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Data do documento</label>
                    <input
                      type="date"
                      value={dataDocumento}
                      onChange={(event) => setDataDocumento(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">
                      Competência {exigeCompetencia(tipoEnvio) ? "*" : "(opcional)"}
                    </label>
                    <input
                      type="month"
                      value={competencia}
                      onChange={(event) => setCompetencia(event.target.value)}
                      disabled={!exigeCompetencia(tipoEnvio)}
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none disabled:opacity-40 focus:border-[#D4AF37]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-400">Observação</label>
                  <textarea
                    value={observacao}
                    onChange={(event) => setObservacao(event.target.value)}
                    placeholder="Opcional"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50"
                  />
                </div>

                <label className="block cursor-pointer rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.035] p-4 transition hover:bg-[#D4AF37]/[0.07]">
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(event) => setArquivo(event.target.files?.[0] || null)}
                  />
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.08] p-2.5">
                      <FileUp className="h-5 w-5 text-[#F2D675]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {arquivo ? arquivo.name : "Selecionar PDF ou foto"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        PDF, JPG, PNG, WEBP ou HEIC • máximo 6 MB
                      </p>
                    </div>
                  </div>
                </label>

                {erro && (
                  <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-sm text-rose-200">
                    {erro}
                  </div>
                )}

                {mensagem && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2.5 text-sm text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {mensagem}
                  </div>
                )}

                <Button
                  type="button"
                  onClick={salvarDocumento}
                  disabled={salvarMutation.isPending}
                  className="h-12 w-full bg-[#D4AF37] font-black text-black hover:bg-[#E6C760]"
                >
                  <FileCheck2 className="mr-2 h-4 w-4" />
                  {salvarMutation.isPending ? "Arquivando..." : "Arquivar documento"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden border-[#D4AF37]/15 bg-[#0b0b0b]">
              <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-4">
                {TIPOS.map((tipo) => (
                  <div key={tipo.value} className="bg-[#090909] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-600">
                      {tipo.label}
                    </p>
                    <p className="mt-2 text-2xl font-black text-white">
                      {resumo.get(tipo.value) || 0}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-600">no filtro atual</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-white/[0.08] bg-[#0b0b0b]">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[190px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Loja</label>
                    <Select
                      value={caixaLider ? String(lojaUsuario) : lojaConsulta}
                      onValueChange={(valor) => {
                        setLojaConsulta(valor);
                        setFuncionarioConsulta("todos");
                      }}
                      disabled={caixaLider}
                    >
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#111111] text-white">
                        {!caixaLider && <SelectItem value="todas">Todas as lojas</SelectItem>}
                        {lojas.map((loja) => (
                          <SelectItem key={loja.id} value={String(loja.id)}>
                            {loja.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-[220px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Funcionário</label>
                    <Select
                      value={funcionarioConsulta}
                      onValueChange={setFuncionarioConsulta}
                      disabled={!lojaConsultaNumero || funcionariosConsultaQuery.isLoading}
                    >
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                        <SelectValue
                          placeholder={
                            lojaConsultaNumero
                              ? funcionariosConsultaQuery.isLoading
                                ? "Carregando funcionários..."
                                : "Todos os funcionários"
                              : "Selecione uma loja"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 border-white/10 bg-[#111111] text-white">
                        <SelectItem value="todos">Todos os funcionários</SelectItem>
                        {funcionariosConsulta.map((funcionario: any) => (
                          <SelectItem key={funcionario.id} value={String(funcionario.id)}>
                            {funcionario.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!lojaConsultaNumero && (
                      <p className="mt-1 text-[11px] text-gray-600">
                        Selecione uma loja para filtrar por funcionário.
                      </p>
                    )}
                  </div>

                  <div className="min-w-[220px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Tipo</label>
                    <Select value={tipoConsulta} onValueChange={setTipoConsulta}>
                      <SelectTrigger className="h-11 border-white/10 bg-black/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#111111] text-white">
                        <SelectItem value="todos">Todos os documentos</SelectItem>
                        {TIPOS.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-[190px] flex-1">
                    <label className="mb-1.5 block text-xs font-bold text-gray-400">Competência</label>
                    <div className="flex gap-2">
                      <input
                        type="month"
                        value={competenciaConsulta}
                        onChange={(event) => setCompetenciaConsulta(event.target.value)}
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#D4AF37]/45"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCompetenciaConsulta("")}
                        disabled={!competenciaConsulta}
                        className="h-11 shrink-0 border-white/10 bg-black/20 px-3 text-xs font-bold text-gray-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-35"
                      >
                        Todas
                      </Button>
                    </div>
                  </div>

                  <div className="relative min-w-[240px] flex-[1.3]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      value={busca}
                      onChange={(event) => setBusca(event.target.value)}
                      placeholder="Buscar funcionário, arquivo ou competência"
                      className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/45"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-white">Histórico de documentos</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {documentosFiltrados.length} documento{documentosFiltrados.length === 1 ? "" : "s"} encontrado{documentosFiltrados.length === 1 ? "" : "s"}.
                </p>
              </div>
              <Archive className="h-6 w-6 text-[#F2D675]" />
            </div>

            {documentosQuery.isLoading ? (
              <Card className="border-white/[0.08] bg-[#0b0b0b]">
                <CardContent className="p-6 text-sm text-gray-500">Carregando documentos...</CardContent>
              </Card>
            ) : documentosQuery.error ? (
              <Card className="border-rose-400/20 bg-rose-400/[0.04]">
                <CardContent className="p-6 text-sm text-rose-200">
                  Não foi possível carregar os documentos. {documentosQuery.error.message}
                </CardContent>
              </Card>
            ) : documentosFiltrados.length === 0 ? (
              <Card className="border-white/[0.08] bg-[#0b0b0b]">
                <CardContent className="p-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-gray-700" />
                  <p className="mt-3 font-bold text-gray-300">Nenhum documento encontrado</p>
                  <p className="mt-1 text-sm text-gray-600">Os documentos arquivados aparecerão aqui.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {documentosFiltrados.map((documento) => (
                  <Card key={documento.id} className="border-white/[0.08] bg-[#0b0b0b] hover:border-[#D4AF37]/20">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <UserRound className="h-4 w-4 text-[#F2D675]" />
                            <p className="font-black text-white">{documento.funcionarioNome}</p>
                            <span className="rounded-full border border-[#D4AF37]/15 bg-[#D4AF37]/[0.04] px-2 py-0.5 text-[10px] font-black text-[#F2D675]">
                              {documento.lojaNome}
                            </span>
                          </div>

                          <p className="mt-2 text-sm font-bold text-gray-300">{labelTipo(documento.tipo)}</p>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {formatarData(documento.dataDocumento)}
                            </span>
                            {documento.competencia && <span>Competência: {documento.competencia.split("-").reverse().join("/")}</span>}
                            <span>{formatarTamanho(documento.arquivoTamanho)}</span>
                          </div>

                          {documento.observacao && (
                            <p className="mt-2 text-xs leading-5 text-gray-500">{documento.observacao}</p>
                          )}

                          <p className="mt-2 truncate text-[11px] text-[#b9a46a]">
                            {documento.arquivoNome}
                          </p>
                          <p className="mt-1 text-[10px] text-gray-700">
                            Arquivado por {documento.enviadoPorNome || "Usuário"} • {formatarDataHora(documento.criadoEm)}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void abrirDocumento(documento)}
                            disabled={
                              abrindoId === documento.id ||
                              excluindoId === documento.id
                            }
                            className="border-[#D4AF37]/25 bg-[#D4AF37]/[0.04] text-[#F2D675] hover:bg-[#D4AF37]/10 hover:text-[#F2D675]"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {abrindoId === documento.id ? "Abrindo..." : "Abrir arquivo"}
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => excluirDocumento(documento)}
                            disabled={
                              excluindoId === documento.id ||
                              abrindoId === documento.id
                            }
                            className="border-rose-400/25 bg-rose-400/[0.04] text-rose-200 hover:bg-rose-400/[0.1] hover:text-rose-100"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {excluindoId === documento.id
                              ? "Excluindo..."
                              : "Excluir documento"}
                          </Button>
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
