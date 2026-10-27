import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { db } from "./comprasPecas";
import { EMPRESAS } from "@shared/empresas";
import { INICIO_CICLO, segundaDaSemana, semanaDoCiclo, somarDias } from "@shared/estoqueSemanal";
import { SEM_COMPRA, dataSP, exigirSupervisor, iso } from "./estoqueBase";

// Premiação dos estoquistas: ganha na segunda a bonificação da semana que passou quem entregou tudo no prazo.
// Dias que contam: segunda a sábado (domingo a loja não abre).
// - Compras x OS do dia D: concluído no próprio dia D (até fechar a loja).
// - Resumo geral de vendas do dia D: concluído até o dia seguinte; o de sábado vale até segunda.
// - Contagem semanal: entregue até sábado.
// Erros no Compras x OS não tiram o prêmio: aparecem para o supervisor analisar.

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ok = no prazo • atrasado = feito fora do prazo • falta = prazo passou sem entregar
// andamento = começou e ainda dá tempo • aguardando = não começou e ainda dá tempo
export type SituacaoPrazo = "ok" | "atrasado" | "falta" | "andamento" | "aguardando";

function situacao(feitoEm: string | null, iniciado: boolean, prazo: string, hoje: string): SituacaoPrazo {
  if (feitoEm) return feitoEm <= prazo ? "ok" : "atrasado";
  if (hoje > prazo) return "falta";
  return iniciado ? "andamento" : "aguardando";
}

function diaDe(v: unknown) {
  return v ? dataSP(v instanceof Date ? v : new Date(String(v))) : null;
}

export const premiacoesRouter = router({
  semana: protectedProcedure.input(z.object({ semanaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).query(async ({ ctx, input }) => {
    exigirSupervisor(ctx);
    const semana = segundaDaSemana(input.semanaInicio);
    if (semana < INICIO_CICLO) throw new TRPCError({ code: "BAD_REQUEST", message: "As premiações começam na semana de 26/10/2026." });
    const hoje = dataSP();
    const dias = DIAS.map((nome, k) => ({ nome, data: somarDias(semana, k) }));
    const sabado = dias[5].data;

    const [resumos] = await db().query<any[]>(
      `SELECT lojaId, dataRelatorio, status, concluidaEm FROM estoque_conferencias WHERE dataRelatorio BETWEEN ? AND ?`,
      [semana, sabado]
    );
    const [compras] = await db().query<any[]>(
      `SELECT id, lojaId, dataRelatorio, status, concluidaEm, totalErrados, totalComprados, arquivoNome FROM estoque_comprasos WHERE dataRelatorio BETWEEN ? AND ?`,
      [semana, sabado]
    );
    const [semanais] = await db().query<any[]>(`SELECT lojaId, status, entregueEm FROM estoque_semanal WHERE semanaInicio=?`, [semana]);
    const [usuarios] = await db().query<any[]>(`SELECT name, lojaId FROM users WHERE role='estoque' AND (isActive=1 OR isActive IS NULL)`);

    const lojas = EMPRESAS.map((e) => {
      const motivos: string[] = [];
      const linhaDias = dias.map((d) => {
        const r = resumos.find((x) => Number(x.lojaId) === e.lojaId && iso(x.dataRelatorio) === d.data);
        const c = compras.find((x) => Number(x.lojaId) === e.lojaId && iso(x.dataRelatorio) === d.data);
        // Resumo: até o dia seguinte; o de sábado até segunda.
        const prazoResumo = somarDias(d.data, d.nome === "Sáb" ? 2 : 1);
        const resumo = situacao(r && String(r.status) === "concluida" ? diaDe(r.concluidaEm) : null, !!r, prazoResumo, hoje);
        const comprasSit = situacao(c && String(c.status) === "concluida" ? diaDe(c.concluidaEm) : null, !!c, d.data, hoje);
        const rotulo = `${d.nome} ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}`;
        if (resumo === "falta") motivos.push(`Resumo de vendas de ${rotulo} não foi entregue`);
        if (resumo === "atrasado") motivos.push(`Resumo de vendas de ${rotulo} entregue atrasado`);
        if (comprasSit === "falta") motivos.push(`Compras x OS de ${rotulo} não foi entregue`);
        if (comprasSit === "atrasado") motivos.push(`Compras x OS de ${rotulo} entregue atrasado`);
        return {
          ...d, prazoResumo,
          resumo,
          compras: comprasSit,
          comprasId: c ? Number(c.id) : null,
          semCompra: c ? String(c.arquivoNome || "") === SEM_COMPRA : false,
          erros: c ? Number(c.totalErrados || 0) : 0,
          comprados: c ? Number(c.totalComprados || 0) : 0,
        };
      });
      const s = semanais.find((x) => Number(x.lojaId) === e.lojaId);
      const semanal = semanaDoCiclo(semana)
        ? situacao(s && String(s.status) === "entregue" ? diaDe(s.entregueEm) : null, !!s, sabado, hoje)
        : "ok";
      if (semanal === "falta") motivos.push("Contagem semanal não foi entregue");
      if (semanal === "atrasado") motivos.push("Contagem semanal entregue depois de sábado");
      const todas = [...linhaDias.flatMap((d) => [d.resumo, d.compras]), semanal];
      const perdeu = todas.some((x) => x === "falta" || x === "atrasado");
      const fechou = todas.every((x) => x === "ok");
      return {
        lojaId: e.lojaId, loja: e.loja,
        estoquistas: usuarios.filter((u) => Number(u.lojaId) === e.lojaId).map((u) => String(u.name || "")).filter(Boolean),
        resultado: (perdeu ? "nao_ganhou" : fechou ? "ganhou" : "aguardando") as "ganhou" | "nao_ganhou" | "aguardando",
        motivos,
        dias: linhaDias,
        semanal,
        totalErros: linhaDias.reduce((t, d) => t + d.erros, 0),
      };
    });

    return { semanaInicio: semana, sabado, numero: semanaDoCiclo(semana), lojas };
  }),
});
