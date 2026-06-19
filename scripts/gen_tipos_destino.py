# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
GRADS={"uni":("#475569","#64748b"),"upe":("#0d9488","#14b8a6"),"pp":("#4338ca","#6366f1"),"est":("#d97706","#f59e0b"),
       "pej":("#059669","#10b981"),"pes":("#0891b2","#06b6d4"),"brand":("#4f46e5","#7c3aed")}
def gdefs():
    return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill="#a78bfa"):
    return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,"#fff",weight="bold",anchor="middle")
def badge(x,y,label,bg,fg,h=26,fs=11.5):
    w=24+len(label)*6.6
    return rect(x,y,w,h,bg,rx=h/2)+text(x+w/2,y+h*0.66,label,fs,fg,weight="bold",anchor="middle"),w

W,H=1500,1030
b=rect(0,0,W,60,"url(#g_brand)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
b+=text(W-200,38,"Ana Paula",13,"#fff",anchor="end")+avatar(W-176,30,15,"AP")
b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Cadastro",10.5,"#5b6478",ls="1")
nav=[("◧","Visão geral",False),("📦","Pedidos",True),("🏭","Produção",False),("📋","Romaneios",False),("🧵","Costureiras",False),("🗃️","Almoxarifado",False)]
y=150
for ic,label,act in nav:
    if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#818cf8",rx=2)+text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
    else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
    y+=44
b+=text(258,96,"Tipos de Pedido e Destino",23,"#0f172a",weight="bold")
b+=text(258,118,"Pedidos  ›  Tipos & Roteamento",12,"#94a3b8")
b+=text(258,148,"Ao gerar, o tipo define o destino de cada card. Parte 1/2 vão à Produção; Pronta Entrega e Estoque vão à página Estoque.",12,"#475569")

cx0=258; cwid=W-258-40
def row(y,gkey,tname,npdf,flow,dests):
    h=110
    b2=rect(cx0,y,cwid,h,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    b2+=rect(cx0,y,250,h,f"url(#g_{gkey})",rx=16)+rect(cx0+234,y,16,h,f"url(#g_{gkey})")
    b2+=text(cx0+20,y+46,tname,15,"#fff",weight="bold")
    b2+=text(cx0+20,y+70,npdf,11,"#ffffffcc")
    mx=cx0+274
    b2+=text(mx,y+38,"FLUXO",9,"#94a3b8",weight="bold",ls="0.5")
    b2+=text(mx,y+60,flow,12,"#334155")
    # destinos (direita)
    dx=cx0+cwid-22
    b2+=text(dx,y+38,"DESTINO",9,"#94a3b8",weight="bold",ls="0.5",anchor="end")
    bx=dx
    for label,bg,fg in reversed(dests):
        bd,w=badge(0,0,label,bg,fg)
        bx-=w
        b2+=rect(bx,y+50,w,26,bg,rx=13)+text(bx+w/2,y+67,label,11.5,fg,weight="bold",anchor="middle")
        bx-=10
    return b2

PROD=("→ Produção","#eef2ff","#4338ca")
def EST(col): return (f"→ Estoque · «{col}»","#fff7ed","#b45309")

rows=[
 ("uni","Pedido Único","1 PDF","Tecelagem → Passadoria → Corte → Costura → Revisão → Expedição → Transporte",[PROD]),
 ("upe","Único + Pronta Entrega","2 PDFs","Único produz normalmente · PE (não produz) aguarda e sai JUNTO com o pedido",[PROD,EST("Pronta Entrega + Produção")]),
 ("pp","Pedido Parte 1 e 2","2 PDFs (1 por parte)","Tecelagem → Passadoria → (unem no Corte) → Costura → Revisão → Expedição → Transporte",[PROD]),
 ("est","Pedido Estoque","1 PDF (produção)","Faz TODA a produção (igual Parte 1 e 2) e, no fim, dá entrada no Estoque",[PROD,EST("Dar entrada no estoque")]),
 ("pej","P1+P2 + Pronta Entrega","3 PDFs · ENVIAR JUNTO","P1/P2 produzem · PE (não produz) aguarda e sai junto com o pedido",[PROD,EST("Pronta Entrega + Produção")]),
 ("pes","P1+P2 + Pronta Entrega","3 PDFs · ENVIAR SEPARADO","P1/P2 produzem · PE (não produz) sai antes (antecipado)",[PROD,EST("Separar")]),
]
yy=178
for gk,tn,np,fl,ds in rows:
    b+=row(yy,gk,tn,np,fl,ds); yy+=124

# rodapé: colunas do Estoque
b+=rect(cx0,yy+4,cwid,70,"#0f1629",rx=16)
b+=text(cx0+22,yy+34,"COLUNAS DA PÁGINA ESTOQUE (nomes editáveis)",10,"#aeb6c7",weight="bold",ls="0.5")
labels=[("Dar entrada no estoque","#fde68a","#92400e"),("Pronta Entrega + Produção","#a7f3d0","#065f46"),("Separar","#a5f3fc","#155e75")]
lx=cx0+22
for lab,bg,fg in labels:
    w=24+len(lab)*6.6
    b+=rect(lx,yy+44,w,24,bg,rx=12)+text(lx+w/2,yy+60,lab,11,fg,weight="bold",anchor="middle"); lx+=w+12

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"28-tipos-destino.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.35",os.path.join(OUT_SVG,"28-tipos-destino.svg"),"-o",os.path.join(OUT_PNG,"28-tipos-destino.png")],check=True)
print("OK tipos-destino")
