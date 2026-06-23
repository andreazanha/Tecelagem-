// Gera o "Pix Copia e Cola" (BR Code EMV) com valor já preenchido.
// O recebedor é a costureira/prestador (chave Pix dela); quem paga é a empresa.

// Remove acentos e caracteres não permitidos no nome/cidade do BR Code.
function ascii(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,-]/g, "")
    .trim()
    .toUpperCase();
}

// Campo TLV: id + tamanho(2) + valor.
function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return id + len + value;
}

// CRC16/CCITT-FALSE (polinômio 0x1021, inicial 0xFFFF) — exigido pelo Pix.
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface PixDados {
  chave: string;
  nome: string;
  cidade?: string;
  valor: number;
  txid?: string;
}

export function pixPayload({ chave, nome, cidade, valor, txid = "***" }: PixDados): string {
  const gui = tlv("00", "br.gov.bcb.pix");
  const key = tlv("01", (chave || "").trim());
  const mai = tlv("26", gui + key); // Merchant Account Information — Pix
  const nomeR = ascii(nome).slice(0, 25) || "RECEBEDOR";
  const cidadeR = ascii(cidade || "BRASIL").slice(0, 15) || "BRASIL";
  const txidR = (txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  let p = "";
  p += tlv("00", "01"); // payload format indicator
  p += mai;
  p += tlv("52", "0000"); // merchant category code
  p += tlv("53", "986"); // moeda BRL
  if (valor > 0) p += tlv("54", valor.toFixed(2)); // valor
  p += tlv("58", "BR"); // país
  p += tlv("59", nomeR); // nome do recebedor
  p += tlv("60", cidadeR); // cidade
  p += tlv("62", tlv("05", txidR)); // additional data — reference label
  p += "6304"; // CRC placeholder
  return p + crc16(p);
}
