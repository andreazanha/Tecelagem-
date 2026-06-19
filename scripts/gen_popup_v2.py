# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,op=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if filt: s+=f' filter="url(#{filt})"'
    if op is not None: s+=f' fill-opacity="{op}"'
    return s+'/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
DEFS=('<defs>'
 '<linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">'
 '<stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<filter id="modalShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="18" stdDeviation="30" flood-color="#1e1b4b" flood-opacity="0.34"/></filter>'
 '<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.08"/></filter>'
 '</defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

W,H=1180,840
b=""
# topbar
b+=rect(0,0,W,60,"url(#hg)")+text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")
b+=text(168,38,"Rolagem de Fase",13,"#e0e7ff")+text(W-28,38,"Carla Mendes",13,"#fff",anchor="end")
# clean backdrop (sem esmaecido para ficar nitido)
b+=rect(0,60,W,H-60,"#eceef3")
# ---- modal ----
mw,mh=620,620; mx=(W-mw)/2; my=110
STRIPE="#10b981"  # cor de identidade do card (status Passando) — listra vertical
# base colorida + modal branco por cima = listra lateral arredondada integrada
b+=rect(mx,my,mw,mh,STRIPE,rx=22,filt="modalShadow")
b+=rect(mx+9,my,mw-9,mh,"#ffffff",rx=22)
# header gradient (inset para deixar a listra aparecer)
b+=rect(mx+9,my,mw-9,108,"url(#hg)",rx=22)+rect(mx+9,my+70,mw-9,38,"url(#hg)")
# OP chip
b+=rect(mx+28,my+24,96,26,"#ffffff2e",rx=8)+text(mx+28+14,my+42,"OP-1042",13,"#fff",weight="bold",ls="0.4")
# part badge
b+=rect(mx+132,my+24,78,26,"#ffffff2e",rx=8)+text(mx+132+39,my+42,"Parte 1",12,"#fff",weight="bold",anchor="middle")
# close
b+=circle(mx+mw-44,my+37,15,"#ffffff2e")+text(mx+mw-44,my+42,"✕",15,"#fff",anchor="middle")
# client + status
b+=text(mx+28,my+86,"Loja K",22,"#fff",weight="bold")
b+=rect(mx+mw-198,my+74,170,26,"#10b98133",rx=13)+circle(mx+mw-198+16,my+87,4,"#34d399")+text(mx+mw-198+28,my+91,"Passadoria · Passando",11.5,"#d1fae5",weight="bold")
# ---- date cards ----
dcw=(mw-28*2-16)/2; dy=my+128
b+=rect(mx+28,dy,dcw,86,"#f5f3ff",rx=14,stroke="#ddd6fe")
b+=text(mx+46,dy+26,"DATA DO PEDIDO",10,"#7c3aed",weight="bold",ls="0.8")
b+=text(mx+46,dy+56,"14/06/2026",24,"#4c1d95",weight="bold")
b+=text(mx+46,dy+74,"lançado na tela Criar Pedido",9.5,"#8b7fc4")
b+=rect(mx+28+dcw+16,dy,dcw,86,"#fff1f2",rx=14,stroke="#fecdd3")
b+=text(mx+28+dcw+16+18,dy+26,"DATA DE ENTREGA",10,"#e11d48",weight="bold",ls="0.8")
b+=text(mx+28+dcw+16+18,dy+56,"22/06/2026",24,"#be123c",weight="bold")
b+=text(mx+28+dcw+16+18,dy+74,"⚠ faltam 3 dias",9.5,"#f43f5e",weight="bold")
# ---- details grid ----
gy=dy+108
rows=[("Tipo","Parte 1 + Parte 2"),("Produto","Blusa Tricô · BT12"),
      ("Cor / Grade","Off-white · P-M-G"),("Quantidade","150 peças"),
      ("Origem","Tecelagem · Máquina 3"),("Responsável atual","—"),
      ("Romaneio","—"),("Setor atual","Passadoria")]
colw=(mw-56)/2
for i,(k,v) in enumerate(rows):
    cx=mx+28+(i%2)*colw; ry=gy+(i//2)*46
    b+=text(cx,ry+12,k.upper(),9.5,"#94a3b8",weight="bold",ls="0.5")
    b+=text(cx,ry+30,v,13,"#0f172a",weight="bold")
    b+=rect(cx,ry+40,colw-16,1,"#eef0f4")
# ---- timeline ----
ty=gy+4*46+12
b+=text(mx+28,ty,"HISTÓRICO",9.5,"#94a3b8",weight="bold",ls="0.5")
steps=[("Criação","14/06 · 09:12","#10b981"),("Tecelagem","18/06 → 19/06 · Máq 3","#10b981"),("Passadoria","desde 19/06 · 08:10","#f59e0b")]
sx=mx+28
for i,(t,sub,c) in enumerate(steps):
    cx=sx+i*((mw-56)/3)
    b+=circle(cx+6,ty+22,6,c)
    if i<2: b+=rect(cx+12,ty+20,(mw-56)/3-24,3,"#e2e8f0",rx=1)
    b+=text(cx,ty+44,t,12,"#0f172a",weight="bold")
    b+=text(cx,ty+60,sub,10,"#64748b")
# ---- footer ----
fy=my+mh-66
b+=rect(mx,fy-14,mw,80,"#fafbfc",rx=22)+rect(mx,fy-14,mw,40,"#fafbfc")
b+=rect(mx+28,fy,120,42,"#ffffff",rx=10,stroke="#e2e8f0")+text(mx+28+60,fy+27,"Fechar",13,"#475569",weight="bold",anchor="middle")
b+=rect(mx+mw-300,fy,132,42,"#3b82f6",rx=10)+text(mx+mw-300+66,fy+27,"✓ Finalizar",13,"#fff",weight="bold",anchor="middle")
b+=rect(mx+mw-156,fy,128,42,"url(#hg)",rx=10)+text(mx+mw-156+64,fy+27,"🔒 Enviar ▶",12.5,"#fff",weight="bold",anchor="middle")

os.makedirs(OUT_SVG,exist_ok=True)
p=os.path.join(OUT_SVG,"23-card-popup.svg"); open(p,"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","2.2",p,"-o",os.path.join(OUT_PNG,"23-card-popup.png")],check=True)
print("OK popup v2")
