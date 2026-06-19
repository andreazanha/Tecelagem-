# -*- coding: utf-8 -*-
# Romaneio fiel ao modelo real da Big Tricot (ROM-0135): 2 vias na mesma pagina.
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
DEFS=('<defs><filter id="paper" x="-12%" y="-5%" width="124%" height="110%">'
 '<feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.18"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

SERIF="Georgia, 'Times New Roman', serif"
GRAY="#eceff3"; BORDER="#c7cdd6"

def logo(x,y):
    s,_=logo_left(x, y-14, 30, "#111827", sub=True)
    return s

def via(px,oy,iw,label_cut=None):
    ix=px+34; s=""
    # cabeçalho
    s+=logo(ix,oy+34)
    s+=text(ix+iw,oy+22,"ROMANEIO Nº ROM-0135",17,"#111827",weight="bold",anchor="end")
    s+=text(ix+iw,oy+42,"Emitido em 18/06/2026",11,"#6b7280",anchor="end")
    s+=line(ix,oy+58,ix+iw,oy+58,"#111827",1.5)
    # bloco info
    iy=oy+86
    L1=ix; L2=ix+150; R1=ix+iw*0.55; R2=ix+iw*0.55+90
    def lab(x,y,t): return text(x,y,t,11.5,"#111827",weight="bold")
    def val(x,y,t): return text(x,y,t,11.5,"#374151")
    s+=lab(L1,iy,"Cliente:")+val(L2,iy,"IRENE GOBBI MENEGAZZO E CIA")
    s+=val(L2,iy+16,"LTDA")
    s+=lab(R1,iy,"Pedido:")+val(R2,iy,"#3758")
    s+=lab(L1,iy+38,"Costureira:")+val(L2,iy+38,"SILVIA")
    s+=lab(R1,iy+38,"Volumes:")+val(R2,iy+38,"1")
    s+=lab(L1,iy+60,"Data Saída:")+val(L2,iy+60,"19/06/2026")
    s+=lab(R1,iy+60,"Data Retorno:")+val(R2,iy+60,"19/06/2026")
    # tabela
    ty=iy+82
    qx=ix+iw-330; ux=ix+iw-220; tx=ix+iw-110
    # header
    s+=rect(ix,ty,iw,34,GRAY,stroke=BORDER)
    s+=line(qx,ty,qx,ty,BORDER)
    s+=text(ix+16,ty+22,"Serviço",12.5,"#111827",weight="bold")
    s+=text(qx+55,ty+22,"Qtd",11.5,"#111827",weight="bold",anchor="middle")
    s+=text(ux+55,ty+22,"Vl Unit.",11.5,"#111827",weight="bold",anchor="middle")
    s+=text(tx+55,ty+22,"Vl Total",11.5,"#111827",weight="bold",anchor="middle")
    for vx in (qx,ux,tx): s+=line(vx,ty,vx,ty+34,BORDER)
    # linha de serviço
    rh=46; ry=ty+34
    s+=rect(ix,ry,iw,rh,"#ffffff",stroke=BORDER)
    for vx in (qx,ux,tx): s+=line(vx,ry,vx,ry+rh,BORDER)
    s+=text(ix+16,ry+29,"CAPAS TRICÔ",14,"#111827",weight="bold")
    s+=text(qx+55,ry+29,"2",13,"#111827",weight="bold",anchor="middle")
    s+=text(ux+55,ry+29,"R$ 5,00",12.5,"#111827",anchor="middle")
    s+=text(tx+55,ry+29,"R$ 10,00",13,"#111827",weight="bold",anchor="middle")
    # total geral
    gy=ry+rh; gh=52
    s+=rect(ix,gy,iw,gh,GRAY,stroke=BORDER)
    for vx in (qx,ux,tx): s+=line(vx,gy,vx,gy+gh,BORDER)
    s+=text(ix+16,gy+32,"TOTAL GERAL",15,"#111827",weight="bold")
    s+=text(qx+55,gy+32,"2 pç",13,"#111827",weight="bold",anchor="middle")
    s+=text(tx+55,gy+24,"R$",12.5,"#111827",weight="bold",anchor="middle")
    s+=text(tx+55,gy+40,"10,00",13,"#111827",weight="bold",anchor="middle")
    # assinaturas
    ay=gy+gh+64; half=iw/2-16
    s+=line(ix,ay,ix+half,ay,"#9ca3af",1)
    s+=text(ix+half/2,ay+18,"Conferido na IDA",12,"#111827",weight="bold",anchor="middle")
    s+=text(ix+half/2,ay+34,"Assinatura / Data",10.5,"#9ca3af",anchor="middle")
    s+=line(ix+iw-half,ay,ix+iw,ay,"#9ca3af",1)
    s+=text(ix+iw-half/2,ay+18,"Conferido no RETORNO",12,"#111827",weight="bold",anchor="middle")
    s+=text(ix+iw-half/2,ay+34,"Assinatura / Data",10.5,"#9ca3af",anchor="middle")
    return s, ay+34

W,H=860,1180
b=text(W/2,26,"Romaneio (modelo fiel ao da Big Tricot) — 2 vias na mesma página",12.5,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=40,44,780,1110
b+=rect(px,py,pw,ph,"#ffffff",rx=4,filt="paper")
iw=pw-68
s1,bottom1=via(px,py+24,iw); b+=s1
# corte
cy=bottom1+40
b+=line(px+24,cy,px+pw-24,cy,"#9ca3af",1.2,dash="7 5")
b+=rect(px+pw/2-86,cy-11,172,22,"#ffffff")
b+=text(px+pw/2,cy+5,"✂  C O R T A R   A Q U I  ✂",11.5,"#6b7280",weight="bold",anchor="middle",ls="1")
s2,_=via(px,cy+30,iw); b+=s2

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"45-romaneio-pdf.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.45",os.path.join(OUT_SVG,"45-romaneio-pdf.svg"),"-o",os.path.join(OUT_PNG,"45-romaneio-pdf.png")],check=True)
print("OK romaneio pdf fiel")
