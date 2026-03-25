import { useState } from "react";

type Unidade = "Joinville" | "Blumenau" | "São José" | "Florianópolis";

type TipoMeta = "tipo1" | "tipo2";

interface Funcionario {
  id: number;
  nome: string;
  unidade: Unidade;
  tipoMeta: TipoMeta;
}

interface Registro {
  funcionarioId: number;
  semana: number;
  carros: number;
}

export default function ConsultorVendas() {
  const [funcionarios] = useState<Funcionario[]>([
    { id: 1, nome: "João", unidade: "Joinville", tipoMeta: "tipo1" },
    { id: 2, nome: "Carlos", unidade: "Blumenau", tipoMeta: "tipo2" },
  ]);

  const [registros, setRegistros] = useState<Registro[]>([]);
  const [premios, setPremios] = useState<any[]>([]);
  const [vales, setVales] = useState<any[]>([]);
  const [observacoes, setObservacoes] = useState<any[]>([]);

  function getCarros(funcionarioId: number, semana: number) {
    return (
      registros.find((r) => r.funcionarioId === funcionarioId && r.semana === semana)?.carros || 0
    );
  }

  function setCarros(funcionarioId: number, semana: number) {
    const valor = prompt("Quantidade de carros:");
    if (!valor) return;

    const numero = Number(valor);

    setRegistros((prev) => {
      const existe = prev.find(
        (r) => r.funcionarioId === funcionarioId && r.semana === semana
      );

      if (existe) {
        return prev.map((r) =>
          r.funcionarioId === funcionarioId && r.semana === semana
            ? { ...r, carros: numero }
            : r
        );
      }

      return [...prev, { funcionarioId, semana, carros: numero }];
    });
  }

  function calcularTipo1(unidade: Unidade, carros: number) {
    let valorPorCarro = 8;
    let bonus = 0;

    if (unidade === "Blumenau") {
      if (carros >= 100) {
        valorPorCarro = 10;
        bonus = 200;
      } else if (carros >= 83) valorPorCarro = 10;
      else if (carros >= 75) valorPorCarro = 9;
    } else {
      if (carros >= 65) {
        valorPorCarro = 10;
        bonus = 200;
      } else if (carros >= 55) valorPorCarro = 10;
      else if (carros >= 50) valorPorCarro = 9;
    }

    return { valorPorCarro, bonus };
  }

  function calcularTipo2(unidade: Unidade, total: number) {
    let valor = Math.floor(total / 25) * 100;
    let bonus = 0;

    if (unidade === "Blumenau") {
      if (total >= 450) bonus = 450;
      else if (total >= 400) bonus = 400;
      else if (total >= 350) bonus = 350;
      else if (total >= 300) bonus = 300;
    } else {
      if (total >= 350) bonus = 350;
      else if (total >= 300) bonus = 300;
      else if (total >= 250) bonus = 250;
      else if (total >= 200) bonus = 200;
    }

    return { valor, bonus };
  }

  function getTotal(funcionarioId: number) {
    return [1, 2, 3, 4].reduce((acc, s) => acc + getCarros(funcionarioId, s), 0);
  }

  function getVale(funcionarioId: number) {
    return vales
      .filter((v) => v.funcionarioId === funcionarioId)
      .reduce((acc, v) => acc + v.valor, 0);
  }

  function addVale(funcionarioId: number) {
    const valor = prompt("Valor do vale:");
    if (!valor) return;

    setVales((prev) => [...prev, { funcionarioId, valor: Number(valor) }]);
  }

  function addObs(funcionarioId: number) {
    const texto = prompt("Observação:");
    if (!texto) return;

    setObservacoes((prev) => [...prev, { funcionarioId, texto }]);
  }

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", padding: 20 }}>
      <h1 style={{ color: "#fbbf24" }}>Consultor de Vendas</h1>

      <table style={{ width: "100%", marginTop: 20 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Tipo</th>
            <th>S1</th>
            <th>S2</th>
            <th>S3</th>
            <th>S4</th>
            <th>Total</th>
            <th>Comissão</th>
            <th>Premiação</th>
            <th>Vale</th>
            <th>Boleto</th>
            <th>Obs</th>
          </tr>
        </thead>

        <tbody>
          {funcionarios.map((f) => {
            const total = getTotal(f.id);

            let comissao = 0;
            let premio = 0;

            if (f.tipoMeta === "tipo1") {
              const r = calcularTipo1(f.unidade, total);
              comissao = total * r.valorPorCarro;
              premio = r.bonus;
            } else {
              const r = calcularTipo2(f.unidade, total);
              comissao = r.valor;
              premio = r.bonus;
            }

            const vale = getVale(f.id);
            const boleto = comissao + premio - vale;

            return (
              <tr key={f.id}>
                <td>{f.nome}</td>
                <td>{f.tipoMeta}</td>

                {[1, 2, 3, 4].map((s) => (
                  <td key={s}>
                    <button onClick={() => setCarros(f.id, s)}>
                      {getCarros(f.id, s)}
                    </button>
                  </td>
                ))}

                <td>{total}</td>
                <td>R$ {comissao}</td>
                <td>R$ {premio}</td>

                <td>
                  <button onClick={() => addVale(f.id)}>R$ {vale}</button>
                </td>

                <td
                  onClick={() => {
                    if (boleto < 0) addVale(f.id);
                  }}
                  style={{ color: boleto < 0 ? "red" : "white", cursor: "pointer" }}
                >
                  R$ {boleto}
                </td>

                <td>
                  <button onClick={() => addObs(f.id)}>OBS</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
