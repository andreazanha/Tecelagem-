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
GRADS={"p12":("#4f46e5","#a855f7"),"kit":("#0891b2","#06b6d4"),"uni":("#475569","#64748b"),"brand":("#4f46e5","#7c3aed"),"tr":("#1d4ed8","#0891b2")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '<filter id="modalShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="16" stdDeviation="28" flood-color="#1e1b4b" flood-opacity="0.28"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill,fg="#fff"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.78,fg,weight="bold",anchor="middle")
TLBL={"p12":"P1+P2","kit":"KIT","uni":"ÚNICO"}
def btn(x,y,w,label,col,h=26,fs=10):
    return rect(x,y,w,h,col,rx=8)+text(x+w/2,y+h*0.64,label,fs,"#fff",weight="bold",anchor="middle")

def card(x,y,cw,tkey,num,client,nf,vol,state,extra):
    ch=158
    s=rect(x,y,cw,ch,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
    hh=32
    s+=rect(x,y,cw,hh,f"url(#g_{tkey})",rx=14)+rect(x,y+hh-14,cw,14,f"url(#g_{tkey})")
    s+=text(x+12,y+21,f"OP-{num}",12,"#fff",weight="bold",ls="0.3")
    tl=TLBL[tkey]; tw=12+len(tl)*6.0
    s+=rect(x+cw-12-tw,y+8,tw,16,"#ffffff33",rx=8)+text(x+cw-12-tw/2,y+20,tl,8.5,"#fff",weight="bold",anchor="middle")
    s+=text(x+12,y+hh+22,client,13,"#0f172a",weight="bold")
    s+=text(x+12,y+hh+40,f"NF {nf} · {vol}",10.5,"#64748b")
    # status / extra
    stmap={"aguardando":("Aguardando envio","#fff7ed","#b45309","#f59e0b"),
           "coleta":("Aguardando coleta","#fff7ed","#b45309","#f59e0b"),
           "rota":("Em rota","#eff6ff","#1d4ed8","#3b82f6"),
           "entregue":("Entregue","#ecfdf5","#047857","#10b981")}
    lab,bg,fg,dot=stmap[state]
    cw2=24+len(lab)*5.8; sy=y+hh+50
    s+=rect(x+12,sy,cw2,18,bg,rx=9)+circle(x+22,sy+9,3,dot)+text(x+31,sy+13,lab,9.5,fg,weight="bold")
    if extra: s+=text(x+12,sy+34,extra,9.5,"#94a3b8")
    # footer button
    if state=="aguardando":
        s+=btn(x+12,y+ch-32,cw-24,"🚚 Atribuir transportadora ▾","#0d9488",fs=9.5)
    elif state=="coleta":
        s+=btn(x+12,y+ch-32,cw-24,"📤 Despachar","#3b82f6")
    elif state=="rota":
        s+=btn(x+12,y+ch-32,cw-24,"✓ Confirmar entrega","#10b981")
    else:
        s+=btn(x+12,y+ch-32,cw-24,"📄 Ver comprovante","#64748b")
    return s

def board():
    W,H=2560,980
    b=rect(0,0,W,60,"url(#g_brand)")
    b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
    b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar OP, NF, rastreio…",12,"#e0e7ff")
    b+=text(W-200,38,"Léo Logística",13,"#fff",anchor="end")+avatar(W-176,30,15,"LL","#38bdf8")
    b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
    nav=[("◧","Visão geral",False),("📦","Expedição",False),("🧾","Fiscal",False),("🚚","Transporte",True),("📋","Romaneios",False)]
    y=150
    for ic,label,act in nav:
        if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#38bdf8",rx=2)+text(34,y+3,ic,13,"#bae6fd")+text(58,y+3,label,13.5,"#fff",weight="bold")
        else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
        y+=44
    b+=text(258,96,"Transporte",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Transporte",12,"#94a3b8")
    b+=text(258,150,"Pedidos com NF emitida entram em 'A serem enviados'. Atribua a transportadora (cada uma é uma coluna) e acompanhe até a entrega.",12,"#475569")
    b+=rect(258+1380,86,250,40,"url(#g_tr)",rx=10)+text(258+1380+125,111,"＋  Nova transportadora",13.5,"#fff",weight="bold",anchor="middle")
    kpis=[("A enviar","3","#f59e0b"),("Em rota","3","#3b82f6"),("Entregues hoje","9","#10b981"),("Transportadoras","6","#0891b2")]
    x=258
    for l,n,c in kpis:
        b+=rect(x,170,236,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,182,4,32,c,rx=2)+text(x+20,206,n,22,"#0f172a",weight="bold")+text(x+20,223,l,11.5,"#64748b")
        x+=250
    x0=258; cw=272; gap=12; ytop=250; colh=H-ytop-30
    # coluna aguardando
    x=x0
    b+=rect(x,ytop,cw,colh,"#fffaf0",rx=16,stroke="#fcd9a3",sw=1.5)
    b+=rect(x,ytop,cw,56,"#f59e0b",rx=16)+rect(x,ytop+40,cw,16,"#f59e0b")
    b+=text(x+20,ytop+26,"Pedidos a serem enviados",12,"#fff",weight="bold")+text(x+20,ytop+44,"NF emitida (do Fiscal)",10,"#fff7e6")
    b+=rect(x+cw-38,ytop+18,26,22,"#ffffff33",rx=11)+text(x+cw-25,ytop+33,"3",12,"#fff",weight="bold",anchor="middle")
    aguard=[("uni","0988","Loja E","123463","2 vol · 18 kg","aguardando","Frete cotado: R$ 180"),
            ("p12","1015","Loja W","123464","5 vol · 41 kg","aguardando","Frete cotado: R$ 420"),
            ("kit","1031","Malharia F","123465","1 vol · 6 kg","aguardando","Frete cotado: R$ 90")]
    cy=ytop+66
    for c in aguard:
        b+=card(x+10,cy,cw-20,*c); cy+=170
    # colunas transportadoras
    transp=[("Braspress","BP","#dc2626",[("uni","0978","Loja P","123460","3 vol","rota","Rastreio BR9981-PR")]),
            ("Translovato","TL","#2563eb",[("kit","0970","Loja H","123457","1 vol","coleta","Coleta agendada 19/06")]),
            ("Jadlog","JL","#7c3aed",[("kit","0985","Loja N","123461","2 vol","rota","Rastreio JL55321")]),
            ("Correios","CO","#ea580c",[("uni","0995","Cliente B","123458","1 vol","entregue","Entregue 18/06")]),
            ("Cliente retirou","CR","#0d9488",[("p12","0990","Atacado D","123459","4 vol","entregue","Retirado 18/06")]),
            ("Transporte interno","TI","#475569",[("kit","1009","Loja V","123462","2 vol","rota","Motorista: Carlos")])]
    for ci,(name,ini,color,cards) in enumerate(transp):
        x=x0+(ci+1)*(cw+gap)
        b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
        b+=rect(x,ytop,cw,56,color,rx=16)+rect(x,ytop+40,cw,16,color)
        b+=avatar(x+26,ytop+28,15,ini,"#ffffff33")
        nm = name if len(name)<=14 else name
        b+=text(x+50,ytop+26,nm,12.5 if len(name)<=12 else 11,"#fff",weight="bold")+text(x+50,ytop+44,f"{len(cards)} envio(s)",10,"#ffffffcc")
        b+=rect(x+cw-36,ytop+18,24,22,"#ffffff33",rx=11)+text(x+cw-24,ytop+33,str(len(cards)),12,"#fff",weight="bold",anchor="middle")
        cy=ytop+66
        for c in cards:
            b+=card(x+10,cy,cw-20,*c); cy+=170
    # coluna add
    x=x0+7*(cw+gap)
    b+=rect(x,ytop,cw,colh,"#eff8ff",rx=16,stroke="#7dd3fc",sw=2,dash="7 6")
    ccx=x+cw/2; ccy=ytop+colh/2-50
    b+=circle(ccx,ccy,30,"#e0f2fe")+text(ccx,ccy+10,"＋",28,"#0284c7",anchor="middle")
    b+=text(ccx,ccy+62,"Cadastrar nova",13,"#0369a1",weight="bold",anchor="middle")
    b+=text(ccx,ccy+81,"transportadora",13,"#0369a1",weight="bold",anchor="middle")
    b+=rect(x+cw/2-78,ccy+100,156,36,"url(#g_tr)",rx=10)+text(x+cw/2,ccy+123,"＋  Nova transp.",12,"#fff",weight="bold",anchor="middle")
    b+=text(258,H-12,"Atribuir transportadora → o card vai para a coluna dela. Inclui Correios, Cliente retirou e Transporte interno. 'Nova transportadora' cria mais colunas.",11.5,"#94a3b8")
    return svg(W,H,b)

def modal():
    W,H=1180,820
    b=rect(0,0,W,60,"url(#g_brand)")+text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")+text(W-28,38,"Léo Logística",13,"#fff",anchor="end")
    b+=rect(0,60,W,H-60,"#eceef3")
    mw,mh=560,560; mx=(W-mw)/2; my=110
    b+=rect(mx,my,mw,mh,"#ffffff",rx=22,filt="modalShadow")
    b+=rect(mx,my,mw,80,"url(#g_tr)",rx=22)+rect(mx,my+48,mw,32,"url(#g_tr)")
    b+=text(mx+28,my+38,"Cadastrar Transportadora",19,"#fff",weight="bold")+text(mx+28,my+60,"Vira uma nova coluna no quadro do Transporte",11.5,"#cffafe")
    b+=circle(mx+mw-40,my+34,15,"#ffffff2e")+text(mx+mw-40,my+39,"✕",15,"#fff",anchor="middle")
    ix=mx+28; iw=mw-56
    def lbl(x,y,t): return text(x,y,t,9.5,"#94a3b8",weight="bold",ls="0.6")
    yy=my+108; half=(iw-16)/2
    b+=lbl(ix,yy,"NOME")+rect(ix,yy+8,iw,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+14,yy+35,"Ex.: Rodonaves",13,"#94d3c9")
    b+=lbl(ix,yy+72,"TIPO")+rect(ix,yy+80,half,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+14,yy+107,"Transportadora  ▾",13,"#0f172a",weight="bold")
    b+=lbl(ix+half+16,yy+72,"SITE DE RASTREIO")+rect(ix+half+16,yy+80,half,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+half+16+14,yy+107,"opcional",13,"#94d3c9")
    b+=lbl(ix,yy+144,"CONTATO / TELEFONE")+rect(ix,yy+152,iw,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+14,yy+179,"(00) 00000-0000",13,"#94d3c9")
    yc=yy+216; b+=lbl(ix,yc,"COR DA COLUNA")
    colors=["#dc2626","#2563eb","#7c3aed","#ea580c","#0d9488","#475569","#db2777"]; cxx=ix
    for i,c in enumerate(colors):
        b+=circle(cxx+16,yc+30,15,c)
        if i==1: b+=circle(cxx+16,yc+30,19,"none","#0f172a",2)
        cxx+=44
    b+=text(ix,yc+72,"Tipos: Transportadora · Correios · Cliente retira · Transporte interno",10,"#94a3b8")
    fy=my+mh-64
    b+=rect(mx,fy-12,mw,76,"#fafbfc",rx=22)+rect(mx,fy-12,mw,30,"#fafbfc")
    b+=rect(ix,fy,130,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+65,fy+28,"Cancelar",13,"#475569",weight="bold",anchor="middle")
    b+=rect(mx+mw-28-270,fy,270,44,"url(#g_tr)",rx=10)+text(mx+mw-28-135,fy+28,"💾  Salvar transportadora",12.5,"#fff",weight="bold",anchor="middle")
    return svg(W,H,b)

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"39-setor-transporte.svg"),"w").write(board())
subprocess.run(["rsvg-convert","-z","1.0",os.path.join(OUT_SVG,"39-setor-transporte.svg"),"-o",os.path.join(OUT_PNG,"39-setor-transporte.png")],check=True)
open(os.path.join(OUT_SVG,"40-cadastrar-transportadora.svg"),"w").write(modal())
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"40-cadastrar-transportadora.svg"),"-o",os.path.join(OUT_PNG,"40-cadastrar-transportadora.png")],check=True)
print("OK transporte")
