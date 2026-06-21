// Histórico global de ações: desfazer (até 5) e refazer.
// Cada ação registra como se desfaz e como se refaz (chamadas à API).
export interface Acao {
  label: string;
  desfazer: () => Promise<unknown>;
  refazer: () => Promise<unknown>;
}

const MAX = 5;
let pilhaDesfazer: Acao[] = [];
let pilhaRefazer: Acao[] = [];
const subs = new Set<() => void>();

function avisar() {
  subs.forEach((f) => f());
}
// Pede para a tela atual recarregar os dados após desfazer/refazer.
function recarregarTelas() {
  window.dispatchEvent(new CustomEvent("historico:mudou"));
}

export const historico = {
  registrar(a: Acao) {
    pilhaDesfazer.push(a);
    if (pilhaDesfazer.length > MAX) pilhaDesfazer.shift();
    pilhaRefazer = [];
    avisar();
  },
  async desfazer() {
    const a = pilhaDesfazer.pop();
    if (!a) return;
    try {
      await a.desfazer();
    } catch (e) {
      pilhaDesfazer.push(a);
      avisar();
      throw e;
    }
    pilhaRefazer.push(a);
    if (pilhaRefazer.length > MAX) pilhaRefazer.shift();
    avisar();
    recarregarTelas();
  },
  async refazer() {
    const a = pilhaRefazer.pop();
    if (!a) return;
    try {
      await a.refazer();
    } catch (e) {
      pilhaRefazer.push(a);
      avisar();
      throw e;
    }
    pilhaDesfazer.push(a);
    avisar();
    recarregarTelas();
  },
  podeDesfazer: () => pilhaDesfazer.length > 0,
  podeRefazer: () => pilhaRefazer.length > 0,
  rotuloDesfazer: () => pilhaDesfazer[pilhaDesfazer.length - 1]?.label,
  rotuloRefazer: () => pilhaRefazer[pilhaRefazer.length - 1]?.label,
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};
