# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
SERIF="Georgia, 'Times New Roman', 'Playfair Display', serif"
SANS="Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
def text(x,y,s,size=13,fill="#111",weight="normal",anchor="start",ls=None,family=SANS,transform=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    tr=f' transform="{transform}"' if transform else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}" font-family="{family}"{extra}{tr}>{s}</text>'
def rect(x,y,w,h,fill,rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>'
def circle(cx,cy,r,fill): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'

def logo(cx, cy, h, color="#111111", sub=True):
    """Monograma BiG centrado horizontalmente em cx, com altura de caixa h. cy = topo."""
    F=h
    base=cy+F*0.80
    wB=F*0.60; gap=F*0.24; wG=F*0.74
    total=wB+gap+wG
    x0=cx-total/2
    s=""
    s+=text(x0, base, "B", F, color, weight="bold", family=SERIF)
    gx=x0+wB+gap
    s+=text(gx, base, "G", F, color, weight="bold", family=SERIF)
    # haste vertical "TRICOT" entre B e G (cabe entre o pingo e a base)
    stemx=x0+wB+gap*0.5
    stemy=cy+F*0.47
    s+=text(stemx, stemy, "TRICOT", F*0.135, color, weight="bold", family=SANS, ls="1.5",
            anchor="middle", transform=f"rotate(90 {stemx} {stemy})")
    # pingo do i
    s+=circle(stemx, cy+F*0.07, F*0.06, color)
    if sub:
        s+=text(cx, base+F*0.26, "BIG TRICOT HOME DECOR", F*0.155, color, weight="normal",
                anchor="middle", family=SANS, ls=str(F*0.02))
    return s, total

# ---- folha de demonstração: logo em fundo claro e escuro ----
W,H=1000,640
b=rect(0,0,W,H,"#f4f5f7")
b+=text(W/2,40,"Logo Big Tricot (vetor) — versões para o sistema",16,"#0f172a",weight="bold",anchor="middle",family=SANS)
# claro
b+=rect(80,70,400,230,"#ffffff",rx=14)
s,_=logo(280,140,120,"#111111"); b+=s
b+=text(280,290,"Fundo claro (documentos, PDFs)",11,"#64748b",anchor="middle",family=SANS)
# escuro
b+=rect(520,70,400,230,"#0f1629",rx=14)
s,_=logo(720,140,120,"#ffffff"); b+=s
b+=text(720,290,"Fundo escuro (menu lateral, topo)",11,"#94a3b8",anchor="middle",family=SANS)
# barra de topo exemplo (gradiente)
b+=f'<defs><linearGradient id="gb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>'
b+=rect(80,340,840,72,"url(#gb)",rx=12)
s,tw=logo(180,352,46,"#ffffff",sub=False); b+=s
b+=text(250,382,"Rolagem de Fase",15,"#e0e7ff",family=SANS)
b+=text(900,382,"José Operador",13,"#fff",anchor="end",family=SANS)
b+=text(80,452,"Aplicação na barra superior (versão branca, compacta, sem o descritivo).",11.5,"#64748b",family=SANS)
# variações de tamanho
b+=rect(80,490,840,110,"#ffffff",rx=12)
for i,hh in enumerate([40,64,90]):
    s,_=logo(200+i*260,510,hh,"#111111",sub=False); b+=s
b+=text(80,585,"Escala bem em qualquer tamanho (favicon, ícone do app, cabeçalho).",11.5,"#64748b",family=SANS)

svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{b}</svg>'
os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"54-logo.svg"),"w").write(svg)
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"54-logo.svg"),"-o",os.path.join(OUT_PNG,"54-logo.png")],check=True)
print("OK logo")
