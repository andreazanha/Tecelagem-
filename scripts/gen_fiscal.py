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
GRADS={"p1":("#4338ca","#6366f1"),"p2":("#7c3aed","#c026d3"),"kit":("#0891b2","#06b6d4"),
       "uni":("#475569","#64748b"),"brand":("#4f46e5","#7c3aed")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill="#a78bfa"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,"#fff",weight="bold",anchor="middle")
TINT={"amber":("#fff8ee","#f59e0b","#b45309"),"emerald":("#edfcf4","#10b981","#047857"),"blue":("#eef4ff","#3b82f6","#1d4ed8")}
def type_of(prefix,part):
    if prefix=="KIT": return "kit","KIT"
    if part=="P1": return "p1","PARTE 1"
    if part=="P2": return "p2","PARTE 2"
    return "uni","ÚNICO"

def fcard(x,y,cw,pf,num,client,product,vol,peso,med,frete,nf,status_label,status_key,action,due):
    ch=212; tkey,tlabel=type_of(pf,None)
    s=rect(x,y,cw,ch,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    hh=38
    s+=rect(x,y,cw,hh,f"url(#g_{tkey})",rx=16)+rect(x,y+hh-16,cw,16,f"url(#g_{tkey})")
    s+=text(x+16,y+24,f"{pf}-{num}",13,"#fff",weight="bold",ls="0.4")
    tw=14+len(tlabel)*6.6
    s+=rect(x+cw-16-tw,y+10,tw,18,"#ffffff33",rx=9)+text(x+cw-16-tw/2,y+23,tlabel,10,"#fff",weight="bold",anchor="middle")
    s+=text(x+16,y+hh+26,client,15,"#0f172a",weight="bold")
    bg,dot,fg=TINT[status_key]; sp=24+len(status_label)*6.0
    s+=rect(x+cw-16-sp,y+hh+12,sp,20,bg,rx=10)+circle(x+cw-16-sp+12,y+hh+22,3,dot)+text(x+cw-16-sp+21,y+hh+25.5,status_label,10,fg,weight="bold")
    s+=text(x+16,y+hh+44,product,11.5,"#64748b")
    # bloco de frete (vindo da Expedição)
    by=y+hh+54
    s+=rect(x+16,by,cw-32,68,"#f8fafc",rx=10,stroke="#e5e7eb")
    s+=text(x+28,by+20,"FORMULÁRIO DE FRETE (Expedição)",8.5,"#94a3b8",weight="bold",ls="0.4")
    s+=text(x+28,by+42,f"📦 {vol} vol",11.5,"#334155",weight="bold")
    s+=text(x+28+90,by+42,f"⚖ {peso}",11.5,"#334155",weight="bold")
    s+=text(x+28,by+60,f"📐 {med}",11,"#475569")
    if frete: s+=text(x+cw-28,by+42,frete,11.5,"#1d4ed8",weight="bold",anchor="end")
    if nf: s+=text(x+cw-28,by+60,f"NF {nf}",11,"#047857",weight="bold",anchor="end")
    # footer
    fy=y+ch-30
    s+=text(x+16,fy+16,f"entrega {due}",10.5,"#94a3b8")
    lab,col={"cotar":("Cotar frete","#3b82f6"),"emit":("✓ NF emitida","#10b981"),"send":("Transporte ▶","#6d28d9")}[action]
    bw=26+len(lab)*7.0
    s+=rect(x+cw-16-bw,fy,bw,26,col,rx=8)+text(x+cw-16-bw/2,fy+17,lab,11,"#fff",weight="bold",anchor="middle")
    return s

W,H=1500,920
b=rect(0,0,W,60,"url(#g_brand)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar pedido, NF…",12,"#e0e7ff")
b+=text(W-200,38,"Rita Fiscal",13,"#fff",anchor="end")+avatar(W-176,30,15,"RF")
b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
nav=[("◧","Visão geral",False),("📦","Pedidos",False),("🏭","Produção",False),("🧾","Fiscal",True),("🚚","Transporte",False),("📋","Romaneios",False)]
y=150
for ic,label,act in nav:
    if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#818cf8",rx=2)+text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
    else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
    y+=44
b+=text(258,96,"Fiscal",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Fiscal",12,"#94a3b8")
b+=text(258,150,"A NF é emitida no ERP. Aqui o Fiscal vê quem precisa emitir, cota o frete e marca como emitida → Transporte.",12,"#475569")
kpis=[("Para emitir","3","#f59e0b"),("Cotando frete","2","#3b82f6"),("NF emitida hoje","6","#10b981"),("Volumes hoje","41","#6366f1")]
x=258
for l,n,c in kpis:
    b+=rect(x,170,220,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,182,4,32,c,rx=2)+text(x+20,206,n,22,"#0f172a",weight="bold")+text(x+20,223,l,11.5,"#64748b")
    x+=234
cols=[
 ("Pedidos para emitir","Aguardando NF","amber",[
    ("OP","0998","Atacado D","Blusa · 120 pç","3","12 kg","60×40×30 cm",None,None,"Aguardando","amber","cotar","28/06"),
    ("OP","1001","Loja A","Suéter · 60 pç (P1+P2)","2","8 kg","50×40×25 cm",None,None,"Aguardando","amber","cotar","22/06")]),
 ("Cotando frete","Em cotação","blue",[
    ("OP","0990","Cliente B","Cardigã · 90 pç","4","18 kg","70×50×40 cm","R$ 240 · Transp. X",None,"Cotando","blue","emit","25/06")]),
 ("NF emitida","Pronto p/ Transporte","emerald",[
    ("OP","0985","Loja E","Touca · 200 pç","5","9 kg","60×40×30 cm","R$ 180 · Transp. Y","123456","Emitida","emerald","send","19/06"),
    ("KIT","0996","Loja N","Luva · 60 pç","1","3 kg","30×20×15 cm","R$ 60 · Correios","123457","Emitida","emerald","send","24/06")]),
]
x0=258; cw=388; gap=18; ytop=250
for ci,(title,sub,key,cards) in enumerate(cols):
    x=x0+ci*(cw+gap); bgt,dot,fg=TINT[key]; colh=H-ytop-30
    b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
    b+=rect(x,ytop,cw,52,bgt,rx=16)+rect(x,ytop+36,cw,16,bgt)
    b+=circle(x+20,ytop+26,5,dot)+text(x+34,ytop+24,title,13,fg,weight="bold")+text(x+34,ytop+40,sub,10.5,fg)
    b+=rect(x+cw-40,ytop+15,26,22,"#ffffffcc",rx=11)+text(x+cw-27,ytop+30,str(len(cards)),12,fg,weight="bold",anchor="middle")
    cy=ytop+64
    for c in cards:
        b+=fcard(x+12,cy,cw-24,*c); cy+=224
b+=text(258,H-12,"O formulário de frete (volumes, peso, medidas) é gerado na Expedição. 'NF emitida' move o pedido para Transporte.",11.5,"#94a3b8")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"29-fiscal.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.3",os.path.join(OUT_SVG,"29-fiscal.svg"),"-o",os.path.join(OUT_PNG,"29-fiscal.png")],check=True)
print("OK fiscal")
