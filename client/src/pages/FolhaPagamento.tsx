import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeFolhaLinha,
  computeSupervisor,
  createParcelasVale,
  findMetaForFuncionario,
  getConsultorRegraTexto,
  getFolhasMensais,
  getFuncionarios,
  getPremiacaoAutomaticaDetalhes,
  getRecepcaoConfig,
  saveFolhasMensais,
  shouldRemoveValeFromHereForward,
  SUPERVISOR_RECORDE_GRUPO,
  SUPERVISOR_SALARIO_FIXO,
  type FolhaMensal,
  type PremioManual,
  type ValeItem,
} from "@/lib/payrollStore";

const LOJAS = [
  { id: 1, nome: "Joinville" },
  { id: 2, nome: "Blumenau" },
  { id: 3, nome: "São José" },
  { id: 4, nome: "Florianópolis" },
  { id: 5, nome: "ACI Promoções" },
  { id: 6, nome: "Contrato PJ" },
];

function money(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type QuadranteKey =
  | "gerente"
  | "comissao_semanal"
  | "consultor_vendas"
  | "comissao_mensal"
  | "alinhador"
  | "recepcao"
  | "supervisor_pj"
  | "salario_fixo";

type LinhaComQuadrante = FolhaMensal & {
  quadrante: QuadranteKey;
};

type CellEditorState = {
  open: boolean;
  funcionarioId: number | null;
  campo: keyof FolhaMensal | null;
  label: string;
  mode: "money" | "number";
  value: string;
};

type PremioEditorState = {
  open: boolean;
  funcionarioId: number | null;
  descricao: string;
  valor: string;
};

type ObsEditorState = {
  open: boolean;
  funcionarioId: number | null;
  novaObs: string;
};

type ValeEditorState = {
  open: boolean;
  funcionarioId: number | null;
  descricao: string;
  valor: string;
  parcelas: string;
};

type NegativoEditorState = {
  open: boolean;
  linha: LinhaComQuadrante | null;
};

type RegraSemanaEditorState = {
  open: boolean;
  linha: LinhaComQuadrante | null;
  semana: 1 | 2 | 3 | 4 | null;
};

function getQuadrante(lojaId: number, funcao: string): QuadranteKey {
  const semanal = lojaId === 1 || lojaId === 2;
  const mensal = lojaId === 3 || lojaId === 4;

  if (funcao === "supervisor" && lojaId === 6) return "supervisor_pj";
  if (funcao === "gerente") return "gerente";
  if (funcao === "consultor_vendas") return "consultor_vendas";
  if (funcao === "alinhador" || funcao === "aux_alinhador") return "alinhador";
  if (funcao === "recepcionista") return "recepcao";

  if (semanal && (funcao === "vendedor" || funcao === "mecanico")) {
    return "comissao_semanal";
  }

  if (mensal && (funcao === "vendedor" || funcao === "mecanico")) {
    return "comissao_mensal";
  }

  return "salario_fixo";
}

function getQuadranteTitulo(key: QuadranteKey) {
  switch (key) {
    case "gerente":
      return "Gerente";
    case "comissao_semanal":
      return "Comissão Semanal";
    case "consultor_vendas":
      return "Consultor de Vendas";
    case "comissao_mensal":
      return "Comissão Mensal";
    case "alinhador":
      return "Alinhador";
    case "recepcao":
      return "Recepção";
    case "supervisor_pj":
      return "Supervisor - Contrato PJ";
    case "salario_fixo":
      return "Salário Fixo";
    default:
      return key;
  }
}

function getQuadranteDescricao(key: QuadranteKey) {
  switch (key) {
    case "gerente":
      return "Funções de gerência";
    case "comissao_semanal":
      return "Vendedores e mecânicos com cálculo semanal";
    case "consultor_vendas":
      return "Consultores por carros na semana";
    case "comissao_mensal":
      return "Vendedores e mecânicos com cálculo mensal";
    case "alinhador":
      return "Alinhador e auxiliar de alinhador com cálculo mensal";
    case "recepcao":
      return "Recepção";
    case "supervisor_pj":
      return "Supervisor com cálculo por liquidez das 4 lojas";
    case "salario_fixo":
      return "Funções sem quadrante específico";
    default:
      return "";
  }
}

function parseInputNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function buildEmptyLine(args: {
  ano: number;
  mes: number;
  loja_id: number;
  funcionarioId: number;
  nome: string;
  funcao: string;
  tipoMeta?: "meta1" | "meta2" | "";
  regraMeta: string;
}): FolhaMensal {
  return {
    id: `${args.ano}-${args.mes}-${args.loja_id}-${args.funcionarioId}`,
    ano: args.ano,
    mes: args.mes,
    loja_id: args.loja_id,
    funcionarioId: args.funcionarioId,
    nome: args.nome,
    funcao: args.funcao,
    tipoMeta: args.tipoMeta,
    regraMeta: args.regraMeta,

    sem1: 0,
    perc1: 0,
    com1: 0,

    sem2: 0,
    perc2: 0,
    com2: 0,

    sem3: 0,
    perc3: 0,
    com3: 0,

    sem4: 0,
    perc4: 0,
    com4: 0,

    totalLiquidez: 0,
    totalComissao: 0,

    premiacoesManuais: [],
    premiacao: 0,

    vales: [],
    vale: 0,

    aluguel: 0,
    inss: 0,
    adiant: 0,
    holerite: 0,

    observacoes: [],

    boleto: 0,
  };
}

function exportBoletosCsv(rows: Array<{
  nome: string;
  cpf: string;
  pix: string;
  valor: number;
}>) {
  const header = ["Nome", "CPF", "PIX", "Valor do boleto"];
  const lines = rows.map((r) => [
    r.nome,
    r.cpf,
    r.pix,
    r.valor.toFixed(2).replace(".", ","),
  ]);

  const csv = [header, ...lines]
    .map((line) =>
      line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")
    )
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "boletos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function TabelaQuadrante({
  titulo,
  descricao,
  linhas,
  quadrante,
  onOpenCellEditor,
  onOpenPremioEditor,
  onOpenObsEditor,
  onOpenValeEditor,
  onOpenNegativoEditor,
  onOpenRegraSemanaEditor,
}: {
  titulo: string;
  descricao: string;
  linhas: LinhaComQuadrante[];
  quadrante: QuadranteKey;
  onOpenCellEditor: (
    linha: LinhaComQuadrante,
    campo: keyof FolhaMensal,
    label: string,
    mode: "money" | "number"
  ) => void;
  onOpenPremioEditor: (linha: LinhaComQuadrante) => void;
  onOpenObsEditor: (linha: LinhaComQuadrante) => void;
  onOpenValeEditor: (linha: LinhaComQuadrante) => void;
  onOpenNegativoEditor: (linha: LinhaComQuadrante) => void;
  onOpenRegraSemanaEditor: (
    linha: LinhaComQuadrante,
    semana: 1 | 2 | 3 | 4
  ) => void;
}) {
  if (linhas.length === 0) return null;

  const isConsultor = quadrante === "consultor_vendas";
  const isSalarioFixo = quadrante === "salario_fixo";
  const isRecepcao = quadrante === "recepcao";
  const isSupervisor = quadrante === "supervisor_pj";
  const recepcaoCompleta =
    isRecepcao && (linhas[0]?.loja_id === 3 || linhas[0]?.loja_id === 4);
  const isMensalUnico =
    quadrante === "comissao_mensal" ||
    quadrante === "alinhador" ||
    quadrante === "gerente";

  function getRegraConsultorTexto(linha: LinhaComQuadrante, carrosSemana: number) {
    return getConsultorRegraTexto({
      cidade: linha.loja_id.toString(),
      tipoMeta: linha.tipoMeta,
      carrosSemana,
    });
  }

  function renderEditButton(
    linha: LinhaComQuadrante,
    campo: keyof FolhaMensal,
    label: string,
    mode: "money" | "number"
  ) {
    const rawValue = Number(linha[campo] || 0);
    const text =
      mode === "money" ? `R$ ${money(rawValue)}` : rawValue.toLocaleString("pt-BR");

    return (
      <button
        type="button"
        onClick={() => onOpenCellEditor(linha, campo, label, mode)}
        className="w-full rounded-md border border-primary/20 bg-gray-800 px-3 py-2 text-right text-white hover:border-primary/60"
      >
        {text}
      </button>
    );
  }

  function renderRegraButton(
    linha: LinhaComQuadrante,
    semana: 1 | 2 | 3 | 4
  ) {
    if (isConsultor) {
      const carrosSemana =
        semana === 1
          ? linha.sem1
          : semana === 2
          ? linha.sem2
          : semana === 3
          ? linha.sem3
          : linha.sem4;

      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semana)}
          className="text-yellow-300 font-semibold hover:underline underline-offset-4"
        >
          {getRegraConsultorTexto(linha, carrosSemana)}
        </button>
      );
    }

    if (isRecepcao) {
      const config = getRecepcaoConfig(linha.nome, linha.loja_id.toString());
      const valor = semana === 1 ? config.valorVenda : config.valorEntrada;

      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semana)}
          className="text-yellow-300 font-semibold hover:underline underline-offset-4"
        >
          R$ {money(valor)}
        </button>
      );
    }

    if (isSupervisor) {
      const premio =
        semana === 1
          ? linha.com1
          : semana === 2
          ? linha.com2
          : semana === 3
          ? linha.com3
          : linha.com4;

      return (
        <button
          type="button"
          onClick={() => onOpenRegraSemanaEditor(linha, semana)}
          className="text-yellow-300 font-semibold hover:underline underline-offset-4"
        >
          R$ {money(premio)}
        </button>
      );
    }

    const percentual =
      semana === 1
        ? linha.perc1
        : semana === 2
        ? linha.perc2
        : semana === 3
        ? linha.perc3
        : linha.perc4;

    return (
      <button
        type="button"
        onClick={() => onOpenRegraSemanaEditor(linha, semana)}
        className="text-yellow-300 font-semibold hover:underline underline-offset-4"
      >
        {percentual.toFixed(2)}%
      </button>
    );
  }

  return (
    <Card className="bg-gray-900 border-primary/30">
      <CardHeader>
        <CardTitle className="text-primary">{titulo}</CardTitle>
        <CardDescription className="text-gray-400">
          {descricao}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1900px] text-sm">
            <thead>
              <tr className="border-b border-primary/30 text-primary">
                <th className="text-left p-2">Nome</th>
                <th className="text-left p-2">Função</th>

                {!isSalarioFixo && !isRecepcao && !isSupervisor && !isMensalUnico && (
                  <>
                    <th className="text-right p-2">SEM1</th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                    <th className="text-right p-2">SEM2</th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                    <th className="text-right p-2">SEM3</th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                    <th className="text-right p-2">SEM4</th>
                    <th className="text-right p-2">{isConsultor ? "Regra" : "%"}</th>
                  </>
                )}

                {!isSalarioFixo && !isRecepcao && !isSupervisor && isMensalUnico && (
                  <>
                    <th className="text-right p-2">Liquidez</th>
                    <th className="text-right p-2">%</th>
                  </>
                )}

                {isRecepcao && (
                  <>
                    <th className="text-right p-2">Vendas fechadas</th>
                    <th className="text-right p-2">Valor</th>
                    {recepcaoCompleta && (
                      <>
                        <th className="text-right p-2">Entradas</th>
                        <th className="text-right p-2">Valor</th>
                      </>
                    )}
                  </>
                )}

                {isSupervisor && (
                  <>
                    <th className="text-right p-2">Salário fixo</th>
                    <th className="text-right p-2">Líq. Joinville</th>
                    <th className="text-right p-2">Premiação</th>
                    <th className="text-right p-2">Líq. Blumenau</th>
                    <th className="text-right p-2">Premiação</th>
                    <th className="text-right p-2">Líq. São José</th>
                    <th className="text-right p-2">Premiação</th>
                    <th className="text-right p-2">Líq. Florianópolis</th>
                    <th className="text-right p-2">Premiação</th>
                    <th className="text-right p-2">Total de liquidez</th>
                    <th className="text-right p-2">Total de premiação</th>
                  </>
                )}

                {!isSalarioFixo && !isRecepcao && !isSupervisor && (
                  <>
                    <th className="text-right p-2">
                      {isConsultor ? "Total Carros" : "Total Liquidez"}
                    </th>
                    <th className="text-right p-2">Total Comissão</th>
                  </>
                )}

                {isRecepcao && <th className="text-right p-2">Total Comissão</th>}

                <th className="text-right p-2">Premiação</th>
                <th className="text-right p-2">Vale</th>
                <th className="text-right p-2">Aluguel</th>
                {!isSupervisor && <th className="text-right p-2">INSS</th>}
                <th className="text-right p-2">Adiant.</th>
                {!isSupervisor && <th className="text-right p-2">Holerite</th>}
                <th className="text-right p-2">Boleto</th>
                <th className="text-right p-2">Observação</th>
              </tr>
            </thead>

            <tbody>
              {linhas.map((linha) => (
                <tr
                  key={linha.id}
                  className="border-b border-primary/10 hover:bg-gray-800"
                >
                  <td className="p-2 text-white font-semibold">{linha.nome}</td>
                  <td className="p-2 text-gray-300">{linha.funcao}</td>

                  {!isSalarioFixo && !isRecepcao && !isSupervisor && !isMensalUnico && (
                    <>
                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem1", "Quantidade SEM1", "number")
                          : renderEditButton(linha, "sem1", "Liquidez SEM1", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 1)}</td>

                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem2", "Quantidade SEM2", "number")
                          : renderEditButton(linha, "sem2", "Liquidez SEM2", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 2)}</td>

                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem3", "Quantidade SEM3", "number")
                          : renderEditButton(linha, "sem3", "Liquidez SEM3", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 3)}</td>

                      <td className="p-2">
                        {isConsultor
                          ? renderEditButton(linha, "sem4", "Quantidade SEM4", "number")
                          : renderEditButton(linha, "sem4", "Liquidez SEM4", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 4)}</td>
                    </>
                  )}

                  {!isSalarioFixo && !isRecepcao && !isSupervisor && isMensalUnico && (
                    <>
                      <td className="p-2">
                        {renderEditButton(linha, "sem1", "Liquidez do mês", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 1)}</td>
                    </>
                  )}

                  {isRecepcao && (
                    <>
                      <td className="p-2">
                        {renderEditButton(linha, "sem1", "Vendas fechadas", "number")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 1)}</td>

                      {recepcaoCompleta && (
                        <>
                          <td className="p-2">
                            {renderEditButton(linha, "sem2", "Entradas", "number")}
                          </td>
                          <td className="p-2 text-right">{renderRegraButton(linha, 2)}</td>
                        </>
                      )}
                    </>
                  )}

                  {isSupervisor && (
                    <>
                      <td className="p-2 text-right text-white font-semibold">
                        R$ {money(SUPERVISOR_SALARIO_FIXO)}
                      </td>

                      <td className="p-2">
                        {renderEditButton(linha, "sem1", "Líq. Joinville", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 1)}</td>

                      <td className="p-2">
                        {renderEditButton(linha, "sem2", "Líq. Blumenau", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 2)}</td>

                      <td className="p-2">
                        {renderEditButton(linha, "sem3", "Líq. São José", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 3)}</td>

                      <td className="p-2">
                        {renderEditButton(linha, "sem4", "Líq. Florianópolis", "money")}
                      </td>
                      <td className="p-2 text-right">{renderRegraButton(linha, 4)}</td>

                      <td className="p-2 text-right text-white font-semibold">
                        R$ {money(linha.totalLiquidez)}
                      </td>

                      <td className="p-2 text-right text-yellow-300 font-semibold">
                        R$ {money(linha.totalComissao)}
                      </td>
                    </>
                  )}

                  {!isSalarioFixo && !isRecepcao && !isSupervisor && (
                    <>
                      <td className="p-2 text-right text-white font-semibold">
                        {isConsultor
                          ? linha.totalLiquidez.toLocaleString("pt-BR")
                          : `R$ ${money(linha.totalLiquidez)}`}
                      </td>

                      <td className="p-2 text-right text-yellow-300 font-semibold">
                        R$ {money(linha.totalComissao)}
                      </td>
                    </>
                  )}

                  {isRecepcao &&(
                    <td className="p-2 text-right text-yellow-300 font-semibold">
                      R$ {money(linha.totalComissao)}
                    </td>
                  )}

                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => onOpenPremioEditor(linha)}
                      className="w-full rounded-md border border-primary/20 bg-gray-800 px-3 py-2 text-right text-white hover:border-primary/60"
                    >
                      R$ {money(linha.premiacao)}
                    </button>
                  </td>

                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => onOpenValeEditor(linha)}
                      className="w-full rounded-md border border-primary/20 bg-gray-800 px-3 py-2 text-right text-white hover:border-primary/60"
                    >
                      R$ {money(linha.vale)}
                    </button>
                  </td>

                  <td className="p-2">
                    {renderEditButton(linha, "aluguel", "Aluguel", "money")}
                  </td>

                  {!isSupervisor && (
                    <td className="p-2">
                      {renderEditButton(linha, "inss", "INSS", "money")}
                    </td>
                  )}

                  <td className="p-2">
                      {renderEditButton(linha, "adiant", "Adiantamento", "money")}
                    </td>

                  {!isSupervisor && (
                    <td className="p-2">
                      {renderEditButton(linha, "holerite", "Holerite", "money")}
                    </td>
                  )}

                  <td className="p-2 text-right font-bold">
                    {linha.boleto < 0 ? (
                      <button
                        type="button"
                        onClick={() => onOpenNegativoEditor(linha)}
                        className="text-red-500 hover:text-red-400 underline underline-offset-4"
                      >
                        R$ {money(linha.boleto)}
                      </button>
                    ) : (
                      <span className="text-green-400">R$ {money(linha.boleto)}</span>
                    )}
                  </td>

                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenObsEditor(linha)}
                      className={
                        linha.observacoes && linha.observacoes.length > 0
                          ? "rounded-md bg-red-600 px-3 py-2 font-bold text-white hover:bg-red-500"
                          : "rounded-md border border-primary/20 bg-gray-800 px-3 py-2 text-white hover:border-primary/60"
                      }
                    >
                      {linha.observacoes && linha.observacoes.length > 0 ? "OBS" : "—"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FolhaPagamento() {
  const [, setLocation] = useLocation();
  const [selectedLoja, setSelectedLoja] = useState("1");
  const [ano, setAno] = useState(2026);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [folhas, setFolhas] = useState<FolhaMensal[]>(getFolhasMensais());

  const [cellEditor, setCellEditor] = useState<CellEditorState>({
    open: false,
    funcionarioId: null,
    campo: null,
    label: "",
    mode: "money",
    value: "",
  });

  const [premioEditor, setPremioEditor] = useState<PremioEditorState>({
    open: false,
    funcionarioId: null,
    descricao: "",
    valor: "",
  });

  const [obsEditor, setObsEditor] = useState<ObsEditorState>({
    open: false,
    funcionarioId: null,
    novaObs: "",
  });

  const [valeEditor, setValeEditor] = useState<ValeEditorState>({
    open: false,
    funcionarioId: null,
    descricao: "",
    valor: "",
    parcelas: "1",
  });

  const [negativoEditor, setNegativoEditor] = useState<NegativoEditorState>({
    open: false,
    linha: null,
  });

  const [regraSemanaEditor, setRegraSemanaEditor] = useState<RegraSemanaEditorState>({
    open: false,
    linha: null,
    semana: null,
  });

  const lojaId = parseInt(selectedLoja, 10);
  const todosFuncionarios = useMemo(() => getFuncionarios(), []);
  const funcionariosDaCidade = useMemo(() => {
    return todosFuncionarios.filter(
      (f) => f.loja_id === lojaId && f.status !== "inativo"
    );
  }, [lojaId, todosFuncionarios]);

  function updateFolhas(next: FolhaMensal[]) {
    setFolhas(next);
    saveFolhasMensais(next);
  }

  function getFuncionarioById(funcionarioId: number) {
    return todosFuncionarios.find((f) => f.id === funcionarioId) || null;
  }

  const linhas = useMemo<LinhaComQuadrante[]>(() => {
    return funcionariosDaCidade.map((func) => {
      const existente = folhas.find(
        (f) =>
          f.loja_id === lojaId &&
          f.ano === ano &&
          f.mes === mes &&
          f.funcionarioId === func.id
      );

      const meta = findMetaForFuncionario({
        funcionarioNome: func.nome,
        funcao: func.funcao,
        cidade: selectedLoja,
        tipoMeta: func.tipoMeta,
      });

      const base =
        existente ||
        buildEmptyLine({
          ano,
          mes,
          loja_id: lojaId,
          funcionarioId: func.id,
          nome: func.nome,
          funcao: func.funcao,
          tipoMeta: func.tipoMeta,
          regraMeta: meta?.regra || "Sem meta cadastrada",
        });

      const calculado = computeFolhaLinha({
        meta,
        funcao: func.funcao,
        cidade: selectedLoja,
        funcionarioNome: func.nome,
        tipoMeta: func.tipoMeta,
        sem1: base.sem1,
        sem2: base.sem2,
        sem3: base.sem3,
        sem4: base.sem4,
        premiacoesManuais: base.premiacoesManuais || [],
        vales: base.vales || [],
        aluguel: base.aluguel,
        inss: base.inss,
        adiant: base.adiant,
        holerite: base.holerite,
      });

      return {
        ...base,
        regraMeta: meta?.regra || "Sem meta cadastrada",
        quadrante: getQuadrante(lojaId, func.funcao),
        ...calculado,
      };
    });
  }, [funcionariosDaCidade, folhas, lojaId, ano, mes, selectedLoja]);

  function replaceCurrentMonthLines(modified: FolhaMensal[]) {
    const remaining = folhas.filter(
      (f) => !(f.loja_id === lojaId && f.ano === ano && f.mes === mes)
    );
    updateFolhas([...remaining, ...modified]);
  }

  function updateLinha(
    funcionarioId: number,
    campo: keyof FolhaMensal,
    valor: any
  ) {
    const currentMonthLines = linhas.map((linha) =>
      linha.funcionarioId === funcionarioId
        ? {
            ...linha,
            [campo]: valor,
          }
        : linha
    ) as FolhaMensal[];

    replaceCurrentMonthLines(currentMonthLines);
  }

  function openCellEditor(
    linha: LinhaComQuadrante,
    campo: keyof FolhaMensal,
    label: string,
    mode: "money" | "number"
  ) {
    setCellEditor({
      open: true,
      funcionarioId: linha.funcionarioId,
      campo,
      label,
      mode,
      value: String(Number(linha[campo] || 0)),
    });
  }

  function saveCellEditor() {
    if (!cellEditor.funcionarioId || !cellEditor.campo) return;
    const valor = parseInputNumber(cellEditor.value);
    updateLinha(cellEditor.funcionarioId, cellEditor.campo, valor);
    setCellEditor({
      open: false,
      funcionarioId: null,
      campo: null,
      label: "",
      mode: "money",
      value: "",
    });
  }

  function openPremioEditor(linha: LinhaComQuadrante) {
    setPremioEditor({
      open: true,
      funcionarioId: linha.funcionarioId,
      descricao: "",
      valor: "",
    });
  }

  function addPremiacaoManual() {
    if (!premioEditor.funcionarioId) return;
    const descricao = premioEditor.descricao.trim();
    const valor = parseInputNumber(premioEditor.valor);
    if (!descricao || valor <= 0) return;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const currentMonthLines = linhas.map((linha) =>
      linha.funcionarioId === premioEditor.funcionarioId
        ? {
            ...linha,
            premiacoesManuais: [
              ...(linha.premiacoesManuais || []),
              { id, descricao, valor } as PremioManual,
            ],
          }
        : linha
    ) as FolhaMensal[];

    replaceCurrentMonthLines(currentMonthLines);
    setPremioEditor((prev) => ({ ...prev, descricao: "", valor: "" }));
  }

  function removePremiacaoManual(id: string) {
    if (!premioEditor.funcionarioId) return;

    const currentMonthLines = linhas.map((linha) =>
      linha.funcionarioId === premioEditor.funcionarioId
        ? {
            ...linha,
            premiacoesManuais: (linha.premiacoesManuais || []).filter(
              (item) => item.id !== id
            ),
          }
        : linha
    ) as FolhaMensal[];

    replaceCurrentMonthLines(currentMonthLines);
  }

  function openObsEditor(linha: LinhaComQuadrante) {
    setObsEditor({
      open: true,
      funcionarioId: linha.funcionarioId,
      novaObs: "",
    });
  }

  function addObservacao() {
    if (!obsEditor.funcionarioId || !obsEditor.novaObs.trim()) return;

    const currentMonthLines = linhas.map((linha) =>
      linha.funcionarioId === obsEditor.funcionarioId
        ? {
            ...linha,
            observacoes: [...(linha.observacoes || []), obsEditor.novaObs.trim()],
          }
        : linha
    ) as FolhaMensal[];

    replaceCurrentMonthLines(currentMonthLines);
    setObsEditor((prev) => ({ ...prev, novaObs: "" }));
  }

  function removeObservacao(index: number) {
    if (!obsEditor.funcionarioId) return;

    const currentMonthLines = linhas.map((linha) =>
      linha.funcionarioId === obsEditor.funcionarioId
        ? {
            ...linha,
            observacoes: (linha.observacoes || []).filter((_, i) => i !== index),
          }
        : linha
    ) as FolhaMensal[];

    replaceCurrentMonthLines(currentMonthLines);
  }

  function openValeEditor(linha: LinhaComQuadrante) {
    setValeEditor({
      open: true,
      funcionarioId: linha.funcionarioId,
      descricao: "",
      valor: "",
      parcelas: "1",
    });
  }

  function addVale() {
    if (!valeEditor.funcionarioId) return;

    const descricao = valeEditor.descricao.trim();
    const valorTotal = parseInputNumber(valeEditor.valor);
    const parcelas = Math.max(1, Math.floor(parseInputNumber(valeEditor.parcelas)));

    if (!descricao || valorTotal <= 0) return;

    const funcionario = getFuncionarioById(valeEditor.funcionarioId);
    if (!funcionario) return;

    const parcelasCriadas = createParcelasVale({
      descricao,
      valorTotal,
      parcelas,
      ano,
      mes,
    });

    const next = [...folhas];

    parcelasCriadas.forEach(({ ano: anoParcela, mes: mesParcela, item }) => {
      const idx = next.findIndex(
        (f) =>
          f.funcionarioId === valeEditor.funcionarioId &&
          f.ano === anoParcela &&
          f.mes === mesParcela &&
          f.loja_id === funcionario.loja_id
      );

      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          vales: [...(next[idx].vales || []), item],
        };
      } else {
        next.push({
          ...buildEmptyLine({
            ano: anoParcela,
            mes: mesParcela,
            loja_id: funcionario.loja_id,
            funcionarioId: funcionario.id,
            nome: funcionario.nome,
            funcao: funcionario.funcao,
            tipoMeta: funcionario.tipoMeta,
            regraMeta: "",
          }),
          vales: [item],
        });
      }
    });

    updateFolhas(next);

    setValeEditor((prev) => ({
      ...prev,
      descricao: "",
      valor: "",
      parcelas: "1",
    }));
  }

  function removeVale(vale: ValeItem) {
    if (!valeEditor.funcionarioId) return;

    const next = folhas.map((linha) => {
      if (linha.funcionarioId !== valeEditor.funcionarioId) return linha;

      const novosVales = (linha.vales || []).filter((item) => {
        if (item.grupoId !== vale.grupoId) return true;

        if (
          shouldRemoveValeFromHereForward({
            vale: item,
            currentAno: ano,
            currentMes: mes,
            lineAno: linha.ano,
            lineMes: linha.mes,
          })
        ) {
          return false;
        }

        return true;
      });

      return {
        ...linha,
        vales: novosVales,
      };
    });

    updateFolhas(next);
  }

  function openNegativoEditor(linha: LinhaComQuadrante) {
    if (linha.boleto >= 0) return;
    setNegativoEditor({
      open: true,
      linha,
    });
  }

  function lançarNegativoNoPróximoMês() {
    const linha = negativoEditor.linha;
    if (!linha) return;

    const funcionario = getFuncionarioById(linha.funcionarioId);
    if (!funcionario) return;

    const valor = Math.abs(linha.boleto);
    if (valor <= 0) return;

    const currentDate = new Date(ano, mes - 1, 1);
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const proximoAno = nextDate.getFullYear();
    const proximoMes = nextDate.getMonth() + 1;

    const nomeMesAtual = currentDate.toLocaleDateString("pt-BR", {
      month: "long",
    });

    const parcelasCriadas = createParcelasVale({
      descricao: `Negativo ${nomeMesAtual}/${ano}`,
      valorTotal: valor,
      parcelas: 1,
      ano: proximoAno,
      mes: proximoMes,
    });

    const next = [...folhas];

    parcelasCriadas.forEach(({ ano: anoParcela, mes: mesParcela, item }) => {
      const idx = next.findIndex(
        (f) =>
          f.funcionarioId === linha.funcionarioId &&
          f.ano === anoParcela &&
          f.mes === mesParcela &&
          f.loja_id === funcionario.loja_id
      );

      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          vales: [...(next[idx].vales || []), item],
        };
      } else {
        next.push({
          ...buildEmptyLine({
            ano: anoParcela,
            mes: mesParcela,
            loja_id: funcionario.loja_id,
            funcionarioId: funcionario.id,
            nome: funcionario.nome,
            funcao: funcionario.funcao,
            tipoMeta: funcionario.tipoMeta,
            regraMeta: "",
          }),
          vales: [item],
        });
      }
    });

    updateFolhas(next);
    setNegativoEditor({ open: false, linha: null });
  }

  function exportarBoletos() {
    const rows = linhas
      .filter((linha) => linha.boleto !== 0)
      .map((linha) => {
        const funcionario = getFuncionarioById(linha.funcionarioId) as any;
        return {
          nome: linha.nome,
          cpf: funcionario?.cpf || "",
          pix: funcionario?.pix || "",
          valor: linha.boleto,
        };
      });

    exportBoletosCsv(rows);
  }

  function openRegraSemanaEditor(
    linha: LinhaComQuadrante,
    semana: 1 | 2 | 3 | 4
  ) {
    setRegraSemanaEditor({
      open: true,
      linha,
      semana,
    });
  }

  const linhaPremioAtual = useMemo(() => {
    if (!premioEditor.funcionarioId) return null;
    return linhas.find((l) => l.funcionarioId === premioEditor.funcionarioId) || null;
  }, [premioEditor.funcionarioId, linhas]);

  const premioAutomaticoAtual = useMemo(() => {
    if (!linhaPremioAtual) return { detalhes: [], total: 0 };
    return getPremiacaoAutomaticaDetalhes({
      funcao: linhaPremioAtual.funcao,
      cidade: linhaPremioAtual.loja_id.toString(),
      tipoMeta: linhaPremioAtual.tipoMeta,
      sem1: linhaPremioAtual.sem1,
      sem2: linhaPremioAtual.sem2,
      sem3: linhaPremioAtual.sem3,
      sem4: linhaPremioAtual.sem4,
    });
  }, [linhaPremioAtual]);

  const linhaObsAtual = useMemo(() => {
    if (!obsEditor.funcionarioId) return null;
    return linhas.find((l) => l.funcionarioId === obsEditor.funcionarioId) || null;
  }, [obsEditor.funcionarioId, linhas]);

  const linhaValeAtual = useMemo(() => {
    if (!valeEditor.funcionarioId) return null;
    return linhas.find((l) => l.funcionarioId === valeEditor.funcionarioId) || null;
  }, [valeEditor.funcionarioId, linhas]);

  const detalheSemanaAtual = useMemo(() => {
    const linha = regraSemanaEditor.linha;
    const semana = regraSemanaEditor.semana;
    if (!linha || !semana) return null;

    const isConsultor = linha.funcao === "consultor_vendas";
    const isRecepcao = linha.funcao === "recepcionista";
    const isSupervisor = linha.funcao === "supervisor";

    if (isSupervisor) {
      const labels = ["Joinville", "Blumenau", "São José", "Florianópolis"];
      const base =
        semana === 1 ? linha.sem1 : semana === 2 ? linha.sem2 : semana === 3 ? linha.sem3 : linha.sem4;
      const premio =
        semana === 1 ? linha.com1 : semana === 2 ? linha.com2 : semana === 3 ? linha.com3 : linha.com4;

      const supervisor = computeSupervisor({
        liqJoinville: linha.sem1,
        liqBlumenau: linha.sem2,
        liqSaoJose: linha.sem3,
        liqFlorianopolis: linha.sem4,
        premiacoesManuais: linha.premiacoesManuais || [],
        vales: linha.vales || [],
        aluguel: linha.aluguel || 0,
      });

      return {
        linha,
        semana,
        isConsultor: false,
        isRecepcao: false,
        isSupervisor: true,
        base,
        regraTexto: `R$ ${money(premio)}`,
        comissao: premio,
        metaTitulo: `Meta da loja - ${labels[semana - 1]}`,
        baseLabel: `Liquidez ${labels[semana - 1]}`,
        extra:
          semana === 4
            ? `Grupo: R$ ${money(supervisor.totalLiquidez)} | Recorde atual: R$ ${money(
                SUPERVISOR_RECORDE_GRUPO
              )}`
            : "",
      };
    }

    if (isRecepcao) {
      const config = getRecepcaoConfig(linha.nome, linha.loja_id.toString());

      if (semana === 1) {
        return {
          linha,
          semana,
          isConsultor: false,
          isRecepcao: true,
          isSupervisor: false,
          base: linha.sem1,
          regraTexto: `R$ ${money(config.valorVenda)}`,
          comissao: linha.sem1 * config.valorVenda,
          metaTitulo: "Regra da recepção",
          baseLabel: "Vendas fechadas",
          extra: "",
        };
      }

      return {
        linha,
        semana,
        isConsultor: false,
        isRecepcao: true,
        isSupervisor: false,
        base: linha.sem2,
        regraTexto: `R$ ${money(config.valorEntrada)}`,
        comissao: linha.sem2 * config.valorEntrada,
        metaTitulo: "Regra da recepção",
        baseLabel: "Entradas",
        extra: "",
      };
    }

    const base =
      semana === 1
        ? linha.sem1
        : semana === 2
        ? linha.sem2
        : semana === 3
        ? linha.sem3
        : linha.sem4;
    const percentual =
      semana === 1
        ? linha.perc1
        : semana === 2
        ? linha.perc2
        : semana === 3
        ? linha.perc3
        : linha.perc4;
    const comissao =
      semana === 1
        ? linha.com1
        : semana === 2
        ? linha.com2
        : semana === 3
        ? linha.com3
        : linha.com4;

    return {
      linha,
      semana,
      isConsultor,
      isRecepcao: false,
      isSupervisor: false,
      base,
      percentual,
      comissao,
      regraTexto: isConsultor
        ? getConsultorRegraTexto({
            cidade: linha.loja_id.toString(),
            tipoMeta: linha.tipoMeta,
            carrosSemana: base,
          })
        : `${percentual.toFixed(2)}%`,
      metaTitulo: isConsultor
        ? linha.tipoMeta === "meta2"
          ? "Meta 2 (nova)"
          : "Meta 1 (antiga)"
        : "Meta da função",
      baseLabel: isConsultor ? "Quantidade lançada" : "Liquidez lançada",
      extra: "",
    };
  }, [regraSemanaEditor]);

  const totalLiquidezGeral = linhas.reduce((sum, l) => sum + l.totalLiquidez, 0);
  const totalComissaoGeral = linhas.reduce((sum, l) => sum + l.totalComissao, 0);
  const totalBoletoGeral = linhas.reduce((sum, l) => sum + l.boleto, 0);

  const ordemQuadrantes: QuadranteKey[] = [
    "gerente",
    "comissao_semanal",
    "consultor_vendas",
    "comissao_mensal",
    "alinhador",
    "recepcao",
    "supervisor_pj",
    "salario_fixo",
  ];

  const linhasPorQuadrante = useMemo(() => {
    return ordemQuadrantes.map((key) => ({
      key,
      titulo: getQuadranteTitulo(key),
      descricao: getQuadranteDescricao(key),
      linhas: linhas.filter((l) => l.quadrante === key),
    }));
  }, [linhas]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black p-6 text-white">
      <div className="max-w-[1900px] mx-auto space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/")}
                className="text-primary hover:bg-primary/20"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-3xl font-bold text-primary">
                Folha de Pagamento
              </h1>
            </div>
            <p className="text-gray-400">
              Quadrantes organizados por tipo de remuneração
            </p>
          </div>

          <Button
            className="bg-primary text-black hover:bg-yellow-300 font-semibold"
            onClick={exportarBoletos}
          >
            Exportar boletos
          </Button>
        </div>

        <Card className="bg-gray-900 border-primary/30">
          <CardHeader>
            <CardTitle className="text-primary">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-300 mb-2 block">Cidade</Label>
                <Select value={selectedLoja} onValueChange={setSelectedLoja}>
                  <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-primary/30">
                    {LOJAS.map((loja) => (
                      <SelectItem
                        key={loja.id}
                        value={loja.id.toString()}
                        className="text-white"
                      >
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
                  onChange={(e) => setAno(parseInt(e.target.value, 10) || 2026)}
                  className="bg-gray-800 border-primary/30 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-300 mb-2 block">Mês</Label>
                <Select
                  value={mes.toString()}
                  onValueChange={(value) => setMes(parseInt(value, 10))}
                >
                  <SelectTrigger className="bg-gray-800 border-primary/30 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-primary/30">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem
                        key={m}
                        value={m.toString()}
                        className="text-white"
                      >
                        {new Date(2026, m - 1).toLocaleDateString("pt-BR", {
                          month: "long",
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gray-900 border-primary/30">
            <CardHeader>
              <CardTitle className="text-primary text-sm">
                Total Liquidez
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">R$ {money(totalLiquidezGeral)}</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-primary/30">
            <CardHeader>
              <CardTitle className="text-primary text-sm">
                Total Comissão / Premiação Auto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-300">
                R$ {money(totalComissaoGeral)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-primary/30">
            <CardHeader>
              <CardTitle className="text-primary text-sm">
                Total Boleto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold ${
                  totalBoletoGeral < 0 ? "text-red-500" : "text-green-400"
                }`}
              >
                R$ {money(totalBoletoGeral)}
              </p>
            </CardContent>
          </Card>
        </div>

        {linhas.length === 0 ? (
          <Card className="bg-gray-900 border-primary/30">
            <CardContent className="py-10 text-center text-gray-400">
              Nenhum funcionário ativo cadastrado para esta cidade.
            </CardContent>
          </Card>
        ) : (
          linhasPorQuadrante.map((grupo) => (
            <TabelaQuadrante
              key={grupo.key}
              titulo={grupo.titulo}
              descricao={grupo.descricao}
              linhas={grupo.linhas}
              quadrante={grupo.key}
              onOpenCellEditor={openCellEditor}
              onOpenPremioEditor={openPremioEditor}
              onOpenObsEditor={openObsEditor}
              onOpenValeEditor={openValeEditor}
              onOpenNegativoEditor={openNegativoEditor}
              onOpenRegraSemanaEditor={openRegraSemanaEditor}
            />
          ))
        )}
      </div>

      <Dialog
        open={cellEditor.open}
        onOpenChange={(open) => setCellEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">{cellEditor.label}</DialogTitle>
            <DialogDescription className="text-gray-400">
              Informe o valor e salve.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-gray-300">
              {cellEditor.mode === "money" ? "Valor em R$" : "Quantidade"}
            </Label>
            <Input
              type="number"
              step={cellEditor.mode === "money" ? "0.01" : "1"}
              value={cellEditor.value}
              onChange={(e) =>
                setCellEditor((prev) => ({ ...prev, value: e.target.value }))
              }
              className="bg-gray-800 border-primary/30 text-white"
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setCellEditor({
                  open: false,
                  funcionarioId: null,
                  campo: null,
                  label: "",
                  mode: "money",
                  value: "",
                })
              }
            >
              Cancelar
            </Button>
            <Button
              className="bg-primary text-black hover:bg-yellow-300"
              onClick={saveCellEditor}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={premioEditor.open}
        onOpenChange={(open) => setPremioEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Premiação</DialogTitle>
            <DialogDescription className="text-gray-400">
              Visualize a automática e adicione quantas premiações manuais quiser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {linhaPremioAtual?.funcao === "consultor_vendas" && (
              <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
                <p className="mb-3 text-sm font-semibold text-primary">
                  Discriminação automática
                </p>

                {premioAutomaticoAtual.detalhes.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Nenhuma premiação automática.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {premioAutomaticoAtual.detalhes.map((item, index) => (
                      <div
                        key={`${item.descricao}-${index}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-300">{item.descricao}</span>
                        <span className="text-yellow-300">
                          R$ {money(item.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {linhaPremioAtual?.funcao === "supervisor" && (() => {
  const premioJoinville = linhaPremioAtual.com1 || 0;
  const premioBlumenau = linhaPremioAtual.com2 || 0;
  const premioSaoJose = linhaPremioAtual.com3 || 0;
  const premioFlorianopolis = linhaPremioAtual.com4 || 0;

  const total =
    premioJoinville +
    premioBlumenau +
    premioSaoJose +
    premioFlorianopolis;

  return (
  <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
    <p className="font-semibold text-primary">
      Resumo automático do supervisor
    </p>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">Joinville</span>
      <span className="text-yellow-300">
        R$ {money(premioJoinville)}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">Blumenau</span>
      <span className="text-yellow-300">
        R$ {money(premioBlumenau)}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">São José</span>
      <span className="text-yellow-300">
        R$ {money(premioSaoJose)}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <span className="text-gray-300">Florianópolis</span>
      <span className="text-yellow-300">
        R$ {money(premioFlorianopolis)}
      </span>
    </div>

    <div className="flex items-center justify-between border-t border-primary/20 pt-2">
      <span className="text-gray-300 font-semibold">Total</span>
      <span className="text-yellow-300 font-bold">
        R$ {money(total)}
      </span>
    </div>
  </div>
);
})()}

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">
                Discriminação manual
              </p>

              {!linhaPremioAtual?.premiacoesManuais ||
              linhaPremioAtual.premiacoesManuais.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma premiação manual.</p>
              ) : (
                <div className="space-y-2">
                  {linhaPremioAtual.premiacoesManuais.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-primary/10 p-2"
                    >
                      <span className="text-sm text-gray-300">{item.descricao}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-yellow-300">
                          R$ {money(item.valor)}
                        </span>
                        <Button
                          className="bg-red-600 hover:bg-red-500 text-white"
                          size="sm"
                          onClick={() => removePremiacaoManual(item.id)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">
                Adicionar premiação manual
              </p>

              <div className="space-y-2">
                <Label className="text-gray-300">Descrição</Label>
                <Input
                  value={premioEditor.descricao}
                  onChange={(e) =>
                    setPremioEditor((prev) => ({
                      ...prev,
                      descricao: e.target.value,
                    }))
                  }
                  className="bg-gray-800 border-primary/30 text-white"
                  placeholder="Ex.: bônus campanha"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={premioEditor.valor}
                  onChange={(e) =>
                    setPremioEditor((prev) => ({
                      ...prev,
                      valor: e.target.value,
                    }))
                  }
                  className="bg-gray-800 border-primary/30 text-white"
                />
              </div>

              <Button
                className="bg-primary text-black hover:bg-yellow-300"
                onClick={addPremiacaoManual}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setPremioEditor({
                  open: false,
                  funcionarioId: null,
                  descricao: "",
                  valor: "",
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={valeEditor.open}
        onOpenChange={(open) => setValeEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Vale</DialogTitle>
            <DialogDescription className="text-gray-400">
              Adicione vale simples ou parcelado. Ao excluir um parcelado, ele sai
              do mês atual em diante.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">
                Vales do mês atual
              </p>

              {!linhaValeAtual?.vales || linhaValeAtual.vales.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum vale cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {linhaValeAtual.vales.map((vale) => (
                    <div
                      key={vale.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-primary/10 p-2"
                    >
                      <div className="text-sm text-gray-300">
                        <div>{vale.descricao}</div>
                        <div className="text-xs text-gray-500">
                          Parcela {vale.parcelaAtual}/{vale.totalParcelas}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-yellow-300">
                          R$ {money(vale.valor)}
                        </span>
                        <Button
                          className="bg-red-600 hover:bg-red-500 text-white"
                          size="sm"
                          onClick={() => removeVale(vale)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">Adicionar vale</p>

              <div className="space-y-2">
                <Label className="text-gray-300">Descrição</Label>
                <Input
                  value={valeEditor.descricao}
                  onChange={(e) =>
                    setValeEditor((prev) => ({
                      ...prev,
                      descricao: e.target.value,
                    }))
                  }
                  className="bg-gray-800 border-primary/30 text-white"
                  placeholder="Ex.: vale mercado"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Valor total</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={valeEditor.valor}
                  onChange={(e) =>
                    setValeEditor((prev) => ({
                      ...prev,
                      valor: e.target.value,
                    }))
                  }
                  className="bg-gray-800 border-primary/30 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={valeEditor.parcelas}
                  onChange={(e) =>
                    setValeEditor((prev) => ({
                      ...prev,
                      parcelas: e.target.value,
                    }))
                  }
                  className="bg-gray-800 border-primary/30 text-white"
                />
              </div>

              <Button
                className="bg-primary text-black hover:bg-yellow-300"
                onClick={addVale}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setValeEditor({
                  open: false,
                  funcionarioId: null,
                  descricao: "",
                  valor: "",
                  parcelas: "1",
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={obsEditor.open}
        onOpenChange={(open) => setObsEditor((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Observações</DialogTitle>
            <DialogDescription className="text-gray-400">
              Adicione observações e exclua a que desejar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={obsEditor.novaObs}
                onChange={(e) =>
                  setObsEditor((prev) => ({ ...prev, novaObs: e.target.value }))
                }
                className="bg-gray-800 border-primary/30 text-white"
                placeholder="Digite a observação"
              />
              <Button
                className="bg-primary text-black hover:bg-yellow-300"
                onClick={addObservacao}
              >
                Adicionar
              </Button>
            </div>

            <div className="rounded-md border border-primary/20 bg-gray-900 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">
                Observações cadastradas
              </p>

              {!linhaObsAtual?.observacoes ||
              linhaObsAtual.observacoes.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Nenhuma observação cadastrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {linhaObsAtual.observacoes.map((obs, index) => (
                    <div
                      key={`${obs}-${index}`}
                      className="flex items-center justify-between gap-4 rounded-md border border-primary/10 p-2"
                    >
                      <span className="text-sm text-gray-300">{obs}</span>
                      <Button
                        className="bg-red-600 hover:bg-red-500 text-white"
                        size="sm"
                        onClick={() => removeObservacao(index)}
                      >
                        Excluir
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setObsEditor({
                  open: false,
                  funcionarioId: null,
                  novaObs: "",
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={negativoEditor.open}
        onOpenChange={(open) =>
          setNegativoEditor((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Boleto negativo</DialogTitle>
            <DialogDescription className="text-gray-400">
              Deseja lançar esse valor como vale no próximo mês?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Funcionário</span>
              <span className="text-white">
                {negativoEditor.linha?.nome || "-"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-300">Valor</span>
              <span className="text-red-500">
                R$ {money(negativoEditor.linha?.boleto || 0)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNegativoEditor({ open: false, linha: null })}
            >
              Cancelar
            </Button>
            <Button
              className="bg-primary text-black hover:bg-yellow-300"
              onClick={lançarNegativoNoPróximoMês}
            >
              Adicionar no próximo mês
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={regraSemanaEditor.open}
        onOpenChange={(open) =>
          setRegraSemanaEditor((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="bg-gray-950 border-primary/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-primary">Detalhe da regra</DialogTitle>
            <DialogDescription className="text-gray-400">
              Meta, regra aplicada e valor do período selecionado.
            </DialogDescription>
          </DialogHeader>

          {detalheSemanaAtual && (
            <div className="space-y-4">
              <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Funcionário</span>
                  <span className="text-white">
                    {detalheSemanaAtual.linha.nome}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-300">Função</span>
                  <span className="text-white">
                    {detalheSemanaAtual.linha.funcao}
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-2 text-sm">
                <p className="font-semibold text-primary">
                  {detalheSemanaAtual.metaTitulo}
                </p>

                {detalheSemanaAtual.isSupervisor ? (
                  <div className="space-y-2 text-gray-300">
                    <div>
                      Recorde atual do grupo: R$ {money(SUPERVISOR_RECORDE_GRUPO)}
                    </div>
                    <div>Total do grupo acima de 1.420.000 = + R$ 1.000,00</div>
                    <div>Total do grupo acima de 1.540.000 = + R$ 1.000,00</div>
                    <div>Total do grupo acima de 1.600.000 = + R$ 1.000,00</div>
                    <div>Se passar o recorde = + 0,1% sobre o total do grupo</div>
                    {detalheSemanaAtual.extra && (
                      <div>{detalheSemanaAtual.extra}</div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-300 whitespace-pre-wrap break-words">
                    {detalheSemanaAtual.linha.regraMeta ||
                      "Sem meta cadastrada"}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-primary/20 bg-gray-900 p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">
                    {detalheSemanaAtual.baseLabel}
                  </span>
                  <span className="text-white">
                    {detalheSemanaAtual.isConsultor ||
                    detalheSemanaAtual.isRecepcao
                      ? detalheSemanaAtual.base.toLocaleString("pt-BR")
                      : `R$ ${money(detalheSemanaAtual.base)}`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-300">
                    {detalheSemanaAtual.isConsultor ||
                    detalheSemanaAtual.isRecepcao ||
                    detalheSemanaAtual.isSupervisor
                      ? "Regra aplicada"
                      : "% aplicado"}
                  </span>
                  <span className="text-yellow-300 font-semibold">
                    {detalheSemanaAtual.regraTexto}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-primary/20 pt-3">
                  <span className="text-white font-semibold">
                    {detalheSemanaAtual.isSupervisor
                      ? "Premiação da loja"
                      : "Valor do período"}
                  </span>
                  <span className="text-green-400 font-bold">
                    R$ {money(detalheSemanaAtual.comissao)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setRegraSemanaEditor({
                  open: false,
                  linha: null,
                  semana: null,
                })
              }
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}