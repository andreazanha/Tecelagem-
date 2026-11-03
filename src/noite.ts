// PROTEÇÃO NOTURNA (Reserva EL — Etapa 1). Fuso: America/São_Paulo.
// Módulo PURO e determinístico (usa só Date/Intl) — SEM dependência do Worker — para poder ser
// testado isoladamente com qualquer timestamp. Regra aprovada pela Big Tricot:
//   • prazo inicial = 12h para TODO carrinho (calculado em calcularJanela12h);
//   • PERÍODO NOTURNO = 20:00–08:00. Se o vencimento cair nesse intervalo, a reserva/carrinho
//     fica PROTEGIDA até as 10:00 da manhã em que a noite termina;
//   • a prorrogação (+6h) parte do vencimento EFETIVO atual e, se o resultado cair de novo na
//     madrugada, reaplica a proteção (volta para as 10:00).
// Tudo é gravado como texto UTC ('YYYY-MM-DD HH:MM:SS'), o MESMO formato de datetime('now') do
// SQLite, para comparar direto no banco. O relógio é sempre o do SERVIDOR.

const H = 3600000;
const TZ = "America/Sao_Paulo";
export const NOITE_INICIO = 20; // 20:00 (inclusive) começa a noite
export const NOITE_FIM = 8; // 08:00 (exclusive) termina a noite
export const PROTECAO_HORA = 10; // vencimento protegido volta para as 10:00

// 'YYYY-MM-DD HH:MM:SS' (UTC) de um instante — igual ao datetime('now') do SQLite.
export const toSqlUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

// Offset do fuso de SP, em minutos, no instante dado (hoje -180; robusto se o horário de verão
// voltar algum dia). Técnica padrão: formata o instante no fuso e compara com o UTC.
function offsetSPmin(ms: number): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const h = p.hour === "24" ? 0 : Number(p.hour);
  const localComoUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute), Number(p.second));
  return Math.round((localComoUTC - ms) / 60000);
}

// Componentes de data/hora no fuso de SP (hora 0–23).
function partesSP(ms: number): { ano: number; mes: number; dia: number; hora: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const hora = p.hour === "24" ? 0 : Number(p.hour);
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora };
}

// Epoch ms de uma hora "de parede" no fuso de SP (mes 1–12). Sem horário de verão o cálculo é exato.
function spParaMs(ano: number, mes: number, dia: number, hora: number, min = 0): number {
  const aprox = Date.UTC(ano, mes - 1, dia, hora, min, 0);
  return aprox - offsetSPmin(aprox) * 60000;
}

// Aplica a PROTEÇÃO NOTURNA a um vencimento (epoch ms). Devolve o vencimento EFETIVO e se protegeu.
//  • 20:00–23:59 → manhã é no DIA SEGUINTE; 00:00–07:59 → manhã é no MESMO dia. Sempre 10:00 SP.
//  • Fora da noite (08:00–19:59) → mantém o vencimento, sem proteção.
export function protegerNoturno(baseMs: number): { exp: number; protegido: boolean } {
  const { ano, mes, dia, hora } = partesSP(baseMs);
  const noturno = hora >= NOITE_INICIO || hora < NOITE_FIM;
  if (!noturno) return { exp: baseMs, protegido: false };
  let y = ano, mo = mes, d = dia;
  if (hora >= NOITE_INICIO) {
    const nd = new Date(Date.UTC(ano, mes - 1, dia));
    nd.setUTCDate(nd.getUTCDate() + 1); // avança para a manhã do dia seguinte
    y = nd.getUTCFullYear(); mo = nd.getUTCMonth() + 1; d = nd.getUTCDate();
  }
  return { exp: spParaMs(y, mo, d, PROTECAO_HORA, 0), protegido: true };
}

// Janela inicial de 12h (base = agora + 12h) JÁ com proteção noturna aplicada. Devolve os valores
// prontos para o SQLite: o vencimento EFETIVO, o ORIGINAL (base, antes da proteção, para auditoria)
// e se a proteção noturna foi aplicada.
export function calcularJanela12h(agoraMs: number = Date.now()): { expira: string; original: string; noturna: number } {
  const base = agoraMs + 12 * H;
  const { exp, protegido } = protegerNoturno(base);
  return { expira: toSqlUTC(exp), original: toSqlUTC(base), noturna: protegido ? 1 : 0 };
}
