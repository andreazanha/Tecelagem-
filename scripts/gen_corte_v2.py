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
       "uni":("#475569","#64748b"),"est":("#d97706","#f59e0b"),"u12":("#4f46e5","#a855f7"),
       "brand":("#4f46e5","#7c3aed")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '<filter id="modalShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="16" stdDeviation="28" flood-color="#1e1b4b" flood-opacity="0.28"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill="#a78bfa"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,"#fff",weight="bold",anchor="middle")
TINT={"amber":("#fff8ee","#f59e0b","#b45309"),"emerald":("#edfcf4","#10b981","#047857"),"blue":("#eef4ff","#3b82f6","#1d4ed8")}
TLBL={"u12":"PARTE 1 + 2","kit":"KIT","est":"ESTOQUE","uni":"ÚNICO","p1":"PARTE 1","p2":"PARTE 2"}
def chip(x,y,label,bg,fg,fs=9.5,h=18):
    w=14+len(label)*5.7
    return rect(x,y,w,h,bg,rx=h/2)+text(x+7,y+h*0.7,label,fs,fg,weight="bold"),w

def card(x,y,cw,tkey,num,client,product,qty,status_label,status_key,action,pedido_date,due_date,merged=False,pe=False,foot=""):
    ch=200
    s=rect(x,y,cw,ch,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    hh=38
    s+=rect(x,y,cw,hh,f"url(#g_{tkey})",rx=16)+rect(x,y+hh-16,cw,16,f"url(#g_{tkey})")
    s+=text(x+16,y+24,f"OP-{num}" if tkey!="kit" else f"KIT-{num}",13,"#fff",weight="bold",ls="0.3")
    tl=TLBL[tkey]; tw=14+len(tl)*6.4
    s+=rect(x+cw-16-tw,y+10,tw,18,"#ffffff33",rx=9)+text(x+cw-16-tw/2,y+23,tl,9.5,"#fff",weight="bold",anchor="middle")
    s+=text(x+16,y+hh+26,client,15,"#0f172a",weight="bold")
    bg,dot,fg=TINT[status_key]; sp=24+len(status_label)*6.0
    s+=rect(x+cw-16-sp,y+hh+12,sp,20,bg,rx=10)+circle(x+cw-16-sp+12,y+hh+22,3,dot)+text(x+cw-16-sp+21,y+hh+25.5,status_label,10,fg,weight="bold")
    s+=text(x+16,y+hh+44,f"{product} · {qty} pç",11.5,"#64748b")
    # tags (unidos / pronta entrega)
    ty=y+hh+58
    if merged:
        c,w=chip(x+16,ty,"🔗 P1 + P2 unidos","#eef2ff","#4338ca"); s+=c; tx=x+16+w+8
    else:
        tx=x+16
    if pe:
        c,w=chip(tx,ty,"📦 + Pronta Entrega (junto)","#ecfdf5","#047857"); s+=c
    # datas
    bw=(cw-32-10)/2; by=y+hh+80
    s+=rect(x+16,by,bw,40,"#f5f3ff",rx=10,stroke="#e9e3ff")+text(x+16+12,by+15,"PEDIDO",8,"#7c3aed",weight="bold",ls="0.6")+text(x+16+12,by+32,pedido_date,12.5,"#4c1d95",weight="bold")
    s+=rect(x+16+bw+10,by,bw,40,"#fff1f2",rx=10,stroke="#fde0e3")+text(x+16+bw+10+12,by+15,"ENTREGA",8,"#e11d48",weight="bold",ls="0.6")+text(x+16+bw+10+12,by+32,due_date,12.5,"#be123c",weight="bold")
    # footer
    fy=y+ch-30
    s+=text(x+16,fy+16,foot,10,"#94a3b8")
    lab,col={"start":("Cortar","#10b981"),"stop":("Cortado","#3b82f6"),"send":("Enviar p/ Costureira","#6d28d9")}[action]
    bw2=26+len(lab)*6.6
    s+=rect(x+cw-16-bw2,fy,bw2,26,col,rx=8)+text(x+cw-16-bw2/2,fy+17,lab,11,"#fff",weight="bold",anchor="middle")
    return s

def board():
    W,H=2240,980
    b=rect(0,0,W,60,"url(#g_brand)")
    b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
    b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar OP, cliente, kit…",12,"#e0e7ff")
    b+=text(W-200,38,"José Corte",13,"#fff",anchor="end")+avatar(W-176,30,15,"JC")
    b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
    nav=[("◧","Visão geral",False),("✂️","Corte",True),("📥","Fila de entrada",False),("✅","Cortados",False),("📋","Romaneios",False),("📊","Desempenho",False)]
    y=150
    for ic,label,act in nav:
        if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#818cf8",rx=2)+text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
        else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
        y+=44
    b+=text(258,96,"Corte",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Corte",12,"#94a3b8")
    b+=text(258,150,"Parte 1 e Parte 2 se unem aqui em um único card. Ao cortar, escolha a costureira e gere o romaneio.",12,"#475569")
    kpis=[("Aguardando","5","#f59e0b"),("Cortando","2","#10b981"),("Cortados (p/ enviar)","4","#3b82f6"),("Mesas ativas","2 / 3","#6366f1")]
    x=258
    for l,n,c in kpis:
        b+=rect(x,170,230,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,182,4,32,c,rx=2)+text(x+20,206,n,22,"#0f172a",weight="bold")+text(x+20,223,l,11.5,"#64748b")
        x+=244
    cols=[
     ("Aguardando Corte","Parte 1 + 2 unidas","amber",[
        ("u12","1042","Loja K","Blusa · BT12","300","Aguardando","amber","start","14/06","22/06",True,True,"P1+P2 = 1 card"),
        ("u12","1033","Loja G","Colete · CV03","120","Aguardando","amber","start","18/06","26/06",True,False,""),
        ("uni","1010","Cliente B","Suéter · SU11","120","Aguardando","amber","start","13/06","25/06",False,False,"")]),
     ("Aguardando Corte","Kits / Estoque","amber",[
        ("kit","1031","Malharia F","Cachecol · CC07","60","Aguardando","amber","start","16/06","23/06",False,False,""),
        ("est","2001","Produção p/ Estoque","Touca · TC01","200","Aguardando","amber","start","—","—",False,False,"repõe estoque")]),
     ("Cortando","Em corte","emerald",[
        ("u12","1015","Loja W","Cardigã · CG04","200","Cortando","emerald","stop","15/06","27/06",True,False,"Mesa 1 · José"),
        ("kit","1009","Loja V","Touca · TC01","90","Cortando","emerald","stop","12/06","21/06",False,False,"Mesa 2 · Ana")]),
     ("Kits/Estoque Cortados","Aguardando envio","blue",[
        ("kit","0995","Cliente B","Cachecol · CC07","120","Cortado","blue","send","15/06","25/06",False,False,""),
        ("est","1990","Produção p/ Estoque","Luva · LV02","150","Cortado","blue","send","—","—",False,False,"")]),
     ("Pedidos Cortados","Aguardando envio","blue",[
        ("u12","0990","Atacado D","Cardigã · CG04","90","Cortado","blue","send","11/06","24/06",True,True,""),
        ("uni","0988","Loja E","Blusa · BT12","60","Cortado","blue","send","12/06","23/06",False,False,"")]),
    ]
    x0=258; cw=375; gap=16; ytop=250
    for ci,(title,sub,key,cards) in enumerate(cols):
        x=x0+ci*(cw+gap); bgt,dot,fg=TINT[key]; colh=H-ytop-30
        b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
        b+=rect(x,ytop,cw,52,bgt,rx=16)+rect(x,ytop+36,cw,16,bgt)
        b+=circle(x+20,ytop+26,5,dot)+text(x+34,ytop+24,title,12.5,fg,weight="bold")+text(x+34,ytop+40,sub,10.5,fg)
        b+=rect(x+cw-40,ytop+15,26,22,"#ffffffcc",rx=11)+text(x+cw-27,ytop+30,str(len(cards)),12,fg,weight="bold",anchor="middle")
        cy=ytop+64
        for c in cards:
            b+=card(x+12,cy,cw-24,*c); cy+=212
    b+=text(258,H-12,"Os cards 'Cortados' têm a ação Enviar p/ Costureira → escolhe a costureira e gera o romaneio automaticamente.",11.5,"#94a3b8")
    return svg(W,H,b)

def modal():
    W,H=1180,860
    b=rect(0,0,W,60,"url(#g_brand)")+text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")+text(W-28,38,"José Corte",13,"#fff",anchor="end")
    b+=rect(0,60,W,H-60,"#eceef3")
    mw,mh=640,640; mx=(W-mw)/2; my=110
    b+=rect(mx,my,mw,mh,"#ffffff",rx=22,filt="modalShadow")
    b+=rect(mx,my,mw,92,"url(#g_brand)",rx=22)+rect(mx,my+60,mw,32,"url(#g_brand)")
    b+=text(mx+28,my+40,"Enviar para Costureira",19,"#fff",weight="bold")
    b+=rect(mx+28,my+54,90,24,"#ffffff2e",rx=8)+text(mx+28+45,my+71,"OP-0990",12,"#fff",weight="bold",anchor="middle")
    b+=rect(mx+126,my+54,150,24,"#ffffff2e",rx=8)+text(mx+126+75,my+71,"🔗 P1+P2 · 90 pç",11,"#fff",weight="bold",anchor="middle")
    b+=circle(mx+mw-44,my+37,15,"#ffffff2e")+text(mx+mw-44,my+42,"✕",15,"#fff",anchor="middle")
    ix=mx+28; iw=mw-56
    def lbl(x,y,t): return text(x,y,t,9.5,"#94a3b8",weight="bold",ls="0.6")
    # costureira
    yy=my+120
    b+=lbl(ix,yy,"COSTUREIRA")
    b+=rect(ix,yy+8,iw,58,"#f8fafc",rx=12,stroke="#c4b5fd",sw=2)
    b+=avatar(ix+30,yy+37,18,"MS","#6366f1")
    b+=text(ix+60,yy+32,"Maria Silva",14,"#0f172a",weight="bold")+text(ix+60,yy+50,"Facção 3 · capacidade 400 pç/sem · 2 pedidos em aberto",11,"#64748b")
    b+=text(ix+iw-18,yy+40,"▾",16,"#6b7280",anchor="end")
    # motorista + retorno
    yy2=yy+88; half=(iw-16)/2
    b+=lbl(ix,yy2,"MOTORISTA")+rect(ix,yy2+8,half,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+14,yy2+35,"Carlos  ▾",13,"#0f172a",weight="bold")
    b+=lbl(ix+half+16,yy2,"PREVISÃO DE RETORNO")+rect(ix+half+16,yy2+8,half,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+half+16+14,yy2+35,"21/06/2026  📅",13,"#0f172a",weight="bold")
    # itens
    yy3=yy2+76
    b+=lbl(ix,yy3,"ITENS A ENVIAR")
    b+=rect(ix,yy3+12,iw,118,"#ffffff",rx=12,stroke="#eef0f4")
    b+=text(ix+16,yy3+36,"PRODUTO",9.5,"#94a3b8",weight="bold")+text(ix+iw-90,yy3+36,"QTD",9.5,"#94a3b8",weight="bold")
    b+=rect(ix+12,yy3+44,iw-24,1,"#eef0f4")
    its=[("Cardigã · CG04 · Parte 1","45"),("Cardigã · CG04 · Parte 2","45")]
    ry=yy3+44
    for p,q in its:
        b+=text(ix+16,ry+26,p,12.5,"#0f172a",weight="bold")+text(ix+iw-70,ry+26,q,12.5,"#0f172a",weight="bold")
        b+=rect(ix+12,ry+38,iw-24,1,"#f3f4f8"); ry+=38
    b+=text(ix+16,ry+26,"Total",11.5,"#64748b")+text(ix+iw-70,ry+26,"90 pç",12.5,"#4338ca",weight="bold")
    # info romaneio
    yy4=yy3+150
    b+=rect(ix,yy4,iw,44,"#eff6ff",rx=10,stroke="#bfdbfe")
    b+=text(ix+16,yy4+27,"📋  Será gerado o romaneio R-221 automaticamente, com rastreio e histórico.",11.5,"#1d4ed8",weight="bold")
    # footer
    fy=my+mh-64
    b+=rect(mx,fy-12,mw,76,"#fafbfc",rx=22)+rect(mx,fy-12,mw,30,"#fafbfc")
    b+=rect(ix,fy,130,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+65,fy+28,"Cancelar",13,"#475569",weight="bold",anchor="middle")
    b+=rect(mx+mw-28-300,fy,300,44,"url(#g_brand)",rx=10)+text(mx+mw-28-150,fy+28,"🔒 Gerar Romaneio e Enviar",12.5,"#fff",weight="bold",anchor="middle")
    return svg(W,H,b)

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"30-setor-corte.svg"),"w").write(board())
subprocess.run(["rsvg-convert","-z","1.1",os.path.join(OUT_SVG,"30-setor-corte.svg"),"-o",os.path.join(OUT_PNG,"30-setor-corte.png")],check=True)
open(os.path.join(OUT_SVG,"31-enviar-costureira.svg"),"w").write(modal())
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"31-enviar-costureira.svg"),"-o",os.path.join(OUT_PNG,"31-enviar-costureira.png")],check=True)
print("OK corte + modal")
