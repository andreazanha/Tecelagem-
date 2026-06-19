# -*- coding: utf-8 -*-
# PDF de producao no padrao Big Tricot. Regras:
#  - PES=Peseira, MAN=Manta, ALMOFADA=Almofada (producao);  KIT=Pronta Entrega (PDF separado)
#  - Composicao "100% POLIESTER" depende da COR (lista); demais cores ficam sem composicao
#  - Agrupa por Modelo + Ref + Cor; quebra por Tamanho. Split Parte 1/2 pelos modelos da Parte 1.
import os, subprocess, unicodedata
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def line(x1,y1,x2,y2,stroke,sw=1):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"/>'
def circle(cx,cy,r,fill,stroke=None,sw=1):
    s=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'
def text(x,y,s,size=13,fill="#111827",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
DEFS=('<defs><filter id="paper" x="-5%" y="-2%" width="110%" height="104%">'
 '<feDropShadow dx="0" dy="8" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.16"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

NAVY="#22416b"; GOLD="#c2a05a"; GREEN="#1f7a4d"; GREY="#eef0f3"; REDC="#c0392b"; QBLUE="#1d4ed8"
COLORS={"ROMENIA":"#7a5230","TERRACOTA":"#c2693f","AREIA":"#d9c7a0","GEADA":"#e6ecee",
 "TORNADO":"#6b7280","BEGE NOVO":"#d8c1a0","AVELA":"#b0894f","VERDE MATA":"#3c5a3c",
 "MARE":"#3f6f8f","MARINHO":"#1e2a52","MOSTARDA":"#c8a22a","CACAU":"#5b3a29",
 "COLMEIA":"#d8a23f","COBRE":"#b5651d","OFF WHITE":"#f4efe3"}
def swatch(cx,cy,cor): return circle(cx,cy,7,COLORS.get(cor,"#c9cdd3"),stroke="#94a3b8",sw=1)

def norm(s):
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode()
    return " ".join(s.replace("-"," ").upper().split())
POLIESTER={norm(x) for x in [
 "Off-White","Areia","Mescla Colosso","Romenia","Terracota","Cobre Escuro","Bege Novo","Brow",
 "Golden","Mescla Riviera","Marinho","Verde Escuro","Cavalinha","Prata Mescla","Grafite Mescla",
 "Maré","Cacau","Mostarda"]}
def composicao(cor): return "100% POLIÉSTER" if norm(cor) in POLIESTER else ""

PARTE1={"aspen","elo","perola","balls","kora","celine","linea","rice","montana","daytona","otto","pipoca"}

# (tipo, modelo, ref, cor, tamanho, qtd) — pedido 3768  | tipo: peseira|manta|almofada|kit
ITENS=[
 ("almofada","Perola","1076","ROMENIA","50X50",2),
 ("almofada","Wave","KT1096","TERRACOTA","50X50",1),
 ("kit","Wave","KT1096","AREIA","1,20X1,80 + 50X50",1),
 ("peseira","Alana","1012","GEADA","90X200",1),
 ("peseira","Alana","1012","TORNADO","90X200",1),
 ("peseira","Alana","1012","BEGE NOVO","90X200",1),
 ("peseira","Bali","1084","AVELA","90X200",1),
 ("peseira","Bali","1084","VERDE MATA","90X200",1),
 ("peseira","Bubbles","1075","MARE","90X200",1),
 ("peseira","Bubbles","1075","MARINHO","90X200",1),
 ("peseira","Bubbles","1075","MOSTARDA","90X200",1),
 ("peseira","Dalia","1058","AREIA","90X200",1),
 ("peseira","Dalia","1058","CACAU","90X200",1),
 ("peseira","Frascati","1040","COLMEIA","90X200",1),
 ("peseira","Frascati","1040","GEADA","90X200",1),
 ("peseira","Frascati","1040","COBRE","90X200",1),
 ("peseira","Perola","1076","ROMENIA","70X220",1),
]

def build(parte_label, subtitulo, banda, itens, outname):
    blocos={}; ordem=[]
    for tipo,modelo,ref,cor,tam,q in itens:
        k=(modelo,ref,cor)
        if k not in blocos: blocos[k]=[]; ordem.append(k)
        blocos[k].append((tam,q))
    total_geral=sum(q for *_,q in itens)
    def alt(sizes): return 30+20+len(sizes)*22+12
    HEAD=300; total_h=HEAD
    for k in ordem: total_h+=alt(blocos[k])
    total_h+=70
    W=900; px,py,pw=30,40,840; ph=total_h+20; H=ph+60
    ix=px+30; iw=pw-60
    b=text(W/2,24,f"PDF gerado — padrão Big Tricot · pedido 3768 · {parte_label}",11.5,"#0f172a",weight="bold",anchor="middle")
    b+=rect(px,py,pw,ph,"#ffffff",rx=4,filt="paper")
    bh=104
    b+=rect(px,py,pw,bh,NAVY,rx=4)+rect(px,py+bh-12,pw,12,NAVY)
    b+=text(ix,py+52,"BIG TRICOT",30,"#ffffff",weight="bold",ls="0.5")
    b+=text(ix+2,py+72,"HOME DECOR",11,"#c7d2e0",ls="4")
    b+=text(ix+250,py+48,"Pedido de Venda",20,"#ffffff",weight="bold")
    b+=text(ix+250,py+72,subtitulo,12.5,"#c7d2e0")
    b+=text(ix+iw,py+40,"Gerado em 19/06/2026, 17:33:08",10.5,"#aab8cc",anchor="end")
    pwp=14+len(parte_label)*8
    b+=rect(ix+iw-pwp,py+54,pwp,24,banda,rx=12)+text(ix+iw-pwp/2,py+70,parte_label,12,"#ffffff" if banda!=GOLD else "#3a2f12",weight="bold",anchor="middle")
    dy=py+bh+30
    def info(y,k,v,vw="#111827"):
        return text(ix,y,k,10.5,"#94a3b8",weight="bold")+text(ix+170,y,v,12.5,vw,weight="bold")
    b+=info(dy,"CLIENTE","DIAMOND LAR LTDA")
    b+=info(dy+26,"REPRESENTANTE","TH3 REPRESENTAÇÕES LTDA")
    b+=info(dy+52,"PEDIDO","003768")
    b+=text(ix,dy+78,"DATAS",10.5,"#94a3b8",weight="bold")
    b+=text(ix+170,dy+78,"Emissão: 12/06/2026",12.5,"#111827",weight="bold")
    b+=text(ix+360,dy+78,"Entrega: 22/07/2026",12.5,"#111827",weight="bold")
    ty=dy+110
    titulo = "ITENS — PRONTA ENTREGA" if banda==GREEN else "ITENS A PRODUZIR"
    b+=text(ix,ty,titulo,16,NAVY,weight="bold")+rect(ix,ty+10,iw,3,NAVY)
    y=py+HEAD; qx=ix+0.50*iw
    for k in ordem:
        modelo,ref,cor=k; sizes=blocos[k]; total=sum(q for _,q in sizes); comp=composicao(cor)
        b+=rect(ix,y,iw,30,GREY)
        tx=ix+12
        b+=text(tx,y+20,"Modelo:",11,"#6b7280"); tx+=52
        b+=text(tx,y+20,modelo,12.5,"#111827",weight="bold"); tx+=len(modelo)*8+18
        b+=text(tx,y+20,"Ref:",11,"#6b7280"); tx+=28
        b+=text(tx,y+20,ref,12,"#111827",weight="bold"); tx+=len(ref)*8+12
        if comp: b+=text(tx,y+20,"· "+comp,9.5,REDC,weight="bold")
        b+=swatch(qx+2,y+15,cor)+text(qx+16,y+20,cor,12.5,"#111827",weight="bold")
        b+=text(ix+iw-12,y+20,f"Total: {total} {'peça' if total==1 else 'peças'}",12,"#111827",weight="bold",anchor="end")
        hy=y+30
        b+=text(ix+12,hy+15,"TAMANHO",9,"#94a3b8",weight="bold",ls="0.3")
        b+=text(qx+16,hy+15,"QUANTIDADE PEDIDA",9,"#94a3b8",weight="bold",ls="0.3")
        b+=line(ix,hy+20,ix+iw,hy+20,"#e5e7eb",1)
        ry=hy+20
        for tam,q in sizes:
            b+=text(ix+12,ry+16,tam,11.5,"#111827",weight="bold")
            b+=rect(qx+16,ry+6,12,12,"#ffffff",rx=2,stroke="#9aa3b2",sw=1.3)
            b+=text(qx+36,ry+16,f"{q} {'peça' if q==1 else 'peças'}",11.5,QBLUE,weight="bold")
            b+=line(ix,ry+22,ix+iw,ry+22,"#eef0f4",1)
            ry+=22
        y=ry+12
    gy=py+ph-58
    b+=rect(ix,gy,iw,40,banda,rx=6)
    rot = "QTD TOTAL" if parte_label=="PARTE ÚNICA" else f"QTD {parte_label}"
    b+=text(ix+iw/2,gy+26,f"{rot}: {total_geral}",16,"#ffffff" if banda!=GOLD else "#3a2f12",weight="bold",anchor="middle")
    os.makedirs(OUT_SVG,exist_ok=True)
    open(os.path.join(OUT_SVG,outname+".svg"),"w").write(svg(W,H,b))
    subprocess.run(["rsvg-convert","-z","1.4",os.path.join(OUT_SVG,outname+".svg"),"-o",os.path.join(OUT_PNG,outname+".png")],check=True)
    subprocess.run(["rsvg-convert","-f","pdf",os.path.join(OUT_SVG,outname+".svg"),"-o",os.path.join(OUT_PNG,outname+".pdf")],check=True)
    return total_geral

prod=[it for it in ITENS if it[0]!="kit"]            # producao (peseira/manta/almofada)
kits=[it for it in ITENS if it[0]=="kit"]            # pronta entrega
p1=[it for it in prod if it[1].lower() in PARTE1]
p2=[it for it in prod if it[1].lower() not in PARTE1]
tu=build("PARTE ÚNICA","Produção / Tecelagem",GOLD, prod, "55-pedido-parte-unica")
t1=build("PARTE 1","Produção / Tecelagem",GOLD, p1, "56-pedido-parte1")
t2=build("PARTE 2","Produção / Tecelagem",GOLD, p2, "57-pedido-parte2")
tpe=build("PRONTA ENTREGA","Pronta Entrega",GREEN, kits, "58-pedido-pronta-entrega")
print(f"OK · unica(prod)={tu} · p1={t1} · p2={t2} · pronta_entrega(kits)={tpe}")
