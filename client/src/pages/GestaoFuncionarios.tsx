import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
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

  const lojaId = Number(selectedLoja);

  const veioDaFolha = () => {
    if (typeof window === "undefined") return false;

    return Boolean(
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

  const fecharFormulario = () => {
    setIsOpen(false);
    setEditingId(null);
    setTentouSalvar(false);
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
    `w-full rounded-md border bg-gray-900 px-3 py-2 text-white outline-none transition ${
      tentouSalvar && invalido
        ? "border-red-500 focus:border-red-400"
        : "border-yellow-500/30 focus:border-yellow-400"
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
        funcao: formData.funcao,
        tipoMeta:
          formData.funcao === "consultor_vendas"
            ? lojaId === 5
              ? "meta2"
              : (formData.tipoMeta as "meta1" | "meta2")
            : null,
        dataAdmissao: dateFromInput(formData.dataAdmissao),
      };

      if (editingId) {
        await updateFuncionario.mutateAsync({ id: editingId, ...payload });
      } else {
        await createFuncionario.mutateAsync(payload);
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

  const salvando = createFuncionario.isPending || updateFuncionario.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-8 flex items-center gap-4">
          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Voltar
          </Button>

          <div>
            <h1 className="mb-2 text-3xl font-bold text-yellow-400">
              Gestão de Funcionários
            </h1>
            <p className="text-gray-400">
              Admissão, edição e histórico de funcionários
            </p>
          </div>
        </div>

        <Card className="border-yellow-500/30 bg-gray-900 text-white">
          <CardHeader>
            <CardTitle className="text-yellow-400">Seleção de Loja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className="mb-2 block text-sm text-gray-300">Loja</label>
                <select
                  value={selectedLoja}
                  onChange={(e) => {
                    setSelectedLoja(e.target.value);
                    setBuscaFuncionario("");
                  }}
                  className="w-full rounded-md border border-yellow-500/30 bg-gray-800 px-3 py-2 text-white outline-none"
                >
                  {LOJAS.map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                onClick={handleOpenCreate}
                className="bg-yellow-400 text-black hover:bg-yellow-300"
              >
                + Novo Funcionário
              </Button>
            </div>
          </CardContent>
        </Card>

        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-yellow-500/30 bg-gray-950 p-6 shadow-2xl">
              <div className="mb-5">
                <h3 className="text-xl font-semibold text-yellow-400">
                  {editingId ? "Editar Funcionário" : "Novo Funcionário"}
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  Todos os campos marcados com * são obrigatórios.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Nome Completo <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: João Silva"
                    value={formData.nome}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, nome: e.target.value }))
                    }
                    className={classeCampo(camposInvalidos.nome)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    CPF <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={formData.cpf}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, cpf: e.target.value }))
                    }
                    className={classeCampo(camposInvalidos.cpf)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    PIX <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Chave PIX"
                    value={formData.pix}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, pix: e.target.value }))
                    }
                    className={classeCampo(camposInvalidos.pix)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Data de Aniversário <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.dataNascimento}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dataNascimento: e.target.value,
                      }))
                    }
                    className={classeCampo(camposInvalidos.dataNascimento)}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Função <span className="text-red-400">*</span>
                  </label>
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
                </div>

                {formData.funcao === "consultor_vendas" && (
                  <div>
                    <label className="mb-2 block text-sm text-gray-300">
                      Tipo de Meta / Comissão <span className="text-red-400">*</span>
                    </label>

                    {lojaId === 5 ? (
                      <div className="w-full rounded-md border border-yellow-500/30 bg-gray-900 px-3 py-2 text-white">
                        Meta 2 - Mensal
                      </div>
                    ) : (
                      <select
                        value={formData.tipoMeta}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            tipoMeta: e.target.value as TipoMeta,
                          }))
                        }
                        className={classeCampo(camposInvalidos.tipoMeta)}
                      >
                        <option value="">Selecione</option>
                        <option value="meta1">Meta 1</option>
                        <option value="meta2">Meta 2</option>
                      </select>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Data de Admissão <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.dataAdmissao}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        dataAdmissao: e.target.value,
                      }))
                    }
                    className={classeCampo(camposInvalidos.dataAdmissao)}
                  />
                </div>
              </div>

              {tentouSalvar && !formValido && (
                <div className="mt-4 rounded-md border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-300">
                  Preencha todos os campos obrigatórios destacados antes de salvar.
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={handleSaveFuncionario}
                  disabled={salvando}
                  className="flex-1 bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-50"
                >
                  {salvando
                    ? "Salvando..."
                    : editingId
                    ? "Salvar alterações"
                    : "Cadastrar funcionário"}
                </Button>

                {editingId && funcionarioEmEdicao && (
                  funcionarioEmEdicao.status === "ativo" ? (
                    <Button
                      onClick={() => handleInativarFuncionario(funcionarioEmEdicao)}
                      disabled={inativarFuncionario.isPending}
                      variant="outline"
                      className="flex-1 border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Inativar funcionário
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleReativarFuncionario(funcionarioEmEdicao)}
                      disabled={reativarFuncionario.isPending}
                      variant="outline"
                      className="flex-1 border-green-500/30 bg-transparent text-green-400 hover:bg-green-500/10"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reativar funcionário
                    </Button>
                  )
                )}

                <Button
                  onClick={fecharFormulario}
                  variant="outline"
                  className="flex-1 border-yellow-500/30 bg-transparent text-yellow-400 hover:bg-yellow-500/10"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        <Card className="border-yellow-500/30 bg-gray-900 text-white">
          <CardHeader>
            <CardTitle className="text-yellow-400">
              Funcionários - {lojaNome}
            </CardTitle>
            <CardDescription className="text-gray-400">
              Total: {funcionarios.length} funcionário(s)
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar funcionário pelo nome..."
                value={buscaFuncionario}
                onChange={(e) => setBuscaFuncionario(e.target.value)}
                className="w-full rounded-md border border-yellow-500/30 bg-gray-800 py-2 pl-10 pr-3 text-white outline-none placeholder:text-gray-500"
              />
            </div>

            {funcionariosQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
              </div>
            ) : funcionariosQuery.error ? (
              <div className="py-8 text-center text-red-400">
                {funcionariosQuery.error.message}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-yellow-500/30">
                      <th className="p-3 text-left font-semibold text-yellow-400">Nome</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">CPF</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">PIX</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Nascimento</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Função</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Tipo Meta</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Data Admissão</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Status</th>
                      <th className="p-3 text-left font-semibold text-yellow-400">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionarios.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-gray-400">
                          Nenhum funcionário registrado
                        </td>
                      </tr>
                    ) : (
                      funcionarios.map((func) => (
                        <tr key={func.id} className="border-b border-yellow-500/20">
                          <td className="p-3 font-medium text-white">{func.nome}</td>
                          <td className="p-3 text-gray-300">{func.cpf || "-"}</td>
                          <td className="p-3 text-gray-300">{func.pix || "-"}</td>
                          <td className="p-3 text-gray-300">
                            {formatDateBR(func.dataNascimento)}
                          </td>
                          <td className="p-3 text-gray-300">
                            {labelFuncao(func.funcao, lojaId)}
                          </td>
                          <td className="p-3 text-gray-300">
                            {func.funcao === "consultor_vendas"
                              ? lojaId === 5
                                ? "Meta 2"
                                : func.tipoMeta === "meta1"
                                ? "Meta 1"
                                : func.tipoMeta === "meta2"
                                ? "Meta 2"
                                : "-"
                              : "-"}
                          </td>
                          <td className="p-3 text-gray-300">
                            {formatDateBR(func.dataAdmissao)}
                          </td>
                          <td className="p-3">
                            <span
                              className={
                                func.status === "ativo"
                                  ? "rounded bg-green-500/10 px-2 py-1 text-xs text-green-400"
                                  : "rounded bg-red-500/10 px-2 py-1 text-xs text-red-400"
                              }
                            >
                              {func.status === "ativo" ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditFuncionario(func)}
                              className="border-yellow-500/30 bg-transparent text-yellow-400 hover:bg-yellow-500/10"
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Button>

                            {func.status === "ativo" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleInativarFuncionario(func)}
                                disabled={inativarFuncionario.isPending}
                                className="ml-2 border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Inativar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReativarFuncionario(func)}
                                disabled={reativarFuncionario.isPending}
                                className="ml-2 border-green-500/30 bg-transparent text-green-400 hover:bg-green-500/10"
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Reativar
                              </Button>
                            )}

                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={excluirMutation.isPending}
                              className="ml-2"
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
      </div>
    </div>
  );
}
