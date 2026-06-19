# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'
def text(x,y,s,size=13,fill="#1f2430",weight="normal",anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{esc(s)}</text>'
def svg(w,h,body,bg="#f4f4f7"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Segoe UI, Arial, sans-serif">'+rect(0,0,w,h,bg)+body+'</svg>')
PILL={"green":("#dcfce7","#15803d"),"amber":("#fef3c7","#b45309"),"red":("#fee2e2","#b91c1c"),"blue":("#dbeafe","#1d4ed8"),"purple":("#f3effe","#5b21b6"),"gray":("#eef0f4","#64748b")}
def pill(x,y,label,key,fs=10,h=18):
    bg,fg=PILL[key]; w=12+len(label)*5.6
    return rect(x,y,w,h,bg,rx=h/2)+text(x+6,y+h/2+3.5,label,fs,fg)
def topbar(W,user):
    b=rect(0,0,W,54,"#4c1d95")+text(20,33,"🧶 BIG TRICOT",17,"#fff",weight="bold")
    b+=rect(176,16,128,22,"#ffffff22",rx=11)+text(188,31,"Rolagem de Fase",12,"#fff")
    b+=text(W-24,33,user,13,"#fff",anchor="end")
    return b
def sidebar(active_label,items):
    b=rect(0,54,220,1000,"#1b1530")+text(20,90,"🧶 Big Tricot",14,"#fff",weight="bold")
    b+=text(20,116,"MEU SETOR",10,"#7c6fb0",weight="bold")
    y=146
    for m in items:
        if m==active_label: b+=rect(0,y-22,220,34,"#8b5cf633")+rect(0,y-22,3,34,"#8b5cf6")+text(20,y,m,13,"#fff")
        else: b+=text(20,y,m,13,"#cfc8e6")
        y+=34
    return b

# =================== PASSADORIA BOARD (7 colunas) ===================
def passadoria():
    W,H=2090,860
    b=topbar(W,"Carla · Operador Passadoria ▾")
    b+=sidebar("🔥 Passadoria",["🔥 Passadoria","📥 Fila","✅ Finalizados","👥 Passadeiras","📈 Meu desempenho"])
    b+=text(244,92,"Setor: Passadoria",20,"#1f2430",weight="bold")
    b+=text(244,116,"Parte 1 e Parte 2 continuam SEPARADAS na Passadoria. Clique num card para ver os detalhes.",12,"#7a8194")
    cnt=[("Aguard. Kits","2","#f59e0b","#fffbeb"),("Aguard. Parte 1","2","#f59e0b","#fffbeb"),
         ("Aguard. Parte 2","2","#ea7c0b","#fff7ed"),("Passando","3","#16a34a","#f0fdf4"),
         ("Finalizados","4","#2563eb","#eff6ff"),("Passadeiras","3 / 4","#6d28d9","#f3effe")]
    x=244
    for l,n,c,bg in cnt:
        b+=rect(x,132,260,66,bg,rx=12,stroke="#e6e6ee")
        b+=text(x+14,166,n,22,c,weight="bold")+text(x+14,186,l,11.5,"#64748b")
        x+=274
    cols=[
     ("Aguardando · Kits","Fila de kits","#f59e0b",[("KIT #1031","Malharia F","80 pç","amber","start"),("KIT #1027","Loja M","150 pç","amber","start")],2),
     ("Aguardando · Parte 1","Vindas da Tecelagem","#f59e0b",[("OP #1042","Loja K","150 pç","amber","start"),("OP #1050","Loja T","80 pç","amber","start")],2),
     ("Aguardando · Parte 2","Vindas da Tecelagem","#ea7c0b",[("OP #1042","Loja K","150 pç","amber","start"),("OP #1033","Loja G","60 pç","amber","start")],2),
     ("Passando","Em execução","#16a34a",[("OP #1010 · P1","Cliente B","Maria · ⏱ 1h","green","stop"),("KIT #1009","Loja V","Rita · ⏱ 30m","green","stop"),("OP #1015 · P2","Loja W","Ana · ⏱ 2h","green","stop")],3),
     ("Finalizados · Kits","Prontos p/ Corte","#2563eb",[("KIT #0995","Cliente B","120 pç","blue","send"),("KIT #0996","Loja N","60 pç","blue","send")],2),
     ("Finalizados · Parte 1","Prontas p/ Corte","#2563eb",[("OP #1002 · P1","Loja A","60 pç","blue","send")],1),
     ("Finalizados · Parte 2","Prontas p/ Corte","#1d4ed8",[("OP #1002 · P2","Loja A","60 pç","blue","send")],1),
    ]
    x0=244; cw=248; gap=12; ytop=314
    for ci,(name,sub,hc,cards,total) in enumerate(cols):
        x=x0+ci*(cw+gap)
        b+=rect(x,ytop,cw,H-ytop-30,"#eceaf3",rx=12)
        b+=rect(x,ytop,cw,48,hc,rx=12)+rect(x,ytop+36,cw,12,hc)
        b+=text(x+12,ytop+24,name,12.5,"#fff",weight="bold")
        b+=text(x+12,ytop+40,sub,9.5,"#ffffffcc")
        b+=rect(x+cw-40,ytop+15,30,18,"#ffffff33",rx=9)+text(x+cw-25,ytop+28,str(total),12,"#fff",weight="bold",anchor="middle")
        cy=ytop+64
        for num,cli,extra,stripe,act in cards:
            ch=80
            b+=rect(x+12,cy,cw-24,ch,"#fff",rx=10,stroke="#e3e0ee")
            scol={"green":"#22c55e","amber":"#f59e0b","red":"#ef4444","blue":"#3b82f6"}[stripe]
            b+=rect(x+12,cy,4,ch,scol,rx=2)
            b+=text(x+24,cy+22,num,12.5,"#1f2430",weight="bold")
            b+=text(x+24,cy+40,cli,11,"#7a8194")
            b+=text(x+24,cy+58,extra,10,"#55556a")
            lbl={"start":("▶ Passar","#16a34a"),"stop":("✓ Finalizar","#2563eb"),"send":("🔒 Enviar ▶","#6d28d9")}[act]
            b+=rect(x+cw-92,cy+50,76,24,lbl[1],rx=7)+text(x+cw-54,cy+66,lbl[0],10,"#fff",weight="bold",anchor="middle")
            cy+=ch+10
    b+=text(244,H-10,"Clique num card → abre o pop-up com Data do pedido (lançamento), Data de entrega e histórico.",11,"#8a8aa0")
    p=os.path.join(OUT_SVG,"22-setor-passadoria.svg"); open(p,"w").write(svg(W,H,b))
    subprocess.run(["rsvg-convert","-z","1.2",p,"-o",os.path.join(OUT_PNG,"22-setor-passadoria.png")],check=True)
    print("OK passadoria")

# =================== CARD POPUP (detalhe do pedido) ===================
def popup():
    W,H=1120,760
    b=topbar(W,"Carla · Operador Passadoria ▾")
    b+=rect(0,54,W,H-54,"#e9e7f0")
    # board esmaecido ao fundo (faixas)
    for i in range(6):
        b+=rect(60+i*175,110,160,560,"#ffffff",rx=12)
    b+=rect(0,54,W,H-54,"#1b153099")  # overlay escuro
    # modal
    mx,my,mw,mh=300,120,520,540
    b+=rect(mx,my,mw,mh,"#ffffff",rx=16)
    b+=rect(mx,my,mw,56,"#4c1d95",rx=16)+rect(mx,my+40,mw,16,"#4c1d95")
    b+=text(mx+22,my+35,"Pedido #1042",18,"#fff",weight="bold")
    b+=rect(mx+170,my+18,72,22,"#ffffff33",rx=11)+text(mx+206,my+33,"Parte 1",12,"#fff",anchor="middle")
    b+=text(mx+mw-22,my+35,"✕",18,"#fff",anchor="end")
    b+=text(mx+22,my+82,"Cliente: Loja K",13.5,"#1f2430")
    b+=pill(mx+mw-150,my+70,"Passadoria · Passando","green")
    # DATAS (destaque)
    b+=rect(mx+22,my+100,228,72,"#f3effe",rx=12,stroke="#c4b5fd")
    b+=text(mx+38,my+124,"📅 Data do pedido (lançado)",11,"#5b21b6")
    b+=text(mx+38,my+152,"14/06/2026",20,"#3b0764",weight="bold")
    b+=text(mx+38,my+168,"origem: tela Criar Pedido",9,"#7c6fb0")
    b+=rect(mx+270,my+100,228,72,"#fef2f2",rx=12,stroke="#fecaca")
    b+=text(mx+286,my+124,"🚚 Data de entrega",11,"#b91c1c")
    b+=text(mx+286,my+152,"22/06/2026",20,"#b91c1c",weight="bold")
    b+=text(mx+286,my+168,"faltam 3 dias",9,"#dc2626")
    # detalhes
    dy=my+196
    rows=[("Tipo","Parte 1 + Parte 2"),("Produto","Blusa Tricô · BT12 · 150 pç"),
          ("Origem","Tecelagem · Máquina 3"),("Responsável","—"),("Romaneio","—")]
    for k,v in rows:
        b+=text(mx+22,dy+16,k,12,"#7a8194")
        b+=text(mx+150,dy+16,v,12.5,"#1f2430",weight="bold")
        b+=rect(mx+22,dy+26,mw-44,1,"#f0f0f5")
        dy+=34
    # mini histórico
    b+=text(mx+22,dy+18,"Histórico",12.5,"#1f2430",weight="bold")
    dy+=26
    for s in ["✅ Criação · 14/06 09:12","✅ Tecelagem · 18/06 → 19/06 (Máq 3)","🟡 Passadoria · desde 19/06 08:10"]:
        b+=text(mx+30,dy+14,s,11,"#55556a"); dy+=22
    # botões
    by=my+mh-52
    b+=rect(mx+22,by,120,38,"#fff",rx=9,stroke="#cbd5e1")+text(mx+82,by+25,"Fechar",13,"#475569",anchor="middle")
    b+=rect(mx+250,by,118,38,"#2563eb",rx=9)+text(mx+309,by+25,"✓ Finalizar",12.5,"#fff",weight="bold",anchor="middle")
    b+=rect(mx+380,by,118,38,"#6d28d9",rx=9)+text(mx+439,by+25,"🔒 Enviar ▶",12,"#fff",weight="bold",anchor="middle")
    p=os.path.join(OUT_SVG,"23-card-popup.svg"); open(p,"w").write(svg(W,H,b))
    subprocess.run(["rsvg-convert","-z","1.5",p,"-o",os.path.join(OUT_PNG,"23-card-popup.png")],check=True)
    print("OK popup")

os.makedirs(OUT_SVG,exist_ok=True)
passadoria(); popup()
