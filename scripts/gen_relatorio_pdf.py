# -*- coding: utf-8 -*-
# Resumo mensal de pagamento (consolidado) no formato Resumo Financeiro da Big Tricot.
import os, subprocess
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
DEFS=('<defs><filter id="paper" x="-12%" y="-5%" width="124%" height="110%">'
 '<feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.18"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
SERIF="Georgia, 'Times New Roman', serif"

W,H=1200,940
b=text(W/2,28,"Resumo MENSAL de Pagamento (consolidado) — PDF",13,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=40,48,1120,860
b+=rect(px,py,pw,ph,"#ffffff",rx=6,filt="paper")
ix=px+40; iw=pw-80

# header
b+=rect(ix,py+32,40,32,"#ffffff",rx=4,stroke="#111827",sw=1.4)+text(ix+20,py+54,"BiG",14,"#111827",weight="bold",anchor="middle",family=SERIF)
b+=text(ix+52,py+48,"BIG TRICOT",22,"#111827",weight="bold",ls="0.5")
b+=text(ix+54,py+65,"HOME DECOR",9,"#6b7280",ls="3")
b+=text(ix+iw,py+42,"RESUMO FINANCEIRO",18,"#111827",weight="bold",anchor="end")
b+=text(ix+iw,py+60,"Período: Junho / 2026",10.5,"#6b7280",anchor="end")
b+=text(ix+iw,py+75,"Emissão: 01/07/2026",10.5,"#6b7280",anchor="end")
b+=line(ix,py+90,ix+iw,py+90,"#111827",2)

# titulo secao
ty=py+112
b+=text(ix,ty,"PAGAMENTO DE COSTURA — CONSOLIDADO DO MÊS",13,"#111827",weight="bold",ls="0.3")
# tabela
ty+=16
b+=rect(ix,ty,iw,32,"#111827",rx=4)
cN=ix+16; cR=ix+iw-560; cP=ix+iw-420; cL=ix+iw-250; cB=ix+iw-16
b+=text(cN,ty+21,"COSTUREIRA",10.5,"#fff",weight="bold")
b+=text(cR,ty+21,"ROMANEIOS",10.5,"#fff",weight="bold",anchor="end")
b+=text(cP,ty+21,"PEÇAS",10.5,"#fff",weight="bold",anchor="end")
b+=text(cL,ty+21,"LIBERADO",10.5,"#fff",weight="bold",anchor="end")
b+=text(cB,ty+21,"BLOQUEADO",10.5,"#fff",weight="bold",anchor="end")
rows=[("Silvia","13","538","R$ 1.005,00","R$ 1.176,90"),
      ("Angélica","9","410","R$ 1.140,00","R$ 220,00"),
      ("Bene","11","605","R$ 1.260,00","—"),
      ("Nice","7","300","R$ 740,00","R$ 300,00"),
      ("Cris","8","360","R$ 700,00","R$ 135,00")]
ry=ty+32; rh=40
for i,(nm,rm,pc,lib,blk) in enumerate(rows):
    if i%2==1: b+=rect(ix,ry,iw,rh,"#fafbfc")
    b+=text(cN,ry+26,nm,13,"#111827",weight="bold")
    b+=text(cR,ry+26,rm,12,"#374151",anchor="end")
    b+=text(cP,ry+26,pc,12,"#374151",anchor="end")
    b+=text(cL,ry+26,lib,12.5,"#16a34a",weight="bold",anchor="end")
    b+=text(cB,ry+26,blk,12,"#ea580c" if blk!="—" else "#9ca3af",weight="bold",anchor="end")
    b+=line(ix,ry+rh,ix+iw,ry+rh,"#eef0f4",1)
    ry+=rh
# total
b+=rect(ix,ry,iw,38,"#f1f5f9")
b+=text(cN,ry+25,"TOTAL",12.5,"#111827",weight="bold")
b+=text(cR,ry+25,"48",12,"#111827",weight="bold",anchor="end")
b+=text(cP,ry+25,"2.213",12,"#111827",weight="bold",anchor="end")
b+=text(cL,ry+25,"R$ 4.845,00",13,"#16a34a",weight="bold",anchor="end")
b+=text(cB,ry+25,"R$ 1.831,90",12.5,"#ea580c",weight="bold",anchor="end")
ry+=38+10
b+=line(ix,ry,ix+iw,ry,"#111827",1.5)

# total liquido
ry+=16
b+=rect(ix,ry,iw,66,"#ffffff",rx=8,stroke="#111827",sw=1.5)
b+=text(ix+20,ry+30,"TOTAL LÍQUIDO A PAGAR NO MÊS",14,"#111827",weight="bold")
b+=text(ix+iw-20,ry+24,"Liberado − Descontos R$ 0,00",10.5,"#6b7280",anchor="end")
b+=text(ix+iw-20,ry+52,"R$ 4.845,00",24,"#16a34a",weight="bold",anchor="end")
ry+=66+20

# resumo cards
b+=text(ix,ry,"RESUMO DO PERÍODO (48 ROMANEIOS)",11.5,"#374151",weight="bold",ls="0.4")
ry+=12
cards=[("ROMANEIOS","48","#111827"),("PEÇAS","2.213","#111827"),("LIBERADO P/ PAGAMENTO","R$ 4.845,00","#16a34a"),("BLOQUEADO (AGUARDANDO)","R$ 1.831,90","#ea580c")]
cw=(iw-3*16)/4
for i,(l,n,c) in enumerate(cards):
    cx=ix+i*(cw+16)
    b+=rect(cx,ry,cw,64,"#ffffff",rx=10,stroke="#e5e7eb")
    b+=text(cx+16,ry+24,l,8.5,"#6b7280",weight="bold",ls="0.3")
    b+=text(cx+16,ry+52,n,20,c,weight="bold")
ry+=64+12
b+=text(ix,ry+6,"Bloqueado = romaneios ainda em poder das costureiras (não voltaram). Não entram no total a pagar. Um PDF individual é gerado por costureira.",10,"#94a3b8")

# footer
fyy=py+ph-30
b+=line(ix,fyy,ix+iw,fyy,"#eef0f4",1)
b+=text(ix,fyy+18,"Gerado automaticamente · enviado no dia 1º · Big Tricot Home Decor",10,"#94a3b8")
b+=text(ix+iw,fyy+18,"Consolidado · Página 1 de 1",10,"#94a3b8",anchor="end")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"50-relatorio-mensal-pdf.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.35",os.path.join(OUT_SVG,"50-relatorio-mensal-pdf.svg"),"-o",os.path.join(OUT_PNG,"50-relatorio-mensal-pdf.png")],check=True)
print("OK resumo mensal v2")
