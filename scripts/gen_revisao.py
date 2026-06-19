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
def circle(cx,cy,r,fill,stroke=None,sw=2):
    s=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'
GRADS={"brand":("#4f46e5","#7c3aed"),"rev":("#0d9488","#0891b2")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '<filter id="modalShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="16" stdDeviation="28" flood-color="#1e1b4b" flood-opacity="0.28"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill,fg="#fff"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,fg,weight="bold",anchor="middle")
def tagchip(x,y,tag):
    if not tag: return ""
    tw=12+len(tag)*5.6; tc="#ede9fe" if tag!="KIT" else "#cffafe"; tf="#6d28d9" if tag!="KIT" else "#0e7490"
    return rect(x-tw,y,tw,17,tc,rx=8)+text(x-tw/2,y+12,tag,9,tf,weight="bold",anchor="middle")
def btn(x,y,w,label,col,h=27,fs=10):
    return rect(x,y,w,h,col,rx=8)+text(x+w/2,y+h*0.64,label,fs,"#fff",weight="bold",anchor="middle")

def card(x,y,cw,color,op,tag,client,product,qty,rom,due,state):
    ch=158
    s=rect(x,y,cw,ch,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
    s+=rect(x,y,cw,6,color,rx=14)+rect(x,y+3,cw,3,color)
    s+=text(x+14,y+30,op,12.5,"#0f172a",weight="bold",ls="0.3")+tagchip(x+cw-14,y+17,tag)
    s+=text(x+14,y+50,client,13,"#0f172a",weight="bold")
    s+=text(x+14,y+68,f"{product} · {qty} pç",10.5,"#64748b")
    ry=y+80; rw=20+len(rom)*6.0
    s+=rect(x+14,ry,rw,17,"#f1f5f9",rx=8)+text(x+14+9,ry+12,"📋 "+rom,9,"#475569",weight="bold")
    s+=text(x+cw-14,ry+12,f"entrega {due}",9.5,"#94a3b8",anchor="end")
    if state=="aguardando":
        s+=btn(x+14,y+ch-34,cw-28,"👤 Atribuir revisora  ▾","#0d9488")
    else:
        bw=(cw-28-8)/2
        s+=btn(x+14,y+ch-34,bw,"✓ Aprovar","#10b981")
        s+=btn(x+14+bw+8,y+ch-34,bw,"✗ Reprovar","#ef4444")
    return s

def board():
    W,H=2400,980
    b=rect(0,0,W,60,"url(#g_brand)")
    b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
    b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar OP, cliente, romaneio…",12,"#e0e7ff")
    b+=text(W-200,38,"Sônia Revisão",13,"#fff",anchor="end")+avatar(W-176,30,15,"SR","#2dd4bf")
    b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
    nav=[("◧","Visão geral",False),("🧵","Costura",False),("🔎","Revisão",True),("📦","Expedição",False),("👥","Revisoras",False)]
    y=150
    for ic,label,act in nav:
        if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#2dd4bf",rx=2)+text(34,y+3,ic,13,"#99f6e4")+text(58,y+3,label,13.5,"#fff",weight="bold")
        else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
        y+=44
    b+=text(258,96,"Revisão",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Revisão",12,"#94a3b8")
    b+=text(258,150,"Pedidos chegam em 'Aguardando para revisar'. Cada revisora é uma coluna. Aprovado → Expedição; reprovado → volta p/ Costura.",12,"#475569")
    b+=rect(258+1300,86,210,40,"url(#g_rev)",rx=10)+text(258+1300+105,111,"＋  Nova revisora",13.5,"#fff",weight="bold",anchor="middle")
    kpis=[("Aguardando revisar","4","#f59e0b"),("Em revisão","5","#0891b2"),("Aprovados hoje","8","#10b981"),("Reprovados hoje","2","#ef4444")]
    x=258
    for l,n,c in kpis:
        b+=rect(x,170,236,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,182,4,32,c,rx=2)+text(x+20,206,n,22,"#0f172a",weight="bold")+text(x+20,223,l,11.5,"#64748b")
        x+=250
    x0=258; cw=290; gap=12; ytop=250; colh=H-ytop-30
    # coluna Aguardando para revisar
    x=x0
    b+=rect(x,ytop,cw,colh,"#fffaf0",rx=16,stroke="#fcd9a3",sw=1.5)
    b+=rect(x,ytop,cw,56,"#f59e0b",rx=16)+rect(x,ytop+40,cw,16,"#f59e0b")
    b+=text(x+22,ytop+26,"Aguardando para revisar",13,"#fff",weight="bold")+text(x+22,ytop+44,"chegou da Costura (OK)",10,"#fff7e6")
    b+=rect(x+cw-38,ytop+18,26,22,"#ffffff33",rx=11)+text(x+cw-25,ytop+33,"4",12,"#fff",weight="bold",anchor="middle")
    aguard=[("OP-1009","KIT","Loja V","Touca · TC01","90","R-214","21/06"),
            ("OP-0988","","Loja E","Blusa · BT12","60","R-219","23/06"),
            ("OP-1015","P1+P2","Loja W","Cardigã · CG04","200","R-222","27/06"),
            ("OP-1031","KIT","Malharia F","Cachecol · CC07","60","R-220","23/06")]
    cy=ytop+66
    for c in aguard:
        b+=card(x+9,cy,cw-18,"#f59e0b",*c,"aguardando"); cy+=170
    # colunas revisoras
    revs=[("Betânia","BE","#0d9488",[("OP-0990","P1+P2","Atacado D","Cardigã · CG04","90","R-221","24/06")]),
          ("Bruna","BR","#6366f1",[("OP-0995","","Cliente B","Cachecol · CC07","120","R-218","25/06")]),
          ("Sula","SU","#ec4899",[("OP-1042","P1+P2","Loja K","Blusa · BT12","300","R-223","22/06")]),
          ("Ray","RA","#f59e0b",[("OP-0985","KIT","Loja N","Luva · LV02","60","R-216","24/06")]),
          ("Eduarda","ED","#8b5cf6",[("OP-0978","","Loja P","Suéter · SU11","80","R-212","26/06")])]
    for ci,(name,ini,color,cards) in enumerate(revs):
        x=x0+(ci+1)*(cw+gap)
        b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
        b+=rect(x,ytop,cw,56,color,rx=16)+rect(x,ytop+40,cw,16,color)
        b+=avatar(x+28,ytop+28,16,ini,"#ffffff33")
        b+=text(x+52,ytop+25,name,14,"#fff",weight="bold")+text(x+52,ytop+43,f"{len(cards)} em revisão",10,"#ffffffcc")
        b+=rect(x+cw-38,ytop+18,26,22,"#ffffff33",rx=11)+text(x+cw-25,ytop+33,str(len(cards)),12,"#fff",weight="bold",anchor="middle")
        cy=ytop+66
        for c in cards:
            b+=card(x+9,cy,cw-18,color,*c,"revisando"); cy+=170
    # coluna add
    x=x0+6*(cw+gap)
    b+=rect(x,ytop,cw,colh,"#f0fdfa",rx=16,stroke="#5eead4",sw=2,dash="7 6")
    ccx=x+cw/2; ccy=ytop+colh/2-50
    b+=circle(ccx,ccy,30,"#ccfbf1")+text(ccx,ccy+10,"＋",28,"#0d9488",anchor="middle")
    b+=text(ccx,ccy+62,"Cadastrar nova",13.5,"#0f766e",weight="bold",anchor="middle")
    b+=text(ccx,ccy+81,"revisora",13.5,"#0f766e",weight="bold",anchor="middle")
    b+=rect(x+cw/2-74,ccy+100,148,36,"url(#g_rev)",rx=10)+text(x+cw/2,ccy+123,"＋  Nova revisora",12,"#fff",weight="bold",anchor="middle")
    b+=text(258,H-12,"Aprovar → Expedição (desmembra os pedidos agrupados). Reprovar → volta para a Costura em 'Voltou com problemas'.",11.5,"#94a3b8")
    return svg(W,H,b)

def modal():
    W,H=1180,820
    b=rect(0,0,W,60,"url(#g_brand)")+text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")+text(W-28,38,"Sônia Revisão",13,"#fff",anchor="end")
    b+=rect(0,60,W,H-60,"#eceef3")
    mw,mh=560,500; mx=(W-mw)/2; my=130
    b+=rect(mx,my,mw,mh,"#ffffff",rx=22,filt="modalShadow")
    b+=rect(mx,my,mw,80,"url(#g_rev)",rx=22)+rect(mx,my+48,mw,32,"url(#g_rev)")
    b+=text(mx+28,my+38,"Cadastrar Revisora",19,"#fff",weight="bold")+text(mx+28,my+60,"Vira uma nova coluna no quadro da Revisão",11.5,"#ccfbf1")
    b+=circle(mx+mw-40,my+34,15,"#ffffff2e")+text(mx+mw-40,my+39,"✕",15,"#fff",anchor="middle")
    ix=mx+28; iw=mw-56
    def lbl(x,y,t): return text(x,y,t,9.5,"#94a3b8",weight="bold",ls="0.6")
    yy=my+108
    b+=lbl(ix,yy,"NOME DA REVISORA")+rect(ix,yy+8,iw,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+14,yy+35,"Ex.: Patrícia",13,"#94d3c9")
    b+=lbl(ix,yy+72,"CONTATO / TELEFONE")+rect(ix,yy+80,iw,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+14,yy+107,"(00) 00000-0000",13,"#94d3c9")
    yc=yy+144; b+=lbl(ix,yc,"COR DA COLUNA")
    colors=["#0d9488","#6366f1","#ec4899","#f59e0b","#8b5cf6","#ef4444","#14b8a6"]; cxx=ix
    for i,c in enumerate(colors):
        b+=circle(cxx+16,yc+30,15,c)
        if i==0: b+=circle(cxx+16,yc+30,19,"none","#0f172a",2)
        cxx+=44
    fy=my+mh-64
    b+=rect(mx,fy-12,mw,76,"#fafbfc",rx=22)+rect(mx,fy-12,mw,30,"#fafbfc")
    b+=rect(ix,fy,130,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+65,fy+28,"Cancelar",13,"#475569",weight="bold",anchor="middle")
    b+=rect(mx+mw-28-230,fy,230,44,"url(#g_rev)",rx=10)+text(mx+mw-28-115,fy+28,"💾  Salvar revisora",13,"#fff",weight="bold",anchor="middle")
    return svg(W,H,b)

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"35-setor-revisao.svg"),"w").write(board())
subprocess.run(["rsvg-convert","-z","1.05",os.path.join(OUT_SVG,"35-setor-revisao.svg"),"-o",os.path.join(OUT_PNG,"35-setor-revisao.png")],check=True)
open(os.path.join(OUT_SVG,"36-cadastrar-revisora.svg"),"w").write(modal())
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"36-cadastrar-revisora.svg"),"-o",os.path.join(OUT_PNG,"36-cadastrar-revisora.png")],check=True)
print("OK revisao")
