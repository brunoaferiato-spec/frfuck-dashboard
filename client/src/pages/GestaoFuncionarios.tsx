import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";


const IMPORT_PENDENTE_STORAGE_KEY = "folha-importacao-pendente-v1";
const IMPORT_ADIANT_PENDENTE_STORAGE_KEY = "folha-importacao-adiant-pendente-v1";
const IMPORT_HOLERITE_PENDENTE_STORAGE_KEY = "folha-importacao-holerite-pendente-v1";
const TROCA_FUNCAO_SUGERIDA_STORAGE_KEY = "folha-troca-funcao-sugerida-v1";
const CADASTRO_RETORNO_FOLHA_STORAGE_KEY = "folha-cadastro-retorno-v1";
const CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY = "folha-cadastro-concluido-v1";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "São Leopoldo" },
  { id: 7, nome: "Gravataí" },
];

const FUNCOES = [
  { id: "mecanico", nome: "Mecânico" },
  { id: "vendedor", nome: "Vendedor" },
  { id: "consultor_vendas", nome: "Consultor de Vendas" },
  { id: "alinhador", nome: "Alinhador" },
  { id: "aux_alinhador", nome: "Aux. Alinhador" },
  { id: "recepcionista", nome: "Recepcionista" },
  { id: "auxiliar_estoque", nome: "Auxiliar de Estoque" },
  { id: "lider_estoque", nome: "Líder de Estoque" },
  { id: "auxiliar_mecanico", nome: "Auxiliar de Mecânico" },
  { id: "auxiliar_limpeza", nome: "Auxiliar Limpeza" },
  { id: "caixa", nome: "Caixa" },
  { id: "caixa_lider", nome: "Caixa Líder" },
  { id: "administrativo", nome: "Administrativo" },
  { id: "gerente", nome: "Gerente" },
  { id: "supervisor", nome: "Supervisor" },
] as const;

const FUNCOES_ACI_IDS = [
  "administrativo",
  "consultor_vendas",
  "supervisor",
] as const;

type FuncaoId = (typeof FUNCOES)[number]["id"];
type TipoMeta = "meta1" | "meta2" | "";

type FuncionarioItem = {
  id: number;
  lojaId: number;
  nome: string;
  cpf?: string | null;
  pix?: string | null;
  dataNascimento?: string | Date | null;
  funcao: FuncaoId;
  tipoMeta?: TipoMeta | null;
  dataAdmissao?: string | Date | null;
  dataDesligamento?: string | Date | null;
  dataReativacao?: string | Date | null;
  status?: string | null;
};

type FormFuncionario = {
  nome: string;
  cpf: string;
  pix: string;
  dataNascimento: string;
  funcao: FuncaoId;
  tipoMeta: TipoMeta;
  dataAdmissao: string;
};

type TrocaFuncaoItem = {
  id: number;
  funcionarioId: number;
  lojaId: number;
  funcaoAnterior: FuncaoId;
  funcaoNova: FuncaoId;
  tipoMetaAnterior?: string | null;
  tipoMetaNovo?: string | null;
  dataMudanca: string | Date;
  usuarioNome?: string | null;
  criadoEm?: string | Date | null;
  ultimaDataAnterior?: string | Date | null;
  ultimaDataNova?: string | Date | null;
  corrigidoPor?: string | null;
  corrigidoEm?: string | Date | null;
};

function hojeInput() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function criarFormVazio(lojaId?: number): FormFuncionario {
  const ehAci = Number(lojaId) === 5;

  return {
    nome: "",
    cpf: "",
    pix: "",
    dataNascimento: "",
    funcao: ehAci ? "administrativo" : "mecanico",
    tipoMeta: "",
    dataAdmissao: hojeInput(),
  };
}

/**
 * Lê a parte YYYY-MM-DD sem aplicar conversão de fuso horário.
 * Isso evita aniversário/admissão mudarem um dia ao abrir a edição.
 */
function formatDateInput(value: string | Date | null | undefined) {
  if (!value) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDateBR(value: string | Date | null | undefined) {
  const input = formatDateInput(value);
  if (!input) return "-";

  const [ano, mes, dia] = input.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Meio-dia UTC mantém a data civil estável durante serialização tRPC/Date.
 */
function dateFromInput(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function labelFuncao(funcao: string, lojaId?: number) {
  if (Number(lojaId) === 5 && funcao === "supervisor") {
    return "Supervisora de Consultor de Vendas - PJ";
  }

  return FUNCOES.find((item) => item.id === funcao)?.nome ?? funcao;
}

export default function GestaoFuncionarios() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [selectedLoja, setSelectedLoja] = useState(() => {
    if (typeof window === "undefined") return "1";

    const lojaCadastroExistente = window.sessionStorage.getItem(
      "folha-funcionario-abrir-loja-id"
    );
    if (lojaCadastroExistente) return lojaCadastroExistente;

    try {
      const cadastroSugeridoRaw = window.sessionStorage.getItem(
        "folha-cadastro-sugerido"
      );
      if (cadastroSugeridoRaw) {
        const cadastroSugerido = JSON.parse(cadastroSugeridoRaw);
        if (cadastroSugerido?.lojaId) return String(cadastroSugerido.lojaId);
      }
    } catch (error) {
      console.error("Erro ao ler loja sugerida para cadastro:", error);
    }

    return "1";
  });
  const [funcionarioAbrirId, setFuncionarioAbrirId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem("folha-funcionario-abrir-id");
    const id = raw ? Number(raw) : 0;
    return Number.isFinite(id) && id > 0 ? id : null;
  });
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [buscaFuncionario, setBuscaFuncionario] = useState("");
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [formData, setFormData] = useState<FormFuncionario>(() => criarFormVazio(1));
  const [trocaFuncaoOpen, setTrocaFuncaoOpen] = useState(false);
  const [trocaFuncaoForm, setTrocaFuncaoForm] = useState<{
    novaFuncao: FuncaoId | "";
    novoTipoMeta: TipoMeta;
    dataMudanca: string;
  }>({ novaFuncao: "", novoTipoMeta: "", dataMudanca: "" });
  const [correcaoTrocaId, setCorrecaoTrocaId] = useState<number | null>(null);
  const [correcaoTrocaData, setCorrecaoTrocaData] = useState("");

  const lojaId = Number(selectedLoja);

  const veioDaFolha = () => {
    if (typeof window === "undefined") return false;

    return Boolean(
      window.sessionStorage.getItem(CADASTRO_RETORNO_FOLHA_STORAGE_KEY) ||
        window.sessionStorage.getItem(IMPORT_PENDENTE_STORAGE_KEY) ||
        window.sessionStorage.getItem(IMPORT_ADIANT_PENDENTE_STORAGE_KEY) ||
        window.sessionStorage.getItem(IMPORT_HOLERITE_PENDENTE_STORAGE_KEY)
    );
  };

  const voltarParaFolhaSeNecessario = () => {
    if (veioDaFolha()) {
      navigate("/folha-pagamento");
      return true;
    }

    return false;
  };

  const funcionariosQuery = trpc.funcionarios.listByLoja.useQuery(
    { lojaId },
    {
      enabled: !!lojaId,
      retry: false,
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
    }
  );

  const trocasFuncionarioQuery = trpc.funcionarios.trocasByFuncionario.useQuery(
    { funcionarioId: Number(editingId || 0), lojaId },
    {
      enabled: !!editingId && !!lojaId,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  const fecharFormulario = () => {
    setIsOpen(false);
    setEditingId(null);
    setTentouSalvar(false);
    setTrocaFuncaoOpen(false);
    setTrocaFuncaoForm({ novaFuncao: "", novoTipoMeta: "", dataMudanca: "" });
    setCorrecaoTrocaId(null);
    setCorrecaoTrocaData("");
    setFormData(criarFormVazio(lojaId));
  };

  const createFuncionario = trpc.funcionarios.create.useMutation({
    onSuccess: async () => {
      await utils.funcionarios.listByLoja.invalidate({ lojaId });
      fecharFormulario();
    },
  });

  const updateFuncionario = trpc.funcionarios.update.useMutation({
    onSuccess: async () => {
      await utils.funcionarios.listByLoja.invalidate({ lojaId });
      fecharFormulario();
    },
  });

  const trocarFuncaoMutation = trpc.funcionarios.trocarFuncao.useMutation({
    onSuccess: async (_result, variables) => {
      await utils.funcionarios.listByLoja.invalidate({ lojaId });
      await funcionariosQuery.refetch();
      await trocasFuncionarioQuery.refetch();
      setFormData((prev) => ({
        ...prev,
        funcao: variables.novaFuncao as FuncaoId,
        tipoMeta:
          variables.novaFuncao === "consultor_vendas"
            ? ((variables.novoTipoMeta || "") as TipoMeta)
            : "",
      }));
      setTrocaFuncaoOpen(false);
      setTrocaFuncaoForm({ novaFuncao: "", novoTipoMeta: "", dataMudanca: "" });
    },
  });

  const corrigirDataTrocaMutation = trpc.funcionarios.corrigirDataTroca.useMutation({
    onSuccess: async () => {
      await trocasFuncionarioQuery.refetch();
      setCorrecaoTrocaId(null);
      setCorrecaoTrocaData("");
      alert("Data da troca de função corrigida com sucesso.");
    },
  });

  const inativarFuncionario = trpc.funcionarios.inativar.useMutation({
    onSuccess: async () => {
      await utils.funcionarios.listByLoja.invalidate({ lojaId });
    },
  });

  const reativarFuncionario = trpc.funcionarios.reativar.useMutation({
    onSuccess: async () => {
      await utils.funcionarios.listByLoja.invalidate({ lojaId });
    },
  });

  const excluirMutation = trpc.funcionarios.excluir.useMutation({
    onSuccess: async () => {
      await funcionariosQuery.refetch();
    },
  });

  const lojaNome = useMemo(() => {
    return LOJAS.find((l) => l.id === lojaId)?.nome ?? "Loja";
  }, [lojaId]);

  const funcoesDisponiveis = useMemo(() => {
    if (lojaId !== 5) return FUNCOES;

    return FUNCOES.filter((funcao) =>
      (FUNCOES_ACI_IDS as readonly string[]).includes(funcao.id)
    );
  }, [lojaId]);

  const camposInvalidos = useMemo(() => {
    return {
      nome: !formData.nome.trim(),
      cpf: !formData.cpf.trim(),
      pix: !formData.pix.trim(),
      dataNascimento: !formData.dataNascimento,
      funcao: !formData.funcao,
      tipoMeta:
        formData.funcao === "consultor_vendas" && !formData.tipoMeta,
      dataAdmissao: !formData.dataAdmissao,
    };
  }, [formData]);

  const formValido = !Object.values(camposInvalidos).some(Boolean);

  const classeCampo = (invalido: boolean) =>
    `h-11 w-full rounded-xl border bg-[#0b0b0b] px-3 text-sm text-white outline-none transition-all duration-200 placeholder:text-white/25 ${
      tentouSalvar && invalido
        ? "border-red-500/70 ring-1 ring-red-500/15 focus:border-red-400"
        : "border-white/[0.08] hover:border-[#D4AF37]/25 focus:border-[#D4AF37]/55 focus:ring-2 focus:ring-[#D4AF37]/10"
    }`;

  const handleOpenCreate = () => {
    setEditingId(null);
    setTentouSalvar(false);
    setFormData(criarFormVazio(lojaId));
    setIsOpen(true);
  };

  const handleEditFuncionario = (func: FuncionarioItem) => {
    setEditingId(func.id);
    setTentouSalvar(false);
    setFormData({
      nome: func.nome || "",
      cpf: func.cpf || "",
      pix: func.pix || "",
      dataNascimento: formatDateInput(func.dataNascimento),
      funcao: func.funcao,
      tipoMeta:
        lojaId === 5 && func.funcao === "consultor_vendas"
          ? "meta2"
          : (func.tipoMeta as TipoMeta) || "",
      dataAdmissao: formatDateInput(func.dataAdmissao),
    });
    setIsOpen(true);
  };

  const abrirTrocaFuncao = (func: FuncionarioItem, sugerida?: FuncaoId | "") => {
    const novaFuncaoSugerida =
      sugerida && sugerida !== func.funcao ? sugerida : "";

    setTrocaFuncaoForm({
      novaFuncao: novaFuncaoSugerida,
      novoTipoMeta:
        novaFuncaoSugerida === "consultor_vendas" && lojaId === 5 ? "meta2" : "",
      dataMudanca: "",
    });
    setTrocaFuncaoOpen(true);
  };

  const confirmarTrocaFuncao = async () => {
    if (!funcionarioEmEdicao) return;

    if (!trocaFuncaoForm.novaFuncao) {
      alert("Selecione a nova função.");
      return;
    }

    if (trocaFuncaoForm.novaFuncao === funcionarioEmEdicao.funcao) {
      alert("Selecione uma função diferente da função atual.");
      return;
    }

    if (!trocaFuncaoForm.dataMudanca) {
      alert("Informe a data efetiva da troca de função.");
      return;
    }

    if (
      trocaFuncaoForm.novaFuncao === "consultor_vendas" &&
      lojaId !== 5 &&
      !trocaFuncaoForm.novoTipoMeta
    ) {
      alert("Selecione o tipo de meta / comissão da nova função.");
      return;
    }

    const confirmar = window.confirm(
      `Confirmar troca de função de ${funcionarioEmEdicao.nome}?\n\n` +
        `${labelFuncao(funcionarioEmEdicao.funcao, lojaId)} → ${labelFuncao(
          trocaFuncaoForm.novaFuncao,
          lojaId
        )}\n` +
        `Válida a partir de ${formatDateBR(trocaFuncaoForm.dataMudanca)}.\n\n` +
        `O histórico será preservado e a folha da competência poderá aplicar cálculo proporcional quando necessário.`
    );

    if (!confirmar) return;

    try {
      await trocarFuncaoMutation.mutateAsync({
        id: Number(funcionarioEmEdicao.id),
        lojaId,
        novaFuncao: trocaFuncaoForm.novaFuncao,
        novoTipoMeta:
          trocaFuncaoForm.novaFuncao === "consultor_vendas"
            ? lojaId === 5
              ? "meta2"
              : (trocaFuncaoForm.novoTipoMeta as "meta1" | "meta2")
            : null,
        dataMudanca: dateFromInput(trocaFuncaoForm.dataMudanca),
      });

      if (!voltarParaFolhaSeNecessario()) {
        setBuscaFuncionario(funcionarioEmEdicao.nome || "");
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erro ao trocar a função do funcionário");
    }
  };

  const abrirCorrecaoDataTroca = (troca: TrocaFuncaoItem) => {
    setCorrecaoTrocaId(Number(troca.id));
    setCorrecaoTrocaData(formatDateInput(troca.dataMudanca));
  };

  const confirmarCorrecaoDataTroca = async (troca: TrocaFuncaoItem) => {
    if (!funcionarioEmEdicao) return;

    if (!correcaoTrocaData) {
      alert("Informe a data correta da troca de função.");
      return;
    }

    const dataAtual = formatDateInput(troca.dataMudanca);
    if (dataAtual === correcaoTrocaData) {
      alert("A nova data é igual à data já registrada.");
      return;
    }

    const confirmar = window.confirm(
      `Corrigir a data desta troca de função?\n\n` +
        `${labelFuncao(troca.funcaoAnterior, lojaId)} → ${labelFuncao(
          troca.funcaoNova,
          lojaId
        )}\n` +
        `De: ${formatDateBR(dataAtual)}\n` +
        `Para: ${formatDateBR(correcaoTrocaData)}\n\n` +
        `A função atual não será alterada. A correção ficará registrada no histórico.`
    );

    if (!confirmar) return;

    try {
      await corrigirDataTrocaMutation.mutateAsync({
        trocaFuncaoId: Number(troca.id),
        funcionarioId: Number(funcionarioEmEdicao.id),
        lojaId,
        novaData: dateFromInput(correcaoTrocaData),
      });
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erro ao corrigir a data da troca de função");
    }
  };

  const handleInativarFuncionario = async (func: FuncionarioItem) => {
    const data = prompt(
      `Digite a data de desligamento de ${func.nome}\nFormato: 2026-05-01`,
      hojeInput()
    );

    if (!data) return;

    try {
      await inativarFuncionario.mutateAsync({
        id: func.id,
        dataDesligamento: dateFromInput(data),
      });

      if (!voltarParaFolhaSeNecessario()) {
        fecharFormulario();
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erro ao inativar funcionário");
    }
  };

  const handleReativarFuncionario = async (func: FuncionarioItem) => {
    const data = prompt(
      `Digite a data de reativação de ${func.nome}\nFormato: 2026-08-01`,
      hojeInput()
    );

    if (!data) return;

    try {
      await reativarFuncionario.mutateAsync({
        id: func.id,
        dataReativacao: dateFromInput(data),
      });

      if (!voltarParaFolhaSeNecessario()) {
        fecharFormulario();
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erro ao reativar funcionário");
    }
  };

  const handleSaveFuncionario = async () => {
    setTentouSalvar(true);

    if (!formValido) {
      const faltando: string[] = [];
      if (camposInvalidos.nome) faltando.push("Nome completo");
      if (camposInvalidos.cpf) faltando.push("CPF");
      if (camposInvalidos.pix) faltando.push("PIX");
      if (camposInvalidos.dataNascimento) faltando.push("Data de aniversário");
      if (camposInvalidos.funcao) faltando.push("Função");
      if (camposInvalidos.tipoMeta) faltando.push("Tipo de meta / comissão");
      if (camposInvalidos.dataAdmissao) faltando.push("Data de admissão");

      alert(
        `Preencha todos os campos obrigatórios antes de salvar:\n\n- ${faltando.join(
          "\n- "
        )}`
      );
      return;
    }

    try {
      const payload = {
        lojaId,
        nome: formData.nome.trim(),
        cpf: formData.cpf.trim(),
        pix: formData.pix.trim(),
        dataNascimento: dateFromInput(formData.dataNascimento),
        funcao: editingId && funcionarioEmEdicao ? funcionarioEmEdicao.funcao : formData.funcao,
        tipoMeta:
          (editingId && funcionarioEmEdicao ? funcionarioEmEdicao.funcao : formData.funcao) === "consultor_vendas"
            ? lojaId === 5
              ? "meta2"
              : (formData.tipoMeta as "meta1" | "meta2")
            : null,
        dataAdmissao: dateFromInput(formData.dataAdmissao),
      };

      if (editingId) {
        await updateFuncionario.mutateAsync({ id: editingId, ...payload });
        voltarParaFolhaSeNecessario();
        return;
      }

      const retornoCadastroRaw =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem(CADASTRO_RETORNO_FOLHA_STORAGE_KEY)
          : null;

      let retornoCadastro: any = null;
      if (retornoCadastroRaw) {
        try {
          retornoCadastro = JSON.parse(retornoCadastroRaw);
        } catch (error) {
          console.error("Erro ao ler contexto de retorno para a folha:", error);
        }
      }

      const resultadoCadastro = await createFuncionario.mutateAsync(payload);
      const funcionarioCriado = (resultadoCadastro as any)?.funcionario || null;

      if (
        ["importacao-semanal", "importacao-holerite"].includes(
          String(retornoCadastro?.origem || "")
        ) &&
        funcionarioCriado?.id &&
        typeof window !== "undefined"
      ) {
        window.sessionStorage.setItem(
          CADASTRO_CONCLUIDO_FOLHA_STORAGE_KEY,
          JSON.stringify({
            ...retornoCadastro,
            funcionarioId: Number(funcionarioCriado.id),
            funcionarioNome: funcionarioCriado.nome || payload.nome,
            funcionarioFuncao: funcionarioCriado.funcao || payload.funcao,
          })
        );
        window.sessionStorage.removeItem(CADASTRO_RETORNO_FOLHA_STORAGE_KEY);
        navigate("/folha-pagamento");
        return;
      }

      voltarParaFolhaSeNecessario();
    } catch (error: any) {
      console.error(error);
      alert(error?.message ?? "Erro ao salvar funcionário");
    }
  };

  const funcionariosBase = (funcionariosQuery.data ?? []) as FuncionarioItem[];

  const funcionarioEmEdicao = editingId
    ? funcionariosBase.find((item) => Number(item.id) === Number(editingId)) || null
    : null;

  const historicoTrocas = (trocasFuncionarioQuery.data ?? []) as TrocaFuncaoItem[];

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.sessionStorage.getItem("folha-cadastro-sugerido");
    if (!raw) return;

    try {
      const sugerido = JSON.parse(raw);
      const lojaSugerida = Number(sugerido?.lojaId || 0);
      const funcaoSugerida = String(sugerido?.funcao || "") as FuncaoId;
      const funcaoExiste = FUNCOES.some((funcao) => funcao.id === funcaoSugerida);
      const ehAci = lojaSugerida === 5;
      const funcaoPermitidaNaAci = (FUNCOES_ACI_IDS as readonly string[]).includes(
        funcaoSugerida
      );

      if (lojaSugerida > 0) {
        setSelectedLoja(String(lojaSugerida));
      }

      const formBase = criarFormVazio(lojaSugerida || 1);
      const funcaoFinal =
        funcaoExiste && (!ehAci || funcaoPermitidaNaAci)
          ? funcaoSugerida
          : formBase.funcao;

      setEditingId(null);
      setTentouSalvar(false);
      setBuscaFuncionario("");
      setFormData({
        ...formBase,
        nome: String(sugerido?.nome || ""),
        funcao: funcaoFinal,
        tipoMeta:
          funcaoFinal === "consultor_vendas" && ehAci ? "meta2" : "",
      });
      setIsOpen(true);

      window.sessionStorage.removeItem("folha-cadastro-sugerido");
    } catch (error) {
      console.error("Erro ao abrir cadastro sugerido pela folha:", error);
      window.sessionStorage.removeItem("folha-cadastro-sugerido");
    }
  }, []);

  useEffect(() => {
    if (!funcionarioAbrirId || funcionariosQuery.isLoading) return;

    const funcionario = funcionariosBase.find(
      (item) => Number(item.id) === Number(funcionarioAbrirId)
    );

    if (!funcionario) return;

    setBuscaFuncionario(funcionario.nome || "");
    handleEditFuncionario(funcionario);

    if (typeof window !== "undefined") {
      const trocaSugeridaRaw = window.sessionStorage.getItem(
        TROCA_FUNCAO_SUGERIDA_STORAGE_KEY
      );

      if (trocaSugeridaRaw) {
        try {
          const trocaSugerida = JSON.parse(trocaSugeridaRaw);
          const novaFuncao = String(trocaSugerida?.novaFuncao || "") as FuncaoId;
          const funcaoValida = FUNCOES.some((item) => item.id === novaFuncao);
          if (funcaoValida && novaFuncao !== funcionario.funcao) {
            abrirTrocaFuncao(funcionario, novaFuncao);
          }
        } catch (error) {
          console.error("Erro ao abrir troca de função sugerida pela folha:", error);
        } finally {
          window.sessionStorage.removeItem(TROCA_FUNCAO_SUGERIDA_STORAGE_KEY);
        }
      }

      window.sessionStorage.removeItem("folha-funcionario-abrir-id");
      window.sessionStorage.removeItem("folha-funcionario-abrir-loja-id");
    }

    setFuncionarioAbrirId(null);
  }, [funcionarioAbrirId, funcionariosQuery.isLoading, funcionariosQuery.data]);

  const funcionarios = funcionariosBase.filter((func) =>
    String(func.nome || "")
      .toLowerCase()
      .includes(buscaFuncionario.trim().toLowerCase())
  );

  const salvando =
    createFuncionario.isPending || updateFuncionario.isPending || trocarFuncaoMutation.isPending;

  const totalFuncionarios = funcionariosBase.length;
  const totalAtivos = funcionariosBase.filter((func) => func.status === "ativo").length;
  const totalInativos = funcionariosBase.filter((func) => func.status !== "ativo").length;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-[#D4AF37]/[0.035] blur-3xl" />
        <div className="absolute -right-52 top-1/3 h-[460px] w-[460px] rounded-full bg-[#D4AF37]/[0.025] blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="mt-1 h-11 rounded-xl border-white/[0.08] bg-[#0d0d0d] px-4 text-white/75 shadow-lg shadow-black/20 hover:border-[#D4AF37]/35 hover:bg-[#D4AF37]/[0.055] hover:text-[#F2D675]"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>

            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#D4AF37]">
                <span className="h-px w-8 bg-[#D4AF37]/70" />
                Pessoas • RH
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                Gestão de <span className="text-[#F2D675]">Funcionários</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/40">
                Cadastro, vínculo, movimentações e histórico funcional em um único lugar.
              </p>
            </div>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="h-12 rounded-xl bg-[#D4AF37] px-5 font-bold text-black shadow-[0_10px_34px_rgba(212,175,55,0.16)] hover:bg-[#E7C553]"
          >
            <Plus className="mr-2 h-5 w-5" />
            Novo funcionário
          </Button>
        </header>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-gradient-to-br from-[#14120b] to-[#090909] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Loja selecionada</p>
                <p className="mt-2 text-lg font-semibold text-[#F2D675]">{lojaNome}</p>
              </div>
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-2.5 text-[#D4AF37]">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d0d] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Cadastrados</p>
                <p className="mt-2 text-2xl font-semibold text-white">{totalFuncionarios}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-2.5 text-white/55">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/10 bg-[#0d0d0d] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Ativos</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">{totalAtivos}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.06] p-2.5 text-emerald-400">
                <UserCheck className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-red-400/10 bg-[#0d0d0d] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Inativos</p>
                <p className="mt-2 text-2xl font-semibold text-red-400">{totalInativos}</p>
              </div>
              <div className="rounded-xl border border-red-400/10 bg-red-400/[0.06] p-2.5 text-red-400">
                <UserX className="h-5 w-5" />
              </div>
            </div>
          </div>
        </section>

        <Card className="mb-5 overflow-hidden rounded-3xl border border-[#D4AF37]/15 bg-gradient-to-br from-[#111111] via-[#0b0b0b] to-[#080808] text-white shadow-[0_22px_70px_rgba(0,0,0,0.30)]">
          <CardContent className="p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(250px,0.75fr)_minmax(320px,1.25fr)_auto] lg:items-end">
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Loja</label>
                <select
                  value={selectedLoja}
                  onChange={(e) => {
                    setSelectedLoja(e.target.value);
                    setBuscaFuncionario("");
                  }}
                  className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0a] px-4 text-sm font-medium text-white outline-none transition-all hover:border-[#D4AF37]/25 focus:border-[#D4AF37]/55 focus:ring-2 focus:ring-[#D4AF37]/10"
                >
                  {LOJAS.map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Buscar funcionário</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                  <input
                    type="text"
                    placeholder="Digite nome, sobrenome..."
                    value={buscaFuncionario}
                    onChange={(e) => setBuscaFuncionario(e.target.value)}
                    className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0a] py-2 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-white/20 hover:border-[#D4AF37]/25 focus:border-[#D4AF37]/55 focus:ring-2 focus:ring-[#D4AF37]/10"
                  />
                </div>
              </div>

              <div className="flex h-12 items-center rounded-xl border border-[#D4AF37]/12 bg-[#D4AF37]/[0.035] px-4 text-xs text-white/45">
                Exibindo <strong className="mx-1 text-[#F2D675]">{funcionarios.length}</strong> de {totalFuncionarios}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-3xl border border-white/[0.07] bg-[#090909] text-white shadow-[0_26px_90px_rgba(0,0,0,0.32)]">
          <CardHeader className="border-b border-white/[0.055] px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-white">
                  Equipe • {lojaNome}
                </CardTitle>
                <CardDescription className="mt-1 text-xs text-white/35">
                  Dados cadastrais e ações de vínculo dos funcionários desta unidade.
                </CardDescription>
              </div>
              <span className="w-fit rounded-full border border-[#D4AF37]/18 bg-[#D4AF37]/[0.055] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[#F2D675]">
                {funcionarios.length} funcionário(s)
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {funcionariosQuery.isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3 text-sm text-white/40">
                  <Loader2 className="h-5 w-5 animate-spin text-[#D4AF37]" />
                  Carregando equipe...
                </div>
              </div>
            ) : funcionariosQuery.error ? (
              <div className="m-5 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-5 text-center text-sm text-red-300">
                {funcionariosQuery.error.message}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#D4AF37]/12 bg-[#0c0c0c]">
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#B99632]">Funcionário</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#B99632]">PIX</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#B99632]">Função</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#B99632]">Nascimento</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#B99632]">Admissão</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#B99632]">Status</th>
                      <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-[#B99632]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionarios.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center">
                          <Users className="mx-auto mb-3 h-8 w-8 text-white/15" />
                          <p className="text-sm font-medium text-white/50">Nenhum funcionário encontrado</p>
                          <p className="mt-1 text-xs text-white/25">Altere a busca ou cadastre um novo funcionário.</p>
                        </td>
                      </tr>
                    ) : (
                      funcionarios.map((func) => (
                        <tr
                          key={func.id}
                          className="group border-b border-white/[0.045] transition-colors hover:bg-[#D4AF37]/[0.028]"
                        >
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => handleEditFuncionario(func)}
                              className="text-left"
                              title="Abrir cadastro do funcionário"
                            >
                              <p className="font-semibold tracking-[0.01em] text-white transition-colors group-hover:text-[#F2D675]">{func.nome}</p>
                              <p className="mt-1 text-[11px] text-white/28">CPF {func.cpf || "não informado"}</p>
                            </button>
                          </td>
                          <td className="px-4 py-4 text-sm text-white/58">{func.pix || "—"}</td>
                          <td className="px-4 py-4">
                            <p className="text-sm font-medium text-white/75">{labelFuncao(func.funcao, lojaId)}</p>
                            {func.funcao === "consultor_vendas" && (
                              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#D4AF37]">
                                {lojaId === 5
                                  ? "Meta 2"
                                  : func.tipoMeta === "meta1"
                                  ? "Meta 1"
                                  : func.tipoMeta === "meta2"
                                  ? "Meta 2"
                                  : "Meta não definida"}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-white/55">{formatDateBR(func.dataNascimento)}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 text-sm text-white/55">
                              <CalendarDays className="h-3.5 w-3.5 text-white/22" />
                              {formatDateBR(func.dataAdmissao)}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={
                                func.status === "ativo"
                                  ? "inline-flex items-center rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.10em] text-emerald-400"
                                  : "inline-flex items-center rounded-full border border-red-400/15 bg-red-400/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.10em] text-red-400"
                              }
                            >
                              {func.status === "ativo" ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditFuncionario(func)}
                                className="h-9 rounded-lg border-[#D4AF37]/18 bg-[#D4AF37]/[0.035] px-3 text-[#F2D675] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/[0.08] hover:text-[#FFE89A]"
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                Editar
                              </Button>

                              {func.status === "ativo" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleInativarFuncionario(func)}
                                  disabled={inativarFuncionario.isPending}
                                  className="h-9 rounded-lg border-red-400/14 bg-red-400/[0.025] px-3 text-red-400 hover:border-red-400/35 hover:bg-red-400/[0.07]"
                                >
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                  Inativar
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReativarFuncionario(func)}
                                  disabled={reativarFuncionario.isPending}
                                  className="h-9 rounded-lg border-emerald-400/14 bg-emerald-400/[0.025] px-3 text-emerald-400 hover:border-emerald-400/35 hover:bg-emerald-400/[0.07]"
                                >
                                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                  Reativar
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={excluirMutation.isPending}
                                className="h-9 rounded-lg px-2.5 text-white/22 hover:bg-red-500/[0.06] hover:text-red-400"
                                title="Excluir definitivamente"
                                onClick={async () => {
                                  const confirmar = confirm(
                                    `Deseja realmente excluir ${func.nome}?`
                                  );

                                  if (!confirmar) return;

                                  try {
                                    await excluirMutation.mutateAsync({ id: func.id });
                                  } catch (error: any) {
                                    console.error(error);
                                    alert(error?.message ?? "Erro ao excluir funcionário");
                                  }
                                }}
                              >
                                Excluir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5">
          <div className="relative max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[#D4AF37]/20 bg-[#080808] shadow-[0_30px_120px_rgba(0,0,0,0.72)]">
            <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#080808]/95 px-5 py-5 backdrop-blur-xl sm:px-7">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/80 to-transparent" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]">
                    {editingId ? "Cadastro funcional" : "Nova admissão"}
                  </p>
                  <h3 className="text-2xl font-semibold tracking-[-0.025em] text-white">
                    {editingId ? formData.nome || "Editar funcionário" : "Novo funcionário"}
                  </h3>
                  <p className="mt-1 text-xs text-white/35">
                    Campos com <span className="text-red-400">*</span> são obrigatórios.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fecharFormulario}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2 text-white/40 transition hover:border-[#D4AF37]/25 hover:text-white"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-5 py-6 sm:px-7">
              <section className="rounded-2xl border border-white/[0.065] bg-[#0c0c0c] p-4 sm:p-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-white">Dados pessoais</p>
                  <p className="mt-1 text-xs text-white/30">Identificação e informações de pagamento.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-medium text-white/50">
                      Nome completo <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: João Silva"
                      value={formData.nome}
                      onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
                      className={classeCampo(camposInvalidos.nome)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-white/50">
                      CPF <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={(e) => setFormData((prev) => ({ ...prev, cpf: e.target.value }))}
                      className={classeCampo(camposInvalidos.cpf)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-white/50">
                      Chave PIX <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Chave PIX"
                      value={formData.pix}
                      onChange={(e) => setFormData((prev) => ({ ...prev, pix: e.target.value }))}
                      className={classeCampo(camposInvalidos.pix)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-white/50">
                      Data de aniversário <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.dataNascimento}
                      onChange={(e) => setFormData((prev) => ({ ...prev, dataNascimento: e.target.value }))}
                      className={classeCampo(camposInvalidos.dataNascimento)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-white/50">
                      Data de admissão <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.dataAdmissao}
                      onChange={(e) => setFormData((prev) => ({ ...prev, dataAdmissao: e.target.value }))}
                      className={classeCampo(camposInvalidos.dataAdmissao)}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[#D4AF37]/12 bg-gradient-to-br from-[#111009] to-[#0a0a0a] p-4 sm:p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Vínculo e função</p>
                    <p className="mt-1 text-xs text-white/30">A função atual define o quadrante e as regras da folha.</p>
                  </div>
                  {editingId && funcionarioEmEdicao && (
                    <span className="rounded-full border border-[#D4AF37]/18 bg-[#D4AF37]/[0.055] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#F2D675]">
                      Função atual
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className={editingId && funcionarioEmEdicao ? "md:col-span-2" : ""}>
                    <label className="mb-2 block text-xs font-medium text-white/50">
                      Função <span className="text-red-400">*</span>
                    </label>

                    {editingId && funcionarioEmEdicao ? (
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <div className="flex h-11 items-center rounded-xl border border-white/[0.08] bg-[#0b0b0b] px-3 text-sm font-medium text-white">
                          {labelFuncao(funcionarioEmEdicao.funcao, lojaId)}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => abrirTrocaFuncao(funcionarioEmEdicao)}
                          className="h-11 rounded-xl border-orange-400/22 bg-orange-400/[0.045] px-4 text-orange-300 hover:border-orange-400/45 hover:bg-orange-400/[0.09] hover:text-orange-200"
                        >
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          Trocar função
                        </Button>
                      </div>
                    ) : (
                      <select
                        value={formData.funcao}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            funcao: e.target.value as FuncaoId,
                            tipoMeta:
                              e.target.value === "consultor_vendas"
                                ? lojaId === 5
                                  ? "meta2"
                                  : prev.tipoMeta
                                : "",
                          }))
                        }
                        className={classeCampo(camposInvalidos.funcao)}
                      >
                        {funcoesDisponiveis.map((funcao) => (
                          <option key={funcao.id} value={funcao.id}>
                            {lojaId === 5 && funcao.id === "supervisor"
                              ? "Supervisora de Consultor de Vendas - PJ"
                              : lojaId === 5 && funcao.id === "consultor_vendas"
                              ? "Consultor de Vendas - Meta 2"
                              : funcao.nome}
                          </option>
                        ))}
                      </select>
                    )}

                    {editingId && funcionarioEmEdicao && (
                      <p className="mt-2 text-[11px] leading-relaxed text-white/28">
                        Para preservar o histórico da folha, a função atual não é sobrescrita diretamente. Use “Trocar função” e informe a data efetiva.
                      </p>
                    )}
                  </div>

                  {formData.funcao === "consultor_vendas" && (
                    <div className={editingId ? "md:col-span-2" : ""}>
                      <label className="mb-2 block text-xs font-medium text-white/50">
                        Tipo de meta / comissão <span className="text-red-400">*</span>
                      </label>
                      {lojaId === 5 ? (
                        <div className="flex h-11 items-center rounded-xl border border-white/[0.08] bg-[#0b0b0b] px-3 text-sm text-white">
                          Meta 2 - Mensal
                        </div>
                      ) : (
                        <select
                          value={formData.tipoMeta}
                          onChange={(e) => setFormData((prev) => ({ ...prev, tipoMeta: e.target.value as TipoMeta }))}
                          className={classeCampo(camposInvalidos.tipoMeta)}
                        >
                          <option value="">Selecione</option>
                          <option value="meta1">Meta 1</option>
                          <option value="meta2">Meta 2</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {editingId && funcionarioEmEdicao && (
                <section className="rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-4 sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Histórico de função</p>
                      <p className="mt-1 text-xs text-white/30">
                        Consulte as movimentações registradas e corrija somente a data quando houver erro de digitação.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">
                      {historicoTrocas.length} movimentação{historicoTrocas.length === 1 ? "" : "ões"}
                    </span>
                  </div>

                  {trocasFuncionarioQuery.isLoading ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-4 text-sm text-white/35">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando histórico...
                    </div>
                  ) : historicoTrocas.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 text-sm text-white/30">
                      Nenhuma troca de função registrada para este funcionário.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {historicoTrocas.map((troca) => {
                        const corrigindo = correcaoTrocaId === Number(troca.id);
                        const foiCorrigida = Boolean(troca.ultimaDataAnterior);

                        return (
                          <div
                            key={troca.id}
                            className="rounded-xl border border-white/[0.07] bg-black/25 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="font-medium text-white/65">
                                    {labelFuncao(troca.funcaoAnterior, lojaId)}
                                  </span>
                                  <ArrowRightLeft className="h-3.5 w-3.5 text-[#D4AF37]" />
                                  <span className="font-semibold text-[#F2D675]">
                                    {labelFuncao(troca.funcaoNova, lojaId)}
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/32">
                                  <span>Data efetiva: {formatDateBR(troca.dataMudanca)}</span>
                                  {troca.usuarioNome && <span>Registrada por: {troca.usuarioNome}</span>}
                                </div>
                                {foiCorrigida && (
                                  <p className="mt-2 text-[11px] text-emerald-300/65">
                                    Data corrigida anteriormente de {formatDateBR(troca.ultimaDataAnterior)} para {formatDateBR(troca.ultimaDataNova)}
                                    {troca.corrigidoPor ? ` por ${troca.corrigidoPor}` : ""}.
                                  </p>
                                )}
                              </div>

                              {!corrigindo && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => abrirCorrecaoDataTroca(troca)}
                                  className="h-9 shrink-0 rounded-lg border-[#D4AF37]/18 bg-[#D4AF37]/[0.035] px-3 text-xs text-[#F2D675] hover:border-[#D4AF37]/38 hover:bg-[#D4AF37]/[0.075] hover:text-[#F7DF86]"
                                >
                                  <Pencil className="mr-2 h-3.5 w-3.5" />
                                  Corrigir data
                                </Button>
                              )}
                            </div>

                            {corrigindo && (
                              <div className="mt-4 rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/[0.025] p-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                                  <div>
                                    <label className="mb-2 block text-xs font-medium text-white/50">
                                      Data correta da troca
                                    </label>
                                    <input
                                      type="date"
                                      value={correcaoTrocaData}
                                      onChange={(e) => setCorrecaoTrocaData(e.target.value)}
                                      className="h-10 w-full rounded-lg border border-[#D4AF37]/20 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#D4AF37]/50 focus:ring-2 focus:ring-[#D4AF37]/10"
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    onClick={() => confirmarCorrecaoDataTroca(troca)}
                                    disabled={corrigirDataTrocaMutation.isPending}
                                    className="h-10 rounded-lg bg-[#D4AF37] px-4 font-bold text-black hover:bg-[#E7C553]"
                                  >
                                    {corrigirDataTrocaMutation.isPending ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <CalendarDays className="mr-2 h-4 w-4" />
                                    )}
                                    Salvar correção
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      setCorrecaoTrocaId(null);
                                      setCorrecaoTrocaData("");
                                    }}
                                    disabled={corrigirDataTrocaMutation.isPending}
                                    className="h-10 rounded-lg text-white/45 hover:bg-white/[0.04] hover:text-white"
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                                <p className="mt-3 text-[10px] leading-relaxed text-white/25">
                                  Esta ação corrige somente a data da movimentação e mantém a função atual. Se a nova data mudar a competência e já existir transição financeira, o sistema bloqueará a alteração para proteger a folha.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {editingId && funcionarioEmEdicao && trocaFuncaoOpen && (
                <section className="overflow-hidden rounded-2xl border border-orange-400/28 bg-gradient-to-br from-orange-500/[0.075] to-[#0b0908]">
                  <div className="border-b border-orange-400/12 px-4 py-4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl border border-orange-400/18 bg-orange-400/[0.07] p-2 text-orange-300">
                        <ArrowRightLeft className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-orange-200">Troca de função</p>
                        <p className="mt-1 text-xs leading-relaxed text-white/35">
                          Registre a nova função e a data efetiva. O sistema mantém um único cadastro e preserva a competência anterior.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/50">Função atual</label>
                        <div className="flex h-11 items-center rounded-xl border border-white/[0.08] bg-black/30 px-3 text-sm text-white/60">
                          {labelFuncao(funcionarioEmEdicao.funcao, lojaId)}
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/50">Nova função *</label>
                        <select
                          value={trocaFuncaoForm.novaFuncao}
                          onChange={(e) => {
                            const novaFuncao = e.target.value as FuncaoId | "";
                            setTrocaFuncaoForm((prev) => ({
                              ...prev,
                              novaFuncao,
                              novoTipoMeta:
                                novaFuncao === "consultor_vendas" && lojaId === 5
                                  ? "meta2"
                                  : novaFuncao === "consultor_vendas"
                                  ? prev.novoTipoMeta
                                  : "",
                            }));
                          }}
                          className="h-11 w-full rounded-xl border border-orange-400/24 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition focus:border-orange-400/55 focus:ring-2 focus:ring-orange-400/10"
                        >
                          <option value="">Selecione</option>
                          {funcoesDisponiveis
                            .filter((funcao) => funcao.id !== funcionarioEmEdicao.funcao)
                            .map((funcao) => (
                              <option key={funcao.id} value={funcao.id}>
                                {lojaId === 5 && funcao.id === "supervisor"
                                  ? "Supervisora de Consultor de Vendas - PJ"
                                  : lojaId === 5 && funcao.id === "consultor_vendas"
                                  ? "Consultor de Vendas - Meta 2"
                                  : funcao.nome}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/50">Data efetiva da troca *</label>
                        <input
                          type="date"
                          value={trocaFuncaoForm.dataMudanca}
                          onChange={(e) => setTrocaFuncaoForm((prev) => ({ ...prev, dataMudanca: e.target.value }))}
                          className="h-11 w-full rounded-xl border border-orange-400/24 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition focus:border-orange-400/55 focus:ring-2 focus:ring-orange-400/10"
                        />
                      </div>

                      {trocaFuncaoForm.novaFuncao === "consultor_vendas" && (
                        <div>
                          <label className="mb-2 block text-xs font-medium text-white/50">Tipo de meta / comissão *</label>
                          {lojaId === 5 ? (
                            <div className="flex h-11 items-center rounded-xl border border-orange-400/24 bg-[#0b0b0b] px-3 text-sm text-white">
                              Meta 2 - Mensal
                            </div>
                          ) : (
                            <select
                              value={trocaFuncaoForm.novoTipoMeta}
                              onChange={(e) => setTrocaFuncaoForm((prev) => ({ ...prev, novoTipoMeta: e.target.value as TipoMeta }))}
                              className="h-11 w-full rounded-xl border border-orange-400/24 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition focus:border-orange-400/55 focus:ring-2 focus:ring-orange-400/10"
                            >
                              <option value="">Selecione</option>
                              <option value="meta1">Meta 1</option>
                              <option value="meta2">Meta 2</option>
                            </select>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        onClick={confirmarTrocaFuncao}
                        disabled={trocarFuncaoMutation.isPending}
                        className="h-11 rounded-xl bg-orange-400 px-4 font-bold text-black hover:bg-orange-300"
                      >
                        {trocarFuncaoMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                        )}
                        Confirmar troca de função
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setTrocaFuncaoOpen(false)}
                        disabled={trocarFuncaoMutation.isPending}
                        className="h-11 rounded-xl text-white/45 hover:bg-white/[0.04] hover:text-white"
                      >
                        Cancelar troca
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              {tentouSalvar && !formValido && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/[0.055] p-3 text-sm text-red-300">
                  Preencha todos os campos obrigatórios destacados antes de salvar.
                </div>
              )}
            </div>

            <div className="sticky bottom-0 border-t border-white/[0.06] bg-[#080808]/95 px-5 py-4 backdrop-blur-xl sm:px-7">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handleSaveFuncionario}
                  disabled={salvando}
                  className="h-11 flex-1 rounded-xl bg-[#D4AF37] font-bold text-black hover:bg-[#E7C553] disabled:opacity-50"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : editingId ? (
                    "Salvar alterações"
                  ) : (
                    "Cadastrar funcionário"
                  )}
                </Button>

                {editingId && funcionarioEmEdicao && (
                  funcionarioEmEdicao.status === "ativo" ? (
                    <Button
                      onClick={() => handleInativarFuncionario(funcionarioEmEdicao)}
                      disabled={inativarFuncionario.isPending}
                      variant="outline"
                      className="h-11 rounded-xl border-red-400/18 bg-red-400/[0.025] px-4 text-red-400 hover:border-red-400/35 hover:bg-red-400/[0.07]"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Inativar
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleReativarFuncionario(funcionarioEmEdicao)}
                      disabled={reativarFuncionario.isPending}
                      variant="outline"
                      className="h-11 rounded-xl border-emerald-400/18 bg-emerald-400/[0.025] px-4 text-emerald-400 hover:border-emerald-400/35 hover:bg-emerald-400/[0.07]"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reativar
                    </Button>
                  )
                )}

                <Button
                  onClick={fecharFormulario}
                  variant="outline"
                  className="h-11 rounded-xl border-white/[0.08] bg-transparent px-4 text-white/55 hover:border-white/15 hover:bg-white/[0.035] hover:text-white"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
