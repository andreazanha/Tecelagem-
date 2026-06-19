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
GRADS={"brand":("#4f46e5","#7c3aed"),"cos":("#db2777","#9333ea")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '<filter id="modalShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="16" stdDeviation="28" flood-color="#1e1b4b" flood-opacity="0.28"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill,fg="#fff"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,fg,weight="bold",anchor="middle")

def ccard(x,y,cw,color,op,tag,client,product,qty,rom,due,devolvido=False):
    ch=150
    s=rect(x,y,cw,ch,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
    s+=rect(x,y,cw,6,color,rx=14)+rect(x,y+3,cw,3,color)
    s+=text(x+16,y+30,op,13,"#0f172a",weight="bold",ls="0.3")
    if tag:
        tw=12+len(tag)*5.6; tc="#ede9fe" if tag!="KIT" else "#cffafe"; tf="#6d28d9" if tag!="KIT" else "#0e7490"
        s+=rect(x+cw-16-tw,y+17,tw,17,tc,rx=8)+text(x+cw-16-tw/2,y+29,tag,9,tf,weight="bold",anchor="middle")
    s+=text(x+16,y+50,client,13.5,"#0f172a",weight="bold")
    s+=text(x+16,y+69,f"{product} · {qty} pç",11,"#64748b")
    # romaneio + entrega
    ry=y+82
    rw=20+len(rom)*6.2
    s+=rect(x+16,ry,rw,18,"#f1f5f9",rx=9)+text(x+16+10,ry+13,"📋 "+rom,9.5,"#475569",weight="bold")
    s+=text(x+cw-16,ry+13,f"entrega {due}",10,"#94a3b8",anchor="end")
    # footer
    fy=y+ch-30
    if devolvido:
        s+=rect(x+16,fy+2,118,24,"#fef2f2",rx=8,stroke="#fecaca")+text(x+16+59,fy+18,"↩ Devolvida",10.5,"#dc2626",weight="bold",anchor="middle")
    lab="Concluir ▶"; bw=24+len(lab)*6.6
    s+=rect(x+cw-16-bw,fy,bw,26,"#6d28d9",rx=8)+text(x+cw-16-bw/2,fy+17,lab,11,"#fff",weight="bold",anchor="middle")
    return s

def board():
    W,H=2240,940
    b=rect(0,0,W,60,"url(#g_brand)")
    b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
    b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar OP, cliente, romaneio…",12,"#e0e7ff")
    b+=text(W-200,38,"Marta Costura",13,"#fff",anchor="end")+avatar(W-176,30,15,"MC","#f472b6")
    b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
    nav=[("◧","Visão geral",False),("🧵","Costura",True),("📥","Recebidos",False),("📋","Romaneios",False),("👥","Costureiras",False),("📊","Desempenho",False)]
    y=150
    for ic,label,act in nav:
        if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#f472b6",rx=2)+text(34,y+3,ic,13,"#fbcfe8")+text(58,y+3,label,13.5,"#fff",weight="bold")
        else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
        y+=44
    b+=text(258,96,"Costura",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Costura",12,"#94a3b8")
    b+=text(258,150,"Cada costureira é uma coluna com os pedidos que estão com ela. Ao concluir, o pedido vai para a Revisão.",12,"#475569")
    # botão nova costureira no topo direito
    b+=rect(258+1180,86,220,40,"url(#g_cos)",rx=10)+text(258+1180+110,111,"＋  Nova costureira",13.5,"#fff",weight="bold",anchor="middle")
    kpis=[("Costureiras","5","#db2777"),("OPs em costura","8","#9333ea"),("Peças em costura","920","#6366f1"),("Concluídas hoje","6","#10b981")]
    x=258
    for l,n,c in kpis:
        b+=rect(x,170,230,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,182,4,32,c,rx=2)+text(x+20,206,n,22,"#0f172a",weight="bold")+text(x+20,223,l,11.5,"#64748b")
        x+=244
    # colunas = costureiras
    cost=[
     ("Silvia","SI","#ec4899",[("OP-1009","KIT","Loja V","Touca · TC01","90","R-214","21/06",False),
                                ("OP-0995","","Cliente B","Cachecol · CC07","120","R-218","25/06",False)]),
     ("Angélica","AN","#8b5cf6",[("OP-0990","P1+P2","Atacado D","Cardigã · CG04","90","R-221","24/06",False)]),
     ("Bene","BE","#10b981",[("OP-0988","","Loja E","Blusa · BT12","60","R-219","23/06",False),
                              ("OP-1015","P1+P2","Loja W","Cardigã · CG04","200","R-222","27/06",False)]),
     ("Nice","NI","#f59e0b",[("OP-1031","KIT","Malharia F","Cachecol · CC07","60","R-220","23/06",False)]),
     ("Cris","CR","#3b82f6",[("OP-1042","P1+P2","Loja K","Blusa · BT12","300","R-223","22/06",False),
                              ("OP-0980","","Loja A","Suéter · SU11","45","R-210","20/06",True)]),
    ]
    x0=258; cw=312; gap=14; ytop=250; colh=H-ytop-30
    for ci,(name,ini,color,cards) in enumerate(cost):
        x=x0+ci*(cw+gap)
        b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
        b+=rect(x,ytop,cw,58,color,rx=16)+rect(x,ytop+42,cw,16,color)
        b+=avatar(x+30,ytop+29,17,ini,"#ffffff33")
        b+=text(x+56,ytop+26,name,14.5,"#fff",weight="bold")+text(x+56,ytop+44,f"{sum(int(c[4]) for c in cards)} pç · {len(cards)} OP",10.5,"#ffffffcc")
        b+=rect(x+cw-40,ytop+19,26,22,"#ffffff33",rx=11)+text(x+cw-27,ytop+34,str(len(cards)),12,"#fff",weight="bold",anchor="middle")
        cy=ytop+70
        for c in cards:
            b+=ccard(x+10,cy,cw-20,color,c[0],c[1],c[2],c[3],c[4],c[5],c[6],c[7]); cy+=162
    # coluna add
    x=x0+5*(cw+gap)
    b+=rect(x,ytop,cw,colh,"#f8f7fb",rx=16,stroke="#d8b4fe",sw=2,dash="7 6")
    ccx=x+cw/2; ccy=ytop+colh/2-40
    b+=circle(ccx,ccy,32,"#f3e8ff")+text(ccx,ccy+10,"＋",30,"#9333ea",anchor="middle")
    b+=text(ccx,ccy+66,"Cadastrar nova",14,"#7c3aed",weight="bold",anchor="middle")
    b+=text(ccx,ccy+86,"costureira",14,"#7c3aed",weight="bold",anchor="middle")
    b+=text(ccx,ccy+112,"Vira uma coluna no quadro",10.5,"#a78bbf",anchor="middle")
    b+=rect(x+cw/2-80,ccy+130,160,38,"url(#g_cos)",rx=10)+text(x+cw/2,ccy+155,"＋  Nova costureira",12.5,"#fff",weight="bold",anchor="middle")
    b+=text(258,H-12,"As colunas são as costureiras cadastradas. 'Nova costureira' adiciona mais uma coluna. Concluir → envia o pedido para a Revisão.",11.5,"#94a3b8")
    return svg(W,H,b)

def modal():
    W,H=1180,820
    b=rect(0,0,W,60,"url(#g_brand)")+text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")+text(W-28,38,"Marta Costura",13,"#fff",anchor="end")
    b+=rect(0,60,W,H-60,"#eceef3")
    mw,mh=560,580; mx=(W-mw)/2; my=110
    b+=rect(mx,my,mw,mh,"#ffffff",rx=22,filt="modalShadow")
    b+=rect(mx,my,mw,80,"url(#g_cos)",rx=22)+rect(mx,my+48,mw,32,"url(#g_cos)")
    b+=text(mx+28,my+38,"Cadastrar Costureira",19,"#fff",weight="bold")+text(mx+28,my+60,"Vira uma nova coluna no quadro da Costura",11.5,"#fce7f3")
    b+=circle(mx+mw-40,my+34,15,"#ffffff2e")+text(mx+mw-40,my+39,"✕",15,"#fff",anchor="middle")
    ix=mx+28; iw=mw-56
    def lbl(x,y,t): return text(x,y,t,9.5,"#94a3b8",weight="bold",ls="0.6")
    def field(y,label,val,ph=False,w=None):
        w=w or iw
        s=lbl(ix,y,label)+rect(ix,y+8,w,44,"#ffffff",rx=10,stroke="#e2e8f0")
        s+=text(ix+14,y+35,val,13,"#a5b4fc" if ph else "#0f172a",weight="normal" if ph else "bold")
        return s
    yy=my+108
    b+=field(yy,"NOME DA COSTUREIRA","Ex.: Fernanda",ph=True)
    half=(iw-16)/2
    b+=lbl(ix,yy+72,"TIPO")+rect(ix,yy+80,half,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+14,yy+107,"Interna  ▾",13,"#0f172a",weight="bold")
    b+=rect(ix+half+16,yy+80,half,44,"#ffffff",rx=10,stroke="#e2e8f0")
    b+=lbl(ix+half+16,yy+72,"CAPACIDADE (pç/sem)")
    b+=text(ix+half+16+14,yy+107,"400",13,"#0f172a",weight="bold")
    b+=field(yy+144,"CONTATO / TELEFONE","(00) 00000-0000",ph=True)
    # cor/etiqueta
    yc=yy+216
    b+=lbl(ix,yc,"COR DA COLUNA")
    colors=["#ec4899","#8b5cf6","#10b981","#f59e0b","#3b82f6","#ef4444","#14b8a6"]
    cxx=ix
    for i,c in enumerate(colors):
        sel = i==1
        b+=circle(cxx+16,yc+30,15,c)
        if sel: b+=circle(cxx+16,yc+30,19,"none","#0f172a",2)
        cxx+=44
    # footer
    fy=my+mh-64
    b+=rect(mx,fy-12,mw,76,"#fafbfc",rx=22)+rect(mx,fy-12,mw,30,"#fafbfc")
    b+=rect(ix,fy,130,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+65,fy+28,"Cancelar",13,"#475569",weight="bold",anchor="middle")
    b+=rect(mx+mw-28-250,fy,250,44,"url(#g_cos)",rx=10)+text(mx+mw-28-125,fy+28,"💾  Salvar costureira",13,"#fff",weight="bold",anchor="middle")
    return svg(W,H,b)

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"33-setor-costura.svg"),"w").write(board())
subprocess.run(["rsvg-convert","-z","1.1",os.path.join(OUT_SVG,"33-setor-costura.svg"),"-o",os.path.join(OUT_PNG,"33-setor-costura.png")],check=True)
open(os.path.join(OUT_SVG,"34-cadastrar-costureira.svg"),"w").write(modal())
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"34-cadastrar-costureira.svg"),"-o",os.path.join(OUT_PNG,"34-cadastrar-costureira.png")],check=True)
print("OK costura + modal")
