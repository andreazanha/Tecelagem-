# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,op=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if op is not None: s+=f' fill-opacity="{op}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def line(x1,y1,x2,y2,stroke,sw=1):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"/>'
def text(x,y,s,size=13,fill="#111827",weight="normal",anchor="start",ls=None,family=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    fam=f' font-family="{family}"' if family else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}{fam}>{esc(s)}</text>'
DEFS=('<defs><filter id="paper" x="-15%" y="-6%" width="130%" height="112%">'
 '<feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.18"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

W,H=1200,1260
b=text(W/2,30,"Relatório Individual por Costureira (formato Resumo Financeiro)",13,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=40,50,1120,1180
b+=rect(px,py,pw,ph,"#ffffff",rx=6,filt="paper")
ix=px+40; iw=pw-80

# ---------- cabeçalho ----------
b+=rect(ix,py+34,44,34,"#ffffff",rx=4,stroke="#111827",sw=1.5)+text(ix+22,py+56,"BiG",15,"#111827",weight="bold",anchor="middle")
b+=text(ix+58,py+52,"BIG TRICOT",24,"#111827",weight="bold",ls="0.5")
b+=text(ix+60,py+70,"HOME DECOR",10,"#6b7280",ls="3")
b+=text(ix+iw,py+44,"RESUMO FINANCEIRO",18,"#111827",weight="bold",anchor="end")
b+=text(ix+iw,py+62,"Período: Junho / 2026",10.5,"#6b7280",anchor="end")
b+=text(ix+iw,py+77,"Emissão: 01/07/2026",10.5,"#6b7280",anchor="end")
b+=line(ix,py+92,ix+iw,py+92,"#111827",2)

# ---------- faixa costureira ----------
fy=py+104
b+=rect(ix,fy,iw,52,"#f8fafc",rx=8,stroke="#e5e7eb")
b+=text(ix+18,fy+24,"👤  SILVIA — COSTURA",15,"#111827",weight="bold")
b+=text(ix+18,fy+43,"Telefone: 19 99621-7167",11,"#6b7280")
b+=text(ix+iw-18,fy+32,"Interna · Costureira ativa",11,"#6b7280",anchor="end")

# ---------- tabela ----------
ty=fy+68
b+=rect(ix,ty,iw,30,"#111827",rx=6)+rect(ix,ty+14,iw,16,"#111827")
cR=ix+18; cD=ix+170; cC=ix+300; cP=ix+iw-300; cV=ix+iw-18
b+=text(cR,ty+20,"ROMANEIO",10,"#ffffff",weight="bold",ls="0.3")
b+=text(cD,ty+20,"DATA",10,"#ffffff",weight="bold",ls="0.3")
b+=text(cC,ty+20,"CLIENTE",10,"#ffffff",weight="bold",ls="0.3")
b+=text(cP,ty+20,"PEÇAS",10,"#ffffff",weight="bold",ls="0.3",anchor="end")
b+=text(cV,ty+20,"VALOR",10,"#ffffff",weight="bold",ls="0.3",anchor="end")
rows=[
 ("ROM-0037","29/05/2026","ARTELASSE","85","fora"),
 ("ROM-0052","03/06/2026","ARTELASSE INDUSTRIA E COMERCIO LTDA","85","R$ 450,50"),
 ("ROM-0053","03/06/2026","ARTELASSE INDUSTRIA E COMERCIO LTDA","45","R$ 171,00"),
 ("ROM-0068","04/06/2026","COMERCIO E CONFECÇÃO JL LTDA","38","R$ 136,00"),
 ("ROM-0080","08/06/2026","MOSTRUÁRIO DE PONTO","4","R$ 12,00"),
 ("ROM-0082","09/06/2026","ARTELASSE INDUSTRIA E COMERCIO LTDA","50","R$ 220,00"),
 ("ROM-0087","09/06/2026","CAPAS AVULSAS","4","R$ 15,50"),
 ("ROM-0106","12/06/2026","QUENIA DA COSTA PAZ","95","aguard"),
 ("ROM-0133","19/06/2026","GF TECIDOS LTDA","28","aguard"),
 ("ROM-0134","18/06/2026","SIMPLE ART FM PRESENTES LTDA","29","aguard"),
 ("ROM-0135","19/06/2026","IRENE GOBBI MENEGAZZO E CIA LTDA","2","aguard"),
 ("ROM-0136","19/06/2026","SCHWAITZER COM. DE OBJETOS E DECORAÇÕES","69","aguard"),
 ("ROM-0137","19/06/2026","URGENTE","4","aguard"),
]
ry=ty+30; rh=34
for i,(num,dt,cli,pc,val) in enumerate(rows):
    if i%2==1: b+=rect(ix,ry,iw,rh,"#fafbfc")
    b+=text(cR,ry+22,num,11.5,"#1d4ed8",weight="bold")
    b+=text(cD,ry+22,dt,11,"#374151")
    b+=text(cC,ry+22,cli,11,"#374151")
    b+=text(cP,ry+22,pc,11.5,"#111827",weight="bold",anchor="end")
    if val=="fora":
        b+=text(cV,ry+22,"🔒 Retorno fora do mês",11,"#b45309",weight="bold",anchor="end")
    elif val=="aguard":
        b+=text(cV,ry+22,"🔒 Aguardando retorno",11,"#9ca3af",weight="bold",anchor="end")
    else:
        b+=text(cV,ry+22,val,11.5,"#111827",weight="bold",anchor="end")
    b+=line(ix,ry+rh,ix+iw,ry+rh,"#eef0f4",1)
    ry+=rh
# total bruto liberado
b+=rect(ix,ry,iw,32,"#f1f5f9")
b+=text(cR,ry+21,"TOTAL BRUTO LIBERADO",11.5,"#111827",weight="bold")
b+=text(cV,ry+21,"R$ 1.005,00",12.5,"#111827",weight="bold",anchor="end")
ry+=32
b+=rect(ix,ry,iw,34,"#ffffff")
b+=text(cV-150,ry+23,"TOTAL LÍQUIDO A PAGAR:",12,"#111827",weight="bold",anchor="end")
b+=text(cV,ry+23,"R$ 1.005,00",14,"#16a34a",weight="bold",anchor="end")
ry+=34+8
b+=line(ix,ry,ix+iw,ry,"#111827",1.5)

# ---------- total líquido do período ----------
ry+=18
b+=rect(ix,ry,iw,70,"#ffffff",rx=8,stroke="#111827",sw=1.5)
b+=text(ix+20,ry+32,"TOTAL LÍQUIDO DO PERÍODO",14,"#111827",weight="bold")
b+=text(ix+iw-20,ry+26,"Bruto R$ 1.005,00 − Descontos R$ 0,00",10.5,"#6b7280",anchor="end")
b+=text(ix+iw-20,ry+54,"R$ 1.005,00",26,"#111827",weight="bold",anchor="end")
ry+=70+24

# ---------- resumo do período ----------
b+=text(ix,ry,"RESUMO DO PERÍODO (13 ROMANEIOS)",12,"#374151",weight="bold",ls="0.5")
ry+=14
cards=[("TOTAL DE ROMANEIOS","13","#111827"),("TOTAL DE PEÇAS","538","#111827"),
       ("LIBERADO P/ PAGAMENTO","R$ 1.005,00","#16a34a"),("BLOQUEADO (AGUARDANDO)","R$ 1.176,90","#ea580c")]
cw=(iw-3*16)/4
for i,(l,n,c) in enumerate(cards):
    cx=ix+i*(cw+16)
    b+=rect(cx,ry,cw,72,"#ffffff",rx=10,stroke="#e5e7eb")
    b+=text(cx+16,ry+26,l,9,"#6b7280",weight="bold",ls="0.3")
    b+=text(cx+16,ry+56,n,21,c,weight="bold")
ry+=72+18
b+=text(ix,ry+6,"Bloqueado = romaneios ainda em poder da costureira (aguardando retorno) — não entram no total a pagar até voltarem.",10.5,"#94a3b8")

# footer
fyy=py+ph-30
b+=line(ix,fyy,ix+iw,fyy,"#eef0f4",1)
b+=text(ix,fyy+18,"Gerado automaticamente · 1 relatório por costureira · Big Tricot Home Decor",10,"#94a3b8")
b+=text(ix+iw,fyy+18,"Silvia · 1 de 5",10,"#94a3b8",anchor="end")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"51-relatorio-individual-pdf.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.25",os.path.join(OUT_SVG,"51-relatorio-individual-pdf.svg"),"-o",os.path.join(OUT_PNG,"51-relatorio-individual-pdf.png")],check=True)
print("OK relatorio individual v2")
