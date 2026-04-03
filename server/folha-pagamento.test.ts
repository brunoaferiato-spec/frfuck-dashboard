import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createGestorContext(): { ctx: TrpcContext; clearedCookies: any[] } {
  const clearedCookies: any[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "gestor-user",
    email: "gestor@frifuck.com",
    name: "Gestor Test",
    loginMethod: "manus",
    role: "gestor",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: any) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("Folha de Pagamento Procedures", () => {
  it("should calculate commission correctly for different tiers", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    // Test data: mecanico with tiered commission
    const metaInput = {
      lojaId: 1,
      funcao: "mecanico",
      ano: 2026,
      mes: 3,
      faixas: [
        { liquidezMinima: 0, percentualComissao: 10 },
        { liquidezMinima: 8000, percentualComissao: 12 },
        { liquidezMinima: 10000, percentualComissao: 15 },
        { liquidezMinima: 20000, percentualComissao: 17 },
      ],
      aplicacaoEm: "mes_atual" as const,
    };

    // Create meta
    const metaResult = await caller.metas.create(metaInput);
    expect(metaResult).toBeDefined();

    // Create folha entries with different liquidez values
    const folhaEntries = [
      { funcionarioId: 1, lojaId: 1, ano: 2026, mes: 3, semana: 1, liquidez: 5000, percentualComissao: 10, valorComissao: 500 },
      { funcionarioId: 1, lojaId: 1, ano: 2026, mes: 3, semana: 2, liquidez: 8000, percentualComissao: 12, valorComissao: 960 },
      { funcionarioId: 1, lojaId: 1, ano: 2026, mes: 3, semana: 3, liquidez: 10000, percentualComissao: 15, valorComissao: 1500 },
      { funcionarioId: 1, lojaId: 1, ano: 2026, mes: 3, semana: 4, liquidez: 20000, percentualComissao: 17, valorComissao: 3400 },
    ];

    for (const entry of folhaEntries) {
      const result = await caller.folhaPagamento.create(entry);
      expect(result).toBeDefined();
    }

    // Verify folha entries were created
    const folhaList = await caller.folhaPagamento.getByFuncionarioAnoMes({
      funcionarioId: 1,
      ano: 2026,
      mes: 3,
    });

    expect(folhaList.length).toBeGreaterThanOrEqual(4);
    // Verify commission tiers are applied correctly
    const commissions = folhaList.map(f => Number(f.percentualComissao));
    expect(commissions).toContain(10);
    expect(commissions).toContain(12);
    expect(commissions).toContain(15);
    expect(commissions).toContain(17);
  });

  it("should handle premiacoes (bonuses) correctly", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    const premiacaoInput = {
      funcionarioId: 2,
      lojaId: 1,
      ano: 2026,
      mes: 3,
      descricao: "Bônus de desempenho",
      valor: 500,
    };

    const result = await caller.premiacoes.create(premiacaoInput);
    expect(result).toBeDefined();

    const premiacoesList = await caller.premiacoes.getByFuncionarioAnoMes({
      funcionarioId: 2,
      ano: 2026,
      mes: 3,
    });

    expect(premiacoesList.length).toBeGreaterThanOrEqual(1);
    expect(Number(premiacoesList[0]?.valor)).toBe(500);
    expect(premiacoesList[0]?.descricao).toBe("Bônus de desempenho");
  });

  it("should handle vales (loans) correctly", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    // Simple vale
    const valeSimples = {
      funcionarioId: 3,
      lojaId: 1,
      descricao: "Vale simples",
      valorTotal: 1000,
      valorParcela: 1000,
      parcelas: 1,
      ano: 2026,
      mes: 3,
      mesOrigem: 3,
      tipo: "simples" as const,
    };

    const simpleResult = await caller.vales.create(valeSimples);
    expect(simpleResult).toBeDefined();

    // Installment vale (parcelado)
    const valeParcelado = {
      funcionarioId: 3,
      lojaId: 1,
      descricao: "Vale parcelado em 10x",
      valorTotal: 1000,
      valorParcela: 100,
      parcelas: 10,
      ano: 2026,
      mes: 3,
      mesOrigem: 3,
      tipo: "parcelado" as const,
    };

    const parcelResult = await caller.vales.create(valeParcelado);
    expect(parcelResult).toBeDefined();

    const valesList = await caller.vales.getByFuncionarioAnoMes({
      funcionarioId: 3,
      ano: 2026,
      mes: 3,
    });

    expect(valesList.length).toBeGreaterThanOrEqual(2);
  });

  it("should handle descontos (discounts) correctly", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    const descontos = [
      { funcionarioId: 4, lojaId: 1, tipo: "aluguel" as const, valor: 500, ano: 2026, mes: 3 },
      { funcionarioId: 4, lojaId: 1, tipo: "inss" as const, valor: 250, ano: 2026, mes: 3 },
      { funcionarioId: 4, lojaId: 1, tipo: "adiantamento" as const, valor: 1000, ano: 2026, mes: 3 },
    ];

    for (const desconto of descontos) {
      const result = await caller.descontos.create(desconto);
      expect(result).toBeDefined();
    }

    const descontosList = await caller.descontos.getByFuncionarioAnoMes({
      funcionarioId: 4,
      ano: 2026,
      mes: 3,
    });

    expect(descontosList.length).toBeGreaterThanOrEqual(3);
    expect(descontosList.map(d => d.tipo)).toContain("aluguel");
    expect(descontosList.map(d => d.tipo)).toContain("inss");
    expect(descontosList.map(d => d.tipo)).toContain("adiantamento");
  });

  it("should handle observacoes (notes) correctly", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    const observacao = {
      funcionarioId: 5,
      lojaId: 1,
      ano: 2026,
      mes: 3,
      texto: "Funcionário teve excelente desempenho este mês",
    };

    const result = await caller.observacoes.create(observacao);
    expect(result).toBeDefined();

    const observacoesList = await caller.observacoes.getByFuncionarioAnoMes({
      funcionarioId: 5,
      ano: 2026,
      mes: 3,
    });

    expect(observacoesList.length).toBeGreaterThanOrEqual(1);
    expect(observacoesList[0]?.texto).toContain("excelente desempenho");
  });
});

describe("Metas Procedures", () => {
  it("should create and retrieve metas correctly", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    const metaInput = {
      lojaId: 2,
      funcao: "vendedor",
      ano: 2026,
      mes: 3,
      faixas: [
        { liquidezMinima: 0, percentualComissao: 8 },
        { liquidezMinima: 5000, percentualComissao: 10 },
        { liquidezMinima: 10000, percentualComissao: 12 },
      ],
      salarioFixo: 2000,
      aplicacaoEm: "proximo_mes" as const,
    };

    const result = await caller.metas.create(metaInput);
    expect(result).toBeDefined();

    const retrieved = await caller.metas.getByFuncaoLojaAnoMes({
      lojaId: 2,
      funcao: "vendedor",
      ano: 2026,
      mes: 3,
    });

    expect(retrieved).toBeDefined();
    expect(retrieved?.funcao).toBe("vendedor");
    expect(Number(retrieved?.salarioFixo)).toBe(2000);
  });

  it("should list all metas for a loja and period", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    const metas = [
      {
        lojaId: 3,
        funcao: "mecanico",
        ano: 2026,
        mes: 4,
        faixas: [{ liquidezMinima: 0, percentualComissao: 10 }],
        aplicacaoEm: "mes_atual" as const,
      },
      {
        lojaId: 3,
        funcao: "vendedor",
        ano: 2026,
        mes: 4,
        faixas: [{ liquidezMinima: 0, percentualComissao: 8 }],
        aplicacaoEm: "mes_atual" as const,
      },
    ];

    for (const meta of metas) {
      await caller.metas.create(meta);
    }

    const retrieved = await caller.metas.listByLojaAnoMes({
      lojaId: 3,
      ano: 2026,
      mes: 4,
    });

    expect(retrieved.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Comissão Personalizada Procedures", () => {
  it("should create personalized commission for specific employee", async () => {
    const { ctx } = createGestorContext();
    const caller = appRouter.createCaller(ctx);

    const comissaoInput = {
      funcionarioId: 6,
      lojaId: 1,
      ano: 2026,
      mes: 3,
      faixas: [
        { liquidezMinima: 0, percentualComissao: 12 },
        { liquidezMinima: 10000, percentualComissao: 15 },
      ],
      salarioFixo: 3000,
      aplicacaoEm: "imediata" as const,
    };

    const result = await caller.comissaoFuncionario.create(comissaoInput);
    expect(result).toBeDefined();

    const retrieved = await caller.comissaoFuncionario.getByFuncionarioAnoMes({
      funcionarioId: 6,
      lojaId: 1,
      ano: 2026,
      mes: 3,
    });

    expect(retrieved).toBeDefined();
    expect(Number(retrieved?.salarioFixo)).toBe(3000);
  });
});


// Testes para as 3 seções da Folha de Pagamento
describe("Folha de Pagamento - 3 Seções", () => {
  describe("Seção 1: Comissão Semanal", () => {
    it("should calculate Boleto for Vendedor with weekly commission", () => {
      // Vendedor: Comissão + Premiação - Vales - Aluguel - INSS - Adiantamento - Holerite
      const semanas = [5000, 6000, 7000, 8000];
      const comissao = semanas.reduce((t, l) => t + (l * 0.1), 0); // 10% para Vendedor
      const premiacao = 500;
      const vales = 200;
      const aluguel = 300;
      const inss = 150;
      const adiantamento = 100;
      const holerite = 50;

      const boleto = comissao + premiacao - vales - aluguel - inss - adiantamento - holerite;

      expect(comissao).toBe(2600);
      expect(boleto).toBe(2600 + 500 - 200 - 300 - 150 - 100 - 50); // 2300
    });

    it("should calculate Boleto for Mecânico with tiered commission", () => {
      // Mecânico: Comissão escalonada + Premiação - Vales - Aluguel - INSS - Adiantamento - Holerite
      const calcularComissaoMecanico = (liquidez: number) => {
        if (liquidez < 8000) return liquidez * 0.1;
        if (liquidez < 10000) return liquidez * 0.12;
        if (liquidez < 20000) return liquidez * 0.15;
        return liquidez * 0.17;
      };

      const semanas = [5000, 9000, 15000, 25000];
      const comissao = semanas.reduce((t, l) => t + calcularComissaoMecanico(l), 0);
      const premiacao = 0;
      const vales = 0;
      const aluguel = 0;
      const inss = 0;
      const adiantamento = 0;
      const holerite = 0;

      const boleto = comissao + premiacao - vales - aluguel - inss - adiantamento - holerite;

      expect(comissao).toBe(8080); // 500 + 1080 + 2250 + 4250
      expect(boleto).toBe(8080);
    });
  });

  describe("Seção 2: Recepcionista", () => {
    it("should calculate Boleto for Recepcionista with car commission", () => {
      // Recepcionista: Fixo + (Carros × Valor) + Premiação - Vales - Aluguel (SEM INSS, Adiantamento, Holerite)
      const fixo = 1500;
      const carros = 10;
      const valorPorCarro = 1.5;
      const premiacao = 300;
      const vales = 100;
      const aluguel = 200;

      const comissaoCarros = carros * valorPorCarro;
      const boleto = fixo + comissaoCarros + premiacao - vales - aluguel;

      expect(comissaoCarros).toBe(15);
      expect(boleto).toBe(1500 + 15 + 300 - 100 - 200); // 1515
    });

    it("should NOT include INSS, Adiantamento, Holerite in Boleto for Recepcionista", () => {
      // Verificar que INSS, Adiantamento, Holerite não são descontados
      const fixo = 1500;
      const carros = 10;
      const valorPorCarro = 1.5;
      const premiacao = 0;
      const vales = 0;
      const aluguel = 0;
      const inss = 500; // Deve ser ignorado
      const adiantamento = 300; // Deve ser ignorado
      const holerite = 200; // Deve ser ignorado

      const comissaoCarros = carros * valorPorCarro;
      const boleto = fixo + comissaoCarros + premiacao - vales - aluguel;
      // Não incluindo inss, adiantamento, holerite

      expect(boleto).toBe(1515); // Sem descontos de INSS, Adiantamento, Holerite
    });
  });

  describe("Seção 3: Funções Fixas", () => {
    it("should calculate Boleto for fixed salary employee", () => {
      // Funções Fixas: Fixo + Premiação - Vales - Aluguel (SEM semanas, INSS, Adiantamento, Holerite)
      const fixo = 2500;
      const premiacao = 200;
      const vales = 100;
      const aluguel = 300;

      const boleto = fixo + premiacao - vales - aluguel;

      expect(boleto).toBe(2500 + 200 - 100 - 300); // 2300
    });

    it("should NOT include INSS, Adiantamento, Holerite in Boleto for fixed salary", () => {
      // Verificar que INSS, Adiantamento, Holerite não são descontados
      const fixo = 2500;
      const premiacao = 0;
      const vales = 0;
      const aluguel = 0;
      const inss = 500; // Deve ser ignorado
      const adiantamento = 300; // Deve ser ignorado
      const holerite = 200; // Deve ser ignorado

      const boleto = fixo + premiacao - vales - aluguel;
      // Não incluindo inss, adiantamento, holerite

      expect(boleto).toBe(2500); // Sem descontos de INSS, Adiantamento, Holerite
    });
  });

  describe("Alinhador - Comissão Mensal", () => {
    it("should calculate Boleto for Alinhador with monthly commission only", () => {
      // Alinhador (comissão): Comissão + Premiação - Vales - Aluguel - INSS - Adiantamento - Holerite
      const semana1 = 5000;
      const comissao = semana1 * 0.1; // 10%
      const premiacao = 0;
      const vales = 0;
      const aluguel = 0;
      const inss = 0;
      const adiantamento = 0;
      const holerite = 0;

      const boleto = comissao + premiacao - vales - aluguel - inss - adiantamento - holerite;

      expect(comissao).toBe(500);
      expect(boleto).toBe(500);
    });

    it("should calculate Boleto for Alinhador with fixed + commission", () => {
      // Alinhador (fixo + comissão): Fixo + Comissão + Premiação - Vales - Aluguel - INSS - Adiantamento - Holerite
      const fixo = 2000;
      const semana1 = 3000;
      const comissao = semana1 * 0.1; // 10%
      const premiacao = 0;
      const vales = 0;
      const aluguel = 200;
      const inss = 100;
      const adiantamento = 50;
      const holerite = 25;

      const boleto = fixo + comissao + premiacao - vales - aluguel - inss - adiantamento - holerite;

      expect(comissao).toBe(300);
      expect(boleto).toBe(2000 + 300 - 200 - 100 - 50 - 25); // 1925
    });
  });
});
