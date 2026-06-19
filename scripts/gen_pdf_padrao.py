# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'
def text(x,y,s,size=12,fill="#1f2937",weight="normal",anchor="start",ls=None,fam=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    ff=f' font-family="{fam}"' if fam else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}{ff}>{esc(s)}</text>'
def line(x1,y1,x2,y2,stroke="#e5e7eb",sw=1):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"/>'
DEFS=('<defs><linearGradient id="g_brand" x1="0" y1="0" x2="1" y2="0">'
 '<stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<linearGradient id="g_p1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4338ca"/><stop offset="1" stop-color="#6366f1"/></linearGradient>'
 '<linearGradient id="g_p2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#c026d3"/></linearGradient>'
 '<linearGradient id="g_kit" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0891b2"/><stop offset="1" stop-color="#06b6d4"/></linearGradient>'
 '</defs>')
def svg(w,h,body,bg="#e9eaf0"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

PW,PH=900,1280   # "folha A4"
PX=(900-820)//2  # margem horizontal da folha dentro do canvas? usaremos folha cheia
b=""
# sombra + folha
b+=rect(40,30,820,1230,"#c9cbd6",rx=6)
b+=rect(36,26,820,1230,"#ffffff",rx=6,stroke="#e5e7eb")
M=68  # margem interna
RX=36; RW=820; RIN=RX+M  # left inner
left=RIN; right=36+RW-M  # content bounds
# ---------- cabeçalho ----------
b+=rect(left,60,46,46,"url(#g_brand)",rx=10)+text(left+23,90,"BT",18,"#fff",weight="bold",anchor="middle")
b+=text(left+58,82,"BIG TRICOT",20,"#111827",weight="bold",ls="0.5")
b+=text(left+58,102,"Malharia & Confecção  ·  CNPJ 00.000.000/0001-00",10.5,"#6b7280")
b+=text(right,76,"ORDEM DE PRODUÇÃO",13,"#4338ca",weight="bold",anchor="end",ls="0.5")
b+=text(right,100,"Nº OP-1042",20,"#111827",weight="bold",anchor="end")
# barcode + emissão
bx=right-150
for i,wd in enumerate([2,1,3,1,2,2,1,3,2,1,2,3,1,2,1,2,3,1,2,2,1,3,1,2,2]):
    b+=rect(bx,114,wd,28,"#111827"); bx+=wd+2
b+=text(right,160,"Emitido em 14/06/2026 · 11:20",9.5,"#6b7280",anchor="end")
b+=line(left,176,right,176,"#111827",2)
# ---------- bloco de informações ----------
iy=192
b+=rect(left,iy,right-left,96,"#f8fafc",rx=10,stroke="#e5e7eb")
def info(x,yy,label,val,vc="#111827"):
    return text(x,yy,label,9,"#94a3b8",weight="bold",ls="0.5")+text(x,yy+20,val,13,vc,weight="bold")
cw=(right-left)/3
b+=info(left+18,iy+28,"CLIENTE","Loja K — Malhas & Cia")
b+=info(left+18+cw,iy+28,"PEDIDO (ERP)","8842")
b+=info(left+18+2*cw,iy+28,"VENDEDOR","Marcos R.")
b+=info(left+18,iy+72,"DATA DO PEDIDO","14/06/2026")
b+=info(left+18+cw,iy+72,"DATA DE ENTREGA","22/06/2026","#be123c")
b+=info(left+18+2*cw,iy+72,"TIPO","Parte 1 + Parte 2")

# ---------- seções por parte/kit ----------
COLS=[("PRODUTO",214),("REF",58),("COR",118),("P",46),("M",46),("G",46),("GG",46),("TOTAL",64)]
def section(y,title,grad,rows):
    s=rect(left,y,right-left,30,f"url(#{grad})",rx=8)+rect(left,y+14,right-left,16,f"url(#{grad})")
    s+=text(left+16,y+20,title,12.5,"#fff",weight="bold",ls="0.5")
    # header da tabela
    hy=y+30
    s+=rect(left,hy,right-left,26,"#f1f3f7")
    cx=left+12
    for t,w in COLS:
        anc="middle" if t in("P","M","G","GG","TOTAL") else "start"
        xx=cx+(w/2 if anc=="middle" else 0)
        s+=text(xx,hy+17,t,9.5,"#64748b",weight="bold",anchor=anc); cx+=w
    ry=hy+26
    tot=0
    for r in rows:
        cx=left+12
        for (t,w),val in zip(COLS,r):
            anc="middle" if t in("P","M","G","GG","TOTAL") else "start"
            xx=cx+(w/2 if anc=="middle" else 0)
            bold = t in("PRODUTO","TOTAL")
            s+=text(xx,ry+18,str(val),11.5,"#0f172a" if bold else "#334155",weight="bold" if bold else "normal",anchor=anc)
            cx+=w
        s+=line(left+8,ry+28,right-8,ry+28,"#eef0f4")
        ry+=30
        tot+=int(r[-1])
    s+=rect(left,ry,right-left,26,"#f8fafc")
    s+=text(right-12,ry+18,f"Subtotal: {tot} pç",11,"#4338ca",weight="bold",anchor="end")
    return s, ry+26+14

y=312
s,y=section(y,"PARTE 1  —  Máquina 3","g_p1",[
    ("Blusa Tricô","BT12","Off-white",40,50,40,20,150),
    ("Gola Alta","GL02","Preto",20,30,20,10,80),
])
b+=s
s,y=section(y,"PARTE 2  —  Máquina 7","g_p2",[
    ("Blusa Tricô (compl.)","BT12","Off-white",40,50,40,20,150),
    ("Colete","CV03","Vinho",15,25,15,5,60),
])
b+=s
s,y=section(y,"KITS  —  itens avulsos","g_kit",[
    ("Cachecol","CC07","Cinza","—","—","—","—",60),
    ("Touca","TC01","Marinho","—","—","—","—",40),
])
b+=s
# ---------- total geral ----------
b+=rect(left,y,right-left,40,"#111827",rx=8)
b+=text(left+18,y+25,"TOTAL GERAL DA ORDEM",12,"#fff",weight="bold",ls="0.5")
b+=text(right-18,y+26,"540 peças",16,"#fff",weight="bold",anchor="end")
y+=58
# ---------- observações ----------
b+=text(left,y+4,"OBSERVAÇÕES",9.5,"#94a3b8",weight="bold",ls="0.6")
b+=rect(left,y+12,right-left,64,"#ffffff",rx=8,stroke="#e5e7eb")
b+=text(left+14,y+36,"Parte 1 e Parte 2 unem-se no Corte. Kits seguem separados. Conferir grade antes de tecer.",11,"#475569")
y+=96
# ---------- rodapé / assinaturas ----------
b+=line(left,y,left+260,y,"#9ca3af")+text(left,y+18,"Conferido por (Produção)",10,"#6b7280")
b+=line(left+320,y,left+580,y,"#9ca3af")+text(left+320,y+18,"Data / Assinatura",10,"#6b7280")
b+=line(36,1180,36+RW,1180,"#e5e7eb")
b+=text(left,1206,"Documento gerado automaticamente pelo sistema Rolagem de Fase — Big Tricot",9.5,"#9ca3af")
b+=text(right,1206,"Página 1/1",9.5,"#9ca3af",anchor="end")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"26-pdf-padrao.svg"),"w").write(svg(PW,PH,b))
subprocess.run(["rsvg-convert","-z","1.7",os.path.join(OUT_SVG,"26-pdf-padrao.svg"),"-o",os.path.join(OUT_PNG,"26-pdf-padrao.png")],check=True)
print("OK pdf-padrao")
