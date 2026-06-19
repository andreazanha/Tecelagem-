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
def circle(cx,cy,r,fill,stroke=None,sw=2):
    s=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'
GRADS={"p1":("#4338ca","#6366f1"),"p2":("#7c3aed","#c026d3"),"kit":("#0891b2","#06b6d4"),
       "pe":("#059669","#0d9488"),"brand":("#4f46e5","#7c3aed")}
def grad_defs():
    return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+grad_defs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill="#a78bfa"):
    return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,"#fff",weight="bold",anchor="middle")

W,H=1440,940
b=rect(0,0,W,60,"url(#g_brand)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
b+=text(W-200,38,"Ana Paula",13,"#fff",anchor="end")+avatar(W-176,30,15,"AP")
b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Cadastro",10.5,"#5b6478",ls="1")
nav=[("◧","Visão geral",False),("📦","Pedidos",True),("🏭","Produção",False),("📋","Romaneios",False),("🧵","Costureiras",False),("🗃️","Almoxarifado",False),("📊","Relatórios",False)]
y=150
for ic,label,act in nav:
    if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#818cf8",rx=2)+text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
    else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
    y+=44
b+=text(258,96,"Gerar Ordem de Produção",24,"#0f172a",weight="bold")
b+=text(258,118,"Pedidos  ›  8842 — Loja K  ›  Gerar",12,"#94a3b8")
b+=text(258,150,"Cada parte gera o seu próprio PDF e segue para o seu destino. A Pronta Entrega vai para o Estoque.",12.5,"#475569")

cx0=258; cwid=W-258-40
def dest_pill(x,y,label,key):
    bg,fg={"tec":("#eef2ff","#4338ca"),"est":("#ecfdf5","#047857")}[key]
    w=24+len(label)*6.6
    return rect(x,y,w,26,bg,rx=13)+text(x+w/2,y+17,label,11.5,fg,weight="bold",anchor="middle"),w

def pdf_btn(x,y,label):
    w=24+len(label)*7.0
    return rect(x,y,w,40,"#ffffff",rx=10,stroke="#cbd5e1")+text(x+w/2,y+25,label,12.5,"#334155",weight="bold",anchor="middle"),w

def part_card(y,h,tkey,type_label,sub,items,qty,dest_label,dest_key):
    s=rect(cx0,y,cwid,h,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    # painel colorido esquerda
    s+=rect(cx0,y,200,h,f"url(#g_{tkey})",rx=16)+rect(cx0+184,y,16,h,f"url(#g_{tkey})")
    s+=text(cx0+22,y+44,type_label,16,"#fff",weight="bold",ls="0.5")
    s+=text(cx0+22,y+66,sub,11.5,"#ffffffcc")
    # destino
    dp,dw=dest_pill(cx0+22,y+h-44,dest_label,dest_key)
    s+=dp
    # meio: itens
    mx=cx0+232
    s+=text(mx,y+38,"ITENS DESTA PARTE",9.5,"#94a3b8",weight="bold",ls="0.5")
    s+=text(mx,y+62,items,13,"#0f172a",weight="bold")
    s+=text(mx,y+84,qty,12,"#64748b")
    return s

# Parte 1
b+=part_card(180,128,"p1","PARTE 1","Máquina 3","Blusa Tricô (150) · Gola Alta (80)","230 peças  ·  Tecelagem → … → Revisão","→ Tecelagem","tec")
pb,_=pdf_btn(W-40-200,180+44,"📄 Gerar PDF · Parte 1"); b+=pb
# Parte 2
b+=part_card(324,128,"p2","PARTE 2","Máquina 7","Blusa Tricô compl. (150) · Colete (60)","210 peças  ·  Tecelagem → … → Revisão","→ Tecelagem","tec")
pb,_=pdf_btn(W-40-200,324+44,"📄 Gerar PDF · Parte 2"); b+=pb
# Pronta Entrega (mais alto, com opções)
pey=468; peh=212
b+=part_card(pey,peh,"pe","PRONTA ENTREGA","Itens já prontos","Cachecol (60)","60 peças  ·  não passa pela produção","→ Estoque","est")
# opções de envio
ox=cx0+232; oy=pey+104
b+=rect(ox,oy,cwid-232-240,84,"#f8fafc",rx=12,stroke="#e5e7eb")
b+=text(ox+16,oy+24,"QUANDO ENVIAR A PRONTA ENTREGA?",9.5,"#94a3b8",weight="bold",ls="0.5")
# opção 1 selecionada
b+=circle(ox+26,oy+50,8,"#fff",stroke="#10b981",sw=2)+circle(ox+26,oy+50,4,"#10b981")
b+=text(ox+44,oy+47,"Enviar JUNTO com o pedido",12.5,"#0f172a",weight="bold")
b+=text(ox+44,oy+65,"aguarda a produção e envia tudo junto",10.5,"#64748b")
# opção 2
o2=ox+ (cwid-232-240)/2 + 10
b+=circle(o2+26,oy+50,8,"#fff",stroke="#cbd5e1",sw=2)
b+=text(o2+44,oy+47,"Enviar ANTECIPADO (vai antes)",12.5,"#0f172a",weight="bold")
b+=text(o2+44,oy+65,"envia agora, na frente do pedido",10.5,"#64748b")
pb,_=pdf_btn(W-40-220,pey+44,"📄 Gerar PDF · Pronta Entrega"); b+=pb

# rodapé
fy=706
b+=rect(cx0,fy,cwid,76,"#0f1629",rx=16)
b+=text(cx0+24,fy+34,"3 PDFs serão gerados",15,"#fff",weight="bold")
b+=text(cx0+24,fy+56,"1 por parte · Parte 1 e Parte 2 → Produção · Pronta Entrega → Estoque (junto com o pedido)",11.5,"#aeb6c7")
b+=rect(W-40-260,fy+16,260,44,"url(#g_brand)",rx=10)+text(W-40-130,fy+44,"🔒 Gerar todos os PDFs",13,"#fff",weight="bold",anchor="middle")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"27-gerar-partes.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.4",os.path.join(OUT_SVG,"27-gerar-partes.svg"),"-o",os.path.join(OUT_PNG,"27-gerar-partes.png")],check=True)
print("OK gerar-partes")
