# -*- coding: utf-8 -*-
# PDF de produção do pedido (Tecelagem) no LAYOUT da Big Tricot — montado como PARTE ÚNICA.
# Agrupa por Modelo + Ref(grade) + Cor, com quebra por Tamanho × Quantidade.
import os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brand_logo import logo_left
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def line(x1,y1,x2,y2,stroke,sw=1):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"/>'
def text(x,y,s,size=13,fill="#111827",weight="normal",anchor="start",ls=None,family=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    fam=f' font-family="{family}"' if family else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}{fam}>{esc(s)}</text>'
DEFS=('<defs><filter id="paper" x="-6%" y="-3%" width="112%" height="106%">'
 '<feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.18"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

# (modelo, ref=grade, cor, tamanho, qtd) — extraído do pedido 3768
ITENS=[
 ("ALMOFADA PEROLA","1076","ROMENIA","50X50",2),
 ("ALMOFADA WAVE","KT1096","TERRACOTA","50X50",1),
 ("KIT WAVE C/ ENCHIM","KT1096","AREIA","1,20X1,80 + 2x 50X50",1),
 ("PES ALANA","1012","GEADA","90X200",1),
 ("PES ALANA","1012","TORNADO","90X200",1),
 ("PES ALANA","1012","BEGE NOVO","90X200",1),
 ("PES BALI","1084","AVELA","90X200",1),
 ("PES BALI","1084","VERDE MATA","90X200",1),
 ("PES BUBLLES","1075","MARE","90X200",1),
 ("PES BUBLLES","1075","MARINHO","90X200",1),
 ("PES BUBLLES","1075","MOSTARDA","90X200",1),
 ("PES DALIA","1058","AREIA","90X200",1),
 ("PES DALIA","1058","CACAU","90X200",1),
 ("PES FRASCATI","1040","COLMEIA","90X200",1),
 ("PES FRASCATI","1040","GEADA","90X200",1),
 ("PES FRASCATI","1040","COBRE","90X200",1),
 ("PES PEROLA","1076","ROMENIA","70X220",1),
]
# agrupa por (modelo, ref, cor) -> [(tamanho, qtd)]
blocos={}; ordem=[]
for modelo,ref,cor,tam,q in ITENS:
    k=(modelo,ref,cor)
    if k not in blocos: blocos[k]=[]; ordem.append(k)
    blocos[k].append((tam,q))
total_parte=sum(q for *_,q in ITENS)

W,H=820,1300
b=text(W/2,26,"PDF de produção (Tecelagem) — PARTE ÚNICA · layout Big Tricot · pedido 3768",11.5,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=40,44,740,1230
b+=rect(px,py,pw,ph,"#ffffff",rx=6,filt="paper")
ix=px+30; iw=pw-60

# ── cabeçalho ──
lg,_=logo_left(ix, py+18, 26, "#111827", sub=True); b+=lg
b+=text(ix+iw,py+26,"Pedido de Venda",13,"#111827",weight="bold",anchor="end")
b+=text(ix+iw,py+44,"Produção · Tecelagem",10.5,"#6b7280",anchor="end")
b+=text(ix+iw,py+59,"Gerado em 19/06/2026, 13:12",9.5,"#94a3b8",anchor="end")
b+=rect(ix+iw-118,py+68,118,24,"#111827",rx=6)+text(ix+iw-59,py+85,"PARTE ÚNICA",11,"#fff",weight="bold",anchor="middle")
b+=line(ix,py+104,ix+iw,py+104,"#111827",1.4)

# dados
dy=py+118
def kv(x,y,k,v,vw="#111827",ks=9):
    return text(x,y,k,ks,"#94a3b8",weight="bold",ls="0.4")+text(x,y+16,v,12,vw,weight="bold")
b+=kv(ix,dy,"CLIENTE","DIAMOND LAR LTDA")
b+=kv(ix+300,dy,"REPRESENTANTE","TH3 REPRESENTAÇÕES")
b+=kv(ix+560,dy,"PEDIDO","003768")
b+=text(ix,dy+44,"DATAS",9,"#94a3b8",weight="bold",ls="0.4")
b+=text(ix,dy+60,"Emissão: 12/06/2026",11.5,"#111827",weight="bold")
b+=text(ix+200,dy+60,"Entrega: 22/07/2026",11.5,"#be123c",weight="bold")
b+=text(ix+iw,dy+60,f"QTD PARTE ÚNICA: {total_parte}",12.5,"#111827",weight="bold",anchor="end")

# título itens
ty=dy+86
b+=text(ix,ty,"ITENS A PRODUZIR",12,"#111827",weight="bold",ls="0.3")
b+=line(ix,ty+8,ix+iw,ty+8,"#e5e7eb",1)

# ── blocos em 2 colunas ──
colw=(iw-20)/2
colx=[ix, ix+colw+20]
coly=[ty+24, ty+24]
def bloco(x,y,w,modelo,ref,cor,sizes):
    total=sum(q for _,q in sizes)
    h=64+len(sizes)*19
    s=rect(x,y,w,h,"#ffffff",rx=10,stroke="#e5e7eb")
    s+=text(x+14,y+24,f"Modelo: {modelo}",12.5,"#111827",weight="bold")
    s+=text(x+w-14,y+24,f"Ref: {ref}",11,"#6b7280",weight="bold",anchor="end")
    s+=text(x+14,y+43,cor,12,"#1d4ed8",weight="bold")
    s+=text(x+w-14,y+43,f"Total: {total} {'peça' if total==1 else 'peças'}",11,"#111827",weight="bold",anchor="end")
    s+=rect(x+14,y+52,w-28,18,"#f1f5f9",rx=4)
    s+=text(x+22,y+65,"TAMANHO",8.5,"#94a3b8",weight="bold")
    s+=text(x+w-22,y+65,"QUANTIDADE PEDIDA",8.5,"#94a3b8",weight="bold",anchor="end")
    yy=y+70
    for tam,q in sizes:
        s+=text(x+22,yy+15,tam,11,"#111827",weight="bold")
        s+=text(x+w-22,yy+15,f"{q} {'peça' if q==1 else 'peças'}",11,"#374151",anchor="end")
        yy+=19
    return s,h
for k in ordem:
    modelo,ref,cor=k
    c = 0 if coly[0]<=coly[1] else 1
    s,h=bloco(colx[c],coly[c],colw,modelo,ref,cor,blocos[k])
    b+=s; coly[c]+=h+12

# rodapé
fyy=py+ph-26
b+=line(ix,fyy,ix+iw,fyy,"#eef0f4",1)
b+=text(ix,fyy+17,"BIG TRICOT · Tecelagem · PARTE ÚNICA",10,"#94a3b8")
b+=text(ix+iw,fyy+17,"Página 1/1",10,"#94a3b8",anchor="end")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"55-pedido-parte-unica.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"55-pedido-parte-unica.svg"),"-o",os.path.join(OUT_PNG,"55-pedido-parte-unica.png")],check=True)
subprocess.run(["rsvg-convert","-f","pdf",os.path.join(OUT_SVG,"55-pedido-parte-unica.svg"),"-o",os.path.join(OUT_PNG,"55-pedido-parte-unica.pdf")],check=True)
print("OK pedido parte unica v2")
