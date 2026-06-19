# -*- coding: utf-8 -*-
# Logo Big Tricot (vetor) reutilizavel em todos os geradores.
SERIF="Georgia, 'Times New Roman', 'Playfair Display', serif"
SANS="Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
def _t(x,y,s,size,fill,weight="normal",anchor="start",ls=None,family=SANS,transform=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    tr=f' transform="{transform}"' if transform else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}" font-family="{family}"{extra}{tr}>{s}</text>'
def logo(cx, cy, h, color="#111111", sub=True):
    """Monograma BiG centrado horizontalmente em cx; cy=topo; h=altura das maiusculas. Retorna (svg,largura)."""
    F=h; base=cy+F*0.80
    wB=F*0.60; gap=F*0.24; wG=F*0.74; total=wB+gap+wG; x0=cx-total/2
    s=_t(x0,base,"B",F,color,"bold",family=SERIF)
    s+=_t(x0+wB+gap,base,"G",F,color,"bold",family=SERIF)
    stemx=x0+wB+gap*0.5; stemy=cy+F*0.47
    s+=_t(stemx,stemy,"TRICOT",F*0.135,color,"bold",family=SANS,ls="1.5",anchor="middle",
          transform=f"rotate(90 {stemx} {stemy})")
    s+=f'<circle cx="{stemx}" cy="{cy+F*0.07}" r="{F*0.06}" fill="{color}"/>'
    if sub:
        s+=_t(cx,base+F*0.26,"BIG TRICOT HOME DECOR",F*0.155,color,"normal",anchor="middle",family=SANS,ls=str(F*0.02))
    return s,total
def logo_left(x, cy, h, color="#111111", sub=True):
    """Igual ao logo() mas alinhado a esquerda comecando em x."""
    total=h*(0.60+0.24+0.74)
    s,_=logo(x+total/2, cy, h, color, sub)
    return s,total
