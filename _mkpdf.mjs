import { writeFileSync } from "node:fs";
const lines=["PEDIDO DE VENDA  No 8842","Cliente: LOJA K - MALHAS & CIA LTDA","Vendedor: Marcos R.","Data: 14/06/2026   Entrega: 22/06/2026"];
let content="BT /F1 12 Tf 50 800 Td 14 TL ";for(const l of lines)content+=`(${l}) Tj T* `;content+="ET";
const objs=["<</Type/Catalog/Pages 2 0 R>>","<</Type/Pages/Kids[3 0 R]/Count 1>>","<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",`<</Length ${content.length}>>\nstream\n${content}\nendstream`,"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
let pdf="%PDF-1.4\n";const off=[];objs.forEach((o,i)=>{off.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
const x=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(const o of off)pdf+=String(o).padStart(10,"0")+" 00000 n \n";
pdf+=`trailer\n<</Size ${objs.length+1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;writeFileSync("./_pf.pdf",pdf,"latin1");
