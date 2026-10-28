// Tempo de almoço digitado livre no cadastro do funcionário ("0:15", "1:30", "1h30" ou "90").
export const ALMOCO_MINIMO_MINUTOS = 15;
export const ALMOCO_MAXIMO_MINUTOS = 360;

export function textoDuracaoAlmoco(minutosRaw: number | string | null | undefined) {
  if (minutosRaw === null || minutosRaw === undefined || minutosRaw === "") return "";
  const minutos = Number(minutosRaw);
  if (!Number.isFinite(minutos) || minutos <= 0) return "";
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;
}

/** null = campo vazio; NaN = texto que não dá para entender. */
export function minutosDuracaoAlmoco(texto: string) {
  const limpo = String(texto || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!limpo) return null;

  if (/^\d+$/.test(limpo)) return Number(limpo);

  const partes = limpo.match(/^(\d{1,2})(?::|h)(\d{0,2})(?:min|m)?$/);
  if (!partes) return NaN;

  const minutos = Number(partes[2] || 0);
  if (minutos > 59) return NaN;
  return Number(partes[1]) * 60 + minutos;
}

export function erroDuracaoAlmoco(texto: string) {
  const minutos = minutosDuracaoAlmoco(texto);
  if (minutos === null) return null;
  if (!Number.isInteger(minutos)) return "Tempo de almoço inválido. Use horas:minutos, ex.: 0:15 ou 1:30.";
  if (minutos < ALMOCO_MINIMO_MINUTOS) return "O tempo de almoço deve ter pelo menos 15 minutos.";
  if (minutos > ALMOCO_MAXIMO_MINUTOS) return "O tempo de almoço não pode passar de 6 horas.";
  return null;
}
