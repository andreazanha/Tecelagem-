# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,dash=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if dash: s+=f' stroke-dasharray="{dash}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
GRADS={"p12":("#4f46e5","#a855f7"),"kit":("#0891b2","#06b6d4"),"uni":("#475569","#64748b"),
       "est":("#d97706","#f59e0b"),"exp":("#0891b2","#0ea5e9"),"brand":("#4f46e5","#7c3aed")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,"#fff",weight="bold",anchor="middle")
TLBL={"p12":"P1+P2","kit":"KIT","uni":"ÚNICO","est":"ESTOQUE"}
TINT={"amber":("#fff8ee","#f59e0b","#b45309"),"blue":("#eef4ff","#3b82f6","#1d4ed8"),"emerald":("#edfcf4","#10b981","#047857")}
def btn(x,y,w,label,col,h=28,fs=11):
    return rect(x,y,w,h,col,rx=8)+text(x+w/2,y+h*0.64,label,fs,"#fff",weight="bold",anchor="middle")

def card(x,y,cw,tkey,num,client,product,qty,due,state,medidas=None):
    ch=190
    s=rect(x,y,cw,ch,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    hh=36
    s+=rect(x,y,cw,hh,f"url(#g_{tkey})",rx=16)+rect(x,y+hh-16,cw,16,f"url(#g_{tkey})")
    s+=text(x+16,y+23,f"OP-{num}",13,"#fff",weight="bold",ls="0.3")
    tl=TLBL[tkey]; tw=14+len(tl)*6.4
    s+=rect(x+cw-16-tw,y+9,tw,18,"#ffffff33",rx=9)+text(x+cw-16-tw/2,y+22,tl,9.5,"#fff",weight="bold",anchor="middle")
    s+=text(x+16,y+hh+24,client,14.5,"#0f172a",weight="bold")
    s+=text(x+cw-16,y+hh+24,f"entrega {due}",10,"#94a3b8",anchor="end")
    s+=text(x+16,y+hh+42,f"{product} · {qty} pç",11,"#64748b")
    by=y+hh+52
    if state=="aexpedir":
        s+=rect(x+16,by,cw-32,34,"#fff7ed",rx=10,stroke="#fed7aa")
        s+=text(x+28,by+22,"📥 chegou aprovado da Revisão",11,"#b45309",weight="bold")
        s+=btn(x+16,y+ch-38,cw-32,"▶ Expedir (separar / embalar)","#10b981")
    elif state=="expedindo":
        if medidas:
            s+=rect(x+16,by,cw-32,34,"#ecfdf5",rx=10,stroke="#a7f3d0")
            s+=text(x+28,by+22,f"✓ Medidas: {medidas}",11,"#047857",weight="bold")
        else:
            s+=rect(x+16,by,cw-32,34,"#fff7ed",rx=10,stroke="#fed7aa")
            s+=text(x+28,by+22,"📐 Medidas pendentes — preencha p/ finalizar",10.5,"#b45309",weight="bold")
        bw=(cw-32-10)/2
        s+=btn(x+16,y+ch-38,bw,"📐 Medidas/Volumes","#6d28d9")
        fcol="#10b981" if medidas else "#cbd5e1"
        s+=btn(x+16+bw+10,y+ch-38,bw,"✓ Finalizar",fcol)
    else: # finalizado
        s+=rect(x+16,by,cw-32,34,"#f8fafc",rx=10,stroke="#e2e8f0")
        s+=text(x+28,by+22,f"📦 {medidas}",11,"#334155",weight="bold")
        s+=btn(x+16,y+ch-38,cw-32,"🔒 Enviar ao Fiscal ▶","#0891b2")
    return s

W,H=1540,900
b=rect(0,0,W,60,"url(#g_brand)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar OP, cliente…",12,"#e0e7ff")
b+=text(W-200,38,"Ana Expedição",13,"#fff",anchor="end")+avatar(W-176,30,15,"AE","#22d3ee")
b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
nav=[("◧","Visão geral",False),("🔎","Revisão",False),("📦","Expedição",True),("🧾","Fiscal",False),("🚚","Transporte",False)]
y=150
for ic,label,act in nav:
    if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#22d3ee",rx=2)+text(34,y+3,ic,13,"#a5f3fc")+text(58,y+3,label,13.5,"#fff",weight="bold")
    else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
    y+=44
b+=text(258,96,"Expedição",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Expedição",12,"#94a3b8")
b+=text(258,150,"Separe/embale, preencha as Medidas e Volumes (botão 📐) e finalize. Finalizados seguem para o Fiscal cotar o frete.",12,"#475569")
kpis=[("A expedir","3","#f59e0b"),("Expedindo","2","#3b82f6"),("Medidas pendentes","1","#ef4444"),("Finalizados hoje","6","#10b981")]
x=258
for l,n,c in kpis:
    b+=rect(x,170,232,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,182,4,32,c,rx=2)+text(x+20,206,n,22,"#0f172a",weight="bold")+text(x+20,223,l,11.5,"#64748b")
    x+=246
cols=[
 ("Pedidos a expedir","Chegou da Revisão","amber",[
    ("p12","0990","Atacado D","Cardigã · CG04","90","24/06","aexpedir",None),
    ("kit","0985","Loja N","Luva · LV02","60","24/06","aexpedir",None),
    ("kit","1009","Loja V","Touca · TC01","90","21/06","aexpedir",None)]),
 ("Expedindo","Separando / embalando","blue",[
    ("uni","0988","Loja E","Blusa · BT12","60","23/06","expedindo",None),
    ("uni","0995","Cliente B","Cachecol · CC07","120","25/06","expedindo","2 vol · 18 kg")]),
 ("Finalizados → Fiscal","Medidas preenchidas","emerald",[
    ("uni","0978","Loja P","Suéter · SU11","80","26/06","finalizado","3 vol · 28,5 kg · 60×40×30"),
    ("kit","0970","Loja H","Gorro · GR02","30","20/06","finalizado","1 vol · 4 kg · 30×20×15")]),
]
x0=258; cw=390; gap=18; ytop=250; colh=H-ytop-30
for ci,(title,sub,key,cards) in enumerate(cols):
    x=x0+ci*(cw+gap); bgt,dot,fg=TINT[key]
    b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
    b+=rect(x,ytop,cw,52,bgt,rx=16)+rect(x,ytop+36,cw,16,bgt)
    b+=circle(x+20,ytop+26,5,dot)+text(x+34,ytop+24,title,13,fg,weight="bold")+text(x+34,ytop+40,sub,10.5,fg)
    b+=rect(x+cw-40,ytop+15,26,22,"#ffffffcc",rx=11)+text(x+cw-27,ytop+30,str(len(cards)),12,fg,weight="bold",anchor="middle")
    cy=ytop+64
    for c in cards:
        b+=card(x+12,cy,cw-24,*c); cy+=202
b+=text(258,H-12,"O botão 📐 Medidas/Volumes abre o Formulário de Medidas e Pesos (caixa/fardo, várias linhas). Só finaliza com as medidas preenchidas.",11.5,"#94a3b8")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"38-setor-expedicao.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.35",os.path.join(OUT_SVG,"38-setor-expedicao.svg"),"-o",os.path.join(OUT_PNG,"38-setor-expedicao.png")],check=True)
print("OK expedicao board")
