# -*- coding: utf-8 -*-
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
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill,stroke=None,sw=2):
    s=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'
DEFS=('<defs><linearGradient id="g_brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.78,"#fff",weight="bold",anchor="middle")

PHASES=["Tec","Pas","Cor","Cos","Rev","Exp","Fis","Tra","✓"]
PHFULL=["Tecelagem","Passadoria","Corte","Costura","Revisão","Expedição","Fiscal","Transporte","Entregue"]
PHCOL=["#6366f1","#0ea5e9","#a855f7","#ec4899","#0d9488","#0891b2","#f59e0b","#38bdf8","#10b981"]

def progress(x,y,idx,w=240):
    s=""; n=len(PHASES); gap=w/(n-1)
    s+=line(x,y,x+w,y,"#e5e7eb",3)
    if idx>0: s+=line(x,y,x+gap*idx,y,PHCOL[idx],3)
    for i in range(n):
        cxp=x+gap*i
        if i<idx: s+=circle(cxp,y,4,PHCOL[idx])
        elif i==idx: s+=circle(cxp,y,7,"#ffffff",stroke=PHCOL[idx],sw=3)+circle(cxp,y,3,PHCOL[idx])
        else: s+=circle(cxp,y,4,"#e5e7eb")
    return s

def chipf(x,y,label,bg,fg,fs=10,h=20):
    w=16+len(label)*5.9
    return rect(x,y,w,h,bg,rx=h/2)+text(x+8,y+h*0.69,label,fs,fg,weight="bold"),w

def dropdown(x,y,w,label,value):
    s=text(x,y,label,9,"#94a3b8",weight="bold",ls="0.5")
    s+=rect(x,y+8,w,40,"#ffffff",rx=10,stroke="#e2e8f0")
    s+=text(x+14,y+33,value,12.5,"#0f172a",weight="bold")+text(x+w-16,y+33,"▾",13,"#6b7280",anchor="end")
    return s

W,H=1760,940
b=rect(0,0,W,60,"url(#g_brand)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
b+=text(W-200,38,"Sup. Produção",13,"#fff",anchor="end")+avatar(W-176,30,15,"SP","#a78bfa")
b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Gestão",10.5,"#5b6478",ls="1")
nav=[("◧","Visão geral"),("📋","Todos os Pedidos"),("🏭","Produção"),("📦","Pedidos"),("📊","Relatórios")]
y=150
for ic,label in nav:
    if label=="Todos os Pedidos": b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#818cf8",rx=2)+text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
    else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
    y+=44
b+=text(258,96,"Todos os Pedidos",24,"#0f172a",weight="bold")+text(258,118,"Gestão  ›  Todos os Pedidos",12,"#94a3b8")
# barra de filtros
fx,fy=258,140
b+=rect(fx,fy,W-258-40,84,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
b+=dropdown(fx+20,fy+16,180,"MÊS","Junho / 2026")
b+=dropdown(fx+216,fy+16,200,"SETOR","Todos os setores")
b+=dropdown(fx+432,fy+16,200,"FASE / ETAPA","Todas as fases")
# busca
b+=text(fx+652,fy+25,"BUSCA RÁPIDA",9,"#94a3b8",weight="bold",ls="0.5")
b+=rect(fx+652,fy+24,360,40,"#f8fafc",rx=10,stroke="#e2e8f0")+text(fx+670,fy+49,"🔎  Pedido, OP, cliente, NF…",12.5,"#94a3b8")
b+=rect(fx+(W-258-40)-150,fy+24,130,40,"url(#g_brand)",rx=10)+text(fx+(W-258-40)-85,fy+49,"Filtrar",13,"#fff",weight="bold",anchor="middle")
# chips ativos
b+=text(fx+20,fy+78,"42 pedidos encontrados",11,"#64748b")
# tabela
tx,ty,tw=258,240,W-258-40
b+=rect(tx,ty,tw,H-ty-30,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
heads=[("PEDIDO",tx+20),("CLIENTE",tx+120),("PRODUTO",tx+270),("TIPO",tx+440),("SETOR ATUAL",tx+560),("FASE / ETAPA",tx+710),("ONDE ESTÁ (fase)",tx+900),("ENTREGA",tx+tw-90)]
for t,hx in heads: b+=text(hx,ty+30,t,9.5,"#94a3b8",weight="bold",ls="0.3")
b+=line(tx+16,ty+42,tx+tw-16,ty+42,"#eef0f4",1)
TINT={"P1+P2":("#eef2ff","#4338ca"),"KIT":("#ecfeff","#0e7490"),"ÚNICO":("#f1f5f9","#475569"),"VENDA":("#fef9c3","#854d0e")}
rows=[
 ("OP-1009","Loja V","Touca · TC01","KIT","Tecelagem","Tecendo · Tear 3","21/06",0),
 ("OP-1015","Loja W","Cardigã · CG04","P1+P2","Passadoria","Passando","27/06",1),
 ("OP-1042","Loja K","Blusa · BT12","P1+P2","Corte","Cortando · Mesa 1","22/06",2),
 ("OP-0990","Atacado D","Cardigã · CG04","P1+P2","Costura","Angélica","24/06",3),
 ("OP-0995","Cliente B","Cachecol · CC07","ÚNICO","Revisão","Bruna","25/06",4),
 ("OP-0978","Loja P","Suéter · SU11","ÚNICO","Expedição","Medidas/Volumes","26/06",5),
 ("OP-0985","Loja N","Luva · LV02","KIT","Fiscal","Cotando frete","24/06",6),
 ("OP-0970","Loja H","Gorro · GR02","KIT","Transporte","Em rota · Jadlog","20/06",7),
 ("OP-0960","Loja A","Manta · MT04","ÚNICO","Entregue","Concluído 15/06","15/06",8),
 ("PV-3050","Loja K","Blusa · BT12","VENDA","Estoque","Separar → Revisão","23/06",4),
]
ry=ty+54; rh=58
for ped,cli,prod,tp,setor,fase,ent,idx in rows:
    b+=rect(tx+12,ry,tw-24,rh-8,"#ffffff",rx=8,stroke="#f1f5f9")
    b+=text(tx+20,ry+30,ped,12.5,"#0f172a",weight="bold")
    b+=text(tx+120,ry+30,cli,12,"#334155")
    b+=text(tx+270,ry+30,prod,12,"#334155")
    tbg,tfg=TINT[tp]; c,w=chipf(tx+440,ry+16,tp,tbg,tfg); b+=c
    # setor atual chip
    scol=PHCOL[idx] if setor!="Estoque" else "#f59e0b"
    sb = scol+"1f"
    c2,w2=chipf(tx+560,ry+16,setor,"#f3f4f6",scol); b+=rect(tx+560,ry+16,w2,20,"#ffffff",rx=10,stroke=scol,sw=1.3)+text(tx+560+8,ry+30,setor,10,scol,weight="bold")
    b+=text(tx+710,ry+30,fase,11.5,"#475569")
    b+=progress(tx+900,ry+25,idx,w=230)
    b+=text(tx+tw-90,ry+30,ent,11.5,"#0f172a",weight="bold")
    ry+=rh
b+=text(258,H-12,"Filtros por Mês · Setor · Fase + busca rápida. A barra de progresso mostra exatamente em que fase o pedido está (das 9 etapas).",11.5,"#94a3b8")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"49-todos-pedidos.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.15",os.path.join(OUT_SVG,"49-todos-pedidos.svg"),"-o",os.path.join(OUT_PNG,"49-todos-pedidos.png")],check=True)
print("OK todos-pedidos")
