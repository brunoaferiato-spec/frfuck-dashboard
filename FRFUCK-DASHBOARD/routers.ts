    getByFuncaoLojaAnoMes: gestorProcedure
      .input(z.object({ lojaId: z.number(), funcao: z.string(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getMetaByFuncaoLojaAnoMes(input.lojaId, input.funcao, input.ano, input.mes);
      }),
    listByLojaAnoMes: gestorProcedure
      .input(z.object({ lojaId: z.number(), ano: z.number(), mes: z.number() }))
      .query(async ({ input }) => {
        return await getMetasByLoja(input.lojaId, input.ano, input.mes);
      }),
    create: gestorProcedure
      .input(
        z.object({
          lojaId: z.number(),
          funcao: z.string(),
          ano: z.number(),
          mes: z.number(),
          faixas: z.array(z.object({ liquidezMinima: z.number(), percentualComissao: z.number() })),
          salarioFixo: z.number().optional(),
          aplicacaoEm: z.enum(["imediata", "mes_atual", "proximo_mes"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const { faixas, salarioFixo, ...rest } = input;
        const result = await db.insert(metas).values({
          ...rest,
          salarioFixo: salarioFixo || null,
          faixas: JSON.stringify(faixas) as any,
        } as any);
        return result;
      }),
  }),

  // ===== Folha de Pagamento =====
  folhaPagamento: router({
    getByFuncionarioAnoMes: gestorProcedure