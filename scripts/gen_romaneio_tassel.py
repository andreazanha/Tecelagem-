# -*- coding: utf-8 -*-
# Romaneio de Tassel: 3 vias na mesma pagina; SOMENTE a 1a via tem campo de assinatura.
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
def line(x1,y1,x2,y2,stroke,sw=1,dash=None):
    d=f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"{d}/>'
def text(x,y,s,size=13,fill="#111827",weight="normal",anchor="start",ls=None,family=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    fam=f' font-family="{family}"' if family else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}{fam}>{esc(s)}</text>'
DEFS=('<defs><filter id="paper" x="-12%" y="-4%" width="124%" height="108%">'
 '<feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.18"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
SERIF="Georgia, 'Times New Roman', serif"; GRAY="#eceff3"; BORDER="#c7cdd6"
def logo(x,y):
    s,_=logo_left(x, y-12, 24, "#111827", sub=True)
    return s
def via(px,oy,iw,signature):
    ix=px+34; s=""
    s+=logo(ix,oy+26)
    s+=text(ix+iw,oy+16,"ROMANEIO Nº ROM-0001",14,"#111827",weight="bold",anchor="end")
    s+=text(ix+iw,oy+33,"Emitido em 19/06/2026",9.5,"#6b7280",anchor="end")
    s+=line(ix,oy+44,ix+iw,oy+44,"#111827",1.3)
    iy=oy+66; L1=ix; L2=ix+92; R1=ix+iw*0.55; R2=ix+iw*0.55+72
    def lab(x,y,t): return text(x,y,t,10,"#111827",weight="bold")
    def val(x,y,t): return text(x,y,t,10,"#374151")
    s+=lab(L1,iy,"Cliente:")+val(L2,iy,"EX COMERCIO DE COLCHÕES LTDA")
    s+=lab(R1,iy,"Pedido:")+val(R2,iy,"#3765")
    s+=lab(L1,iy+18,"Costureira:")+val(L2,iy+18,"LUCÉLIA")
    s+=lab(R1,iy+18,"Volumes:")+val(R2,iy+18,"1")
    s+=lab(L1,iy+36,"Data Saída:")+val(L2,iy+36,"17/06/2026")
    s+=lab(R1,iy+36,"Data Retorno:")+val(R2,iy+36,"____/____/______")
    ty=iy+52; qx=ix+iw-300; ux=ix+iw-200; tx=ix+iw-100
    s+=rect(ix,ty,iw,28,GRAY,stroke=BORDER)
    s+=text(ix+14,ty+19,"Serviço",11.5,"#111827",weight="bold")
    s+=text(qx+50,ty+19,"Qtd",10.5,"#111827",weight="bold",anchor="middle")
    s+=text(ux+50,ty+19,"Vl Unit.",10.5,"#111827",weight="bold",anchor="middle")
    s+=text(tx+50,ty+19,"Vl Total",10.5,"#111827",weight="bold",anchor="middle")
    for vx in (qx,ux,tx): s+=line(vx,ty,vx,ty+28,BORDER)
    ry=ty+28; rh=36
    s+=rect(ix,ry,iw,rh,"#ffffff",stroke=BORDER)
    for vx in (qx,ux,tx): s+=line(vx,ry,vx,ry+rh,BORDER)
    s+=text(ix+14,ry+23,"ROMENIA / G / 100%POLIÉSTER",12,"#111827",weight="bold")
    s+=text(qx+50,ry+23,"4",12,"#111827",weight="bold",anchor="middle")
    s+=text(ux+50,ry+23,"R$ 1,00",11,"#111827",anchor="middle")
    s+=text(tx+50,ry+23,"R$ 4,00",12,"#111827",weight="bold",anchor="middle")
    gy=ry+rh; gh=32
    s+=rect(ix,gy,iw,gh,GRAY,stroke=BORDER)
    for vx in (qx,ux,tx): s+=line(vx,gy,vx,gy+gh,BORDER)
    s+=text(ix+14,gy+21,"TOTAL GERAL",13,"#111827",weight="bold")
    s+=text(qx+50,gy+21,"4 pç",12,"#111827",weight="bold",anchor="middle")
    s+=text(tx+50,gy+21,"R$ 4,00",12,"#111827",weight="bold",anchor="middle")
    bottom=gy+gh
    if signature:
        ay=bottom+46; half=iw/2-16
        s+=line(ix,ay,ix+half,ay,"#9ca3af",1)
        s+=text(ix+half/2,ay+16,"Conferido na IDA",11,"#111827",weight="bold",anchor="middle")
        s+=text(ix+half/2,ay+31,"Assinatura / Data",9.5,"#9ca3af",anchor="middle")
        s+=line(ix+iw-half,ay,ix+iw,ay,"#9ca3af",1)
        s+=text(ix+iw-half/2,ay+16,"Conferido no RETORNO",11,"#111827",weight="bold",anchor="middle")
        s+=text(ix+iw-half/2,ay+31,"Assinatura / Data",9.5,"#9ca3af",anchor="middle")
        bottom=ay+31
    else:
        s+=text(ix+iw/2,bottom+24,"(via sem assinatura — controle interno)",9.5,"#b0b7c2",anchor="middle")
        bottom=bottom+24
    return s, bottom

W,H=860,1180
b=text(W/2,24,"Romaneio de TASSEL — 3 vias (somente a 1ª via tem assinatura)",12.5,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=40,42,780,1116
b+=rect(px,py,pw,ph,"#ffffff",rx=4,filt="paper")
iw=pw-68
b+=text(px+pw/2,py+30,"📋  ROMANEIO DE TASSEL",15,"#111827",weight="bold",anchor="middle")
b+=line(px+24,py+42,px+pw-24,py+42,"#e5e7eb",1)
y=py+54
vias=[True,False,False]
for i,sig in enumerate(vias):
    s,bottom=via(px,y,iw,sig); b+=s
    if i<2:
        cy=bottom+24
        b+=line(px+24,cy,px+pw-24,cy,"#9ca3af",1.1,dash="7 5")
        b+=rect(px+pw/2-78,cy-10,156,20,"#ffffff")
        b+=text(px+pw/2,cy+5,"✂  C O R T A R   A Q U I  ✂",10.5,"#6b7280",weight="bold",anchor="middle",ls="0.8")
        y=cy+22
os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"53-romaneio-tassel.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.45",os.path.join(OUT_SVG,"53-romaneio-tassel.svg"),"-o",os.path.join(OUT_PNG,"53-romaneio-tassel.png")],check=True)
print("OK tassel 3 vias")
