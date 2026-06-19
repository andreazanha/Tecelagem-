# -*- coding: utf-8 -*-
# PDF do pedido (Ordem) — montado como PARTE ÚNICA, com os dados reais do pedido 3768.
# Agrupamento por Referência + Cor + Tamanho.
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
DEFS=('<defs><filter id="paper" x="-8%" y="-4%" width="116%" height="108%">'
 '<feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.18"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

# itens extraídos do PDF real (produto, ref, cor, tamanho, qtd)
ITENS=[
 ("ALMOFADA PEROLA","02786","ROMENIA","50X50",2),
 ("ALMOFADA WAVE","04004","TERRACOTA","50X50",1),
 ("KIT WAVE C/ ENCHIM","03878","AREIA","1,20X1,80 + 2x 50X50",1),
 ("PES ALANA","01626","GEADA","90X200",1),
 ("PES ALANA","01626","TORNADO","90X200",1),
 ("PES ALANA","01626","BEGE NOVO","90X200",1),
 ("PES BALI","02961","AVELA","90X200",1),
 ("PES BALI","02961","VERDE MATA","90X200",1),
 ("PES BUBLLES","02674","MARE","90X200",1),
 ("PES BUBLLES","02674","MARINHO","90X200",1),
 ("PES BUBLLES","02674","MOSTARDA","90X200",1),
 ("PES DALIA","02638","AREIA","90X200",1),
 ("PES DALIA","02638","CACAU","90X200",1),
 ("PES FRASCATI","03725","COLMEIA","90X200",1),
 ("PES FRASCATI","03725","GEADA","90X200",1),
 ("PES FRASCATI","03725","COBRE","90X200",1),
 ("PES PEROLA","02735","ROMENIA","70X220",1),
]
# agrupa por ref+cor+tamanho (soma qtd)
g={}; ordem=[]
for prod,ref,cor,tam,q in ITENS:
    k=(ref,cor,tam)
    if k not in g: g[k]=[prod,ref,cor,tam,0]; ordem.append(k)
    g[k][4]+=q
linhas=[g[k] for k in ordem]
total=sum(l[4] for l in linhas)

W,H=820,1180
b=text(W/2,28,"PDF do Pedido — montado como PARTE ÚNICA (dados reais do pedido 3768)",12,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=40,48,740,1100
b+=rect(px,py,pw,ph,"#ffffff",rx=6,filt="paper")
ix=px+34; iw=pw-68

# cabeçalho
lg,_=logo_left(ix, py+22, 30, "#111827", sub=True); b+=lg
b+=text(ix+iw,py+40,"ORDEM DE PRODUÇÃO",16,"#111827",weight="bold",anchor="end")
b+=text(ix+iw,py+60,"Pedido 3768  ·  ERP 003.768",11,"#6b7280",anchor="end")
b+=text(ix+iw,py+76,"Emitido em 19/06/2026",10,"#94a3b8",anchor="end")
b+=line(ix,py+92,ix+iw,py+92,"#111827",1.5)

# selo PARTE
b+=rect(ix,py+104,150,30,"#111827",rx=8)+text(ix+75,py+124,"PARTE: ÚNICA",13,"#fff",weight="bold",anchor="middle")
b+=text(ix+iw,py+124,f"Total de peças: {total}",13,"#111827",weight="bold",anchor="end")

# dados do pedido
iy=py+158
def kv(x,y,k,v,vw="#111827"):
    return text(x,y,k,10,"#94a3b8",weight="bold")+text(x+78,y,v,11.5,vw,weight="bold")
b+=rect(ix,iy,iw,70,"#f8fafc",rx=10,stroke="#e5e7eb")
b+=kv(ix+16,iy+24,"Cliente:","DIAMOND LAR LTDA")
b+=kv(ix+16,iy+46,"Represent.:","TH3 REPRESENTAÇÕES")
b+=kv(ix+iw/2+10,iy+24,"Coleção:","002")
b+=kv(ix+iw/2+10,iy+46,"Emissão:","12/06/2026")
b+=text(ix+iw-16,iy+46,"Entrega: 22/07/2026",11.5,"#be123c",weight="bold",anchor="end")

# tabela
ty=iy+92
b+=text(ix,ty,"ITENS (agrupados por Referência + Cor + Tamanho)",12,"#111827",weight="bold")
ty+=14
cP=ix+14; cR=ix+300; cC=ix+380; cT=ix+540; cQ=ix+iw-14
b+=rect(ix,ty,iw,30,"#111827",rx=4)
b+=text(cP,ty+20,"PRODUTO",10,"#fff",weight="bold")
b+=text(cR,ty+20,"REF",10,"#fff",weight="bold")
b+=text(cC,ty+20,"COR",10,"#fff",weight="bold")
b+=text(cT,ty+20,"TAMANHO",10,"#fff",weight="bold")
b+=text(cQ,ty+20,"QTD",10,"#fff",weight="bold",anchor="end")
ry=ty+30; rh=34
for i,(prod,ref,cor,tam,q) in enumerate(linhas):
    if i%2==1: b+=rect(ix,ry,iw,rh,"#fafbfc")
    b+=text(cP,ry+22,prod,11.5,"#111827",weight="bold")
    b+=text(cR,ry+22,ref,11,"#374151")
    b+=text(cC,ry+22,cor,11,"#374151")
    b+=text(cT,ry+22,tam,11,"#374151")
    b+=text(cQ,ry+22,str(q),12,"#111827",weight="bold",anchor="end")
    b+=line(ix,ry+rh,ix+iw,ry+rh,"#eef0f4",1)
    ry+=rh
# total
b+=rect(ix,ry,iw,34,"#f1f5f9")
b+=text(cP,ry+22,"TOTAL",12,"#111827",weight="bold")
b+=text(cQ,ry+22,f"{total} pç",13,"#111827",weight="bold",anchor="end")
ry+=34

# assinatura
ry+=40
b+=line(ix,ry,ix+260,ry,"#9ca3af",1)+text(ix,ry+16,"Conferência / Responsável",9.5,"#94a3b8")
b+=text(ix+iw,ry+16,f"{len(linhas)} itens · {total} peças",10.5,"#94a3b8",anchor="end")

# rodapé
fyy=py+ph-28
b+=line(ix,fyy,ix+iw,fyy,"#eef0f4",1)
b+=text(ix,fyy+18,"Gerado pelo Rolagem de Fase · Big Tricot Home Decor",10,"#94a3b8")
b+=text(ix+iw,fyy+18,"Página 1 de 1",10,"#94a3b8",anchor="end")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"55-pedido-parte-unica.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"55-pedido-parte-unica.svg"),"-o",os.path.join(OUT_PNG,"55-pedido-parte-unica.png")],check=True)
subprocess.run(["rsvg-convert","-f","pdf",os.path.join(OUT_SVG,"55-pedido-parte-unica.svg"),"-o",os.path.join(OUT_PNG,"55-pedido-parte-unica.pdf")],check=True)
print("OK pedido parte unica")
