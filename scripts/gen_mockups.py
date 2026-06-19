# -*- coding: utf-8 -*-
import os, subprocess

OUT_SVG = "docs/prototipo/svg"
OUT_PNG = "docs/prototipo"
os.makedirs(OUT_SVG, exist_ok=True)

# ---------- helpers ----------
def esc(s):
    return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'

def text(x,y,s,size=13,fill="#1f2430",weight="normal",anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{esc(s)}</text>'

def line(x1,y1,x2,y2,stroke="#e6e6ee",sw=1):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"/>'

def pill(x,y,label,bg,fg,w=None,h=20,fs=11):
    if w is None: w=14+len(label)*6.4
    return rect(x,y,w,h,bg,rx=h/2)+text(x+9,y+h/2+4,"● "+label,fs,fg)

PILL={"green":("#dcfce7","#15803d"),"amber":("#fef3c7","#b45309"),
      "red":("#fee2e2","#b91c1c"),"blue":("#dbeafe","#1d4ed8"),"gray":("#eef0f4","#64748b"),
      "purple":("#f3effe","#5b21b6")}

def svg(w,h,body,bg="#f4f4f7"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}" font-family="Segoe UI, Arial, sans-serif">'
            +rect(0,0,w,h,bg)+body+'</svg>')

MENU=["📊 Início","📦 Pedidos","🏭 Ordens de Produção","📋 Romaneios","🧵 Costureiras",
      "🗃️ Almoxarifado","🚚 Motoristas","📈 Relatórios","⚙️ Configurações"]

def topbar(w,user="João (Supervisor) ▾",dark=False):
    b=rect(0,0,w,54,"#3b0764" if dark else "#4c1d95")
    b+=text(20,33,"🧶 BIG TRICOT",17,"#fff",weight="bold")
    b+=rect(176,16,128,22,"#ffffff22",rx=11)+text(188,31,"Rolagem de Fase",12,"#fff")
    b+=text(w-24,33,user,13,"#fff",anchor="end")
    return b

def sidebar(active=0,dark=False):
    bg="#0d0d14" if dark else "#1b1530"
    s=rect(0,54,220,800,bg)
    s+=text(20,90,"🧶 Big Tricot",14,"#fff",weight="bold")
    y=120
    for i,m in enumerate(MENU):
        if i==active:
            s+=rect(0,y-22,220,34,"#8b5cf633")+rect(0,y-22,3,34,"#8b5cf6")
            s+=text(20,y,m,13,"#fff")
        else:
            s+=text(20,y,m,13,"#cfc8e6")
        y+=34
    return s

def shell(title,active,content,w=1200,h=780,btn=None,dark_main=False):
    body=topbar(w)+sidebar(active)
    if dark_main: body+=rect(220,54,w-220,h-54,"#0d0d14")
    body+=text(244,92,title,20,"#e8e8f0" if dark_main else "#1f2430",weight="bold")
    if btn:
        bw=20+len(btn)*8
        body+=rect(w-24-bw,68,bw,34,"#6d28d9",rx=9)+text(w-24-bw/2,90,btn,13,"#fff",weight="bold",anchor="middle")
    body+=content
    return svg(w,h,body,bg="#0d0d14" if dark_main else "#f4f4f7")

def save(name,s):
    p=os.path.join(OUT_SVG,name+".svg")
    open(p,"w").write(s)
    subprocess.run(["rsvg-convert","-z","1.6",p,"-o",os.path.join(OUT_PNG,name+".png")],check=True)
    print("OK",name)

# ============================================================ 01 LOGIN
def s_login():
    w,h=900,620
    b=topbar(w)
    cx=w/2
    b+=rect(cx-200,120,400,360,"#fff",rx=16,stroke="#e6e6ee")
    b+=text(cx,180,"🧶 BIG TRICOT",24,"#3b0764",weight="bold",anchor="middle")
    b+=text(cx,206,"Rolagem de Fase",13,"#7a8194",anchor="middle")
    b+=text(cx-168,250,"Usuário",12,"#7a8194")
    b+=rect(cx-168,260,336,40,"#fff",rx=9,stroke="#e6e6ee")
    b+=text(cx-156,285,"seu.usuario",13,"#94a3b8")
    b+=text(cx-168,330,"Senha",12,"#7a8194")
    b+=rect(cx-168,340,336,40,"#fff",rx=9,stroke="#e6e6ee")
    b+=text(cx-156,365,"••••••••",13,"#94a3b8")
    b+=rect(cx-168,400,336,44,"#6d28d9",rx=9)+text(cx,428,"Entrar",15,"#fff",weight="bold",anchor="middle")
    b+=text(cx,468,"Esqueci minha senha · Suporte",12,"#7a8194",anchor="middle")
    save("01-login",svg(w,h,b))

# ============================================================ 02 DASHBOARD (DARK)
def s_dashboard():
    w,h=1200,820
    DARK_BG="#0d0d14"; CARD="#16161f"; BORDER="#262633"; TXT="#e8e8f0"; MUT="#8b8ba0"
    b=topbar(w,dark=True)+sidebar(0,dark=True)+rect(220,54,w-220,h-54,DARK_BG)
    b+=text(244,94,"Painel de Produção",20,TXT,weight="bold")
    b+=text(w-24,94,"19/06/2026 · 11:20",13,MUT,anchor="end")
    # KPI strip
    kpis=[("142","Pedidos ativos","#8b5cf6"),("6","Entregas hoje","#22c55e"),
          ("2,3 d","Lead time médio","#3b82f6"),("85%","No prazo (OTIF)","#22c55e")]
    x=244
    for n,l,c in kpis:
        b+=rect(x,112,212,66,CARD,rx=12,stroke=BORDER)
        b+=text(x+16,150,n,24,c,weight="bold")
        b+=text(x+16,168,l,12,MUT)
        x+=224
    # alert
    b+=rect(244,190,932,36,"#2a1d0a",rx=10,stroke="#5a3d12")
    b+=text(260,213,"⚠️  4 OPs paradas +48h     🔴 2 pedidos atrasados     🗃️ 3 materiais abaixo do mínimo",13,"#fbbf24")
    # phase cards grid 4x2
    phases=[
        ("Tecelagem",[("Aguardando",5,"#f59e0b"),("Tecendo",4,"#22c55e"),("Finalizados",3,"#8b8ba0")]),
        ("Passadoria",[("Aguardando",2,"#f59e0b"),("Passando",1,"#22c55e"),("Finalizados",2,"#8b8ba0")]),
        ("Corte",[("Aguardando",3,"#f59e0b"),("Cortando",2,"#22c55e"),("Finalizados",3,"#8b8ba0")]),
        ("Costura",[("Aguardando",6,"#f59e0b"),("Costurando",12,"#22c55e"),("Finalizados",4,"#8b8ba0")]),
        ("Revisão",[("Aguardando",1,"#f59e0b"),("Revisando",1,"#22c55e"),("Finalizados",1,"#8b8ba0")]),
        ("Expedição",[("Aguardando",2,"#f59e0b"),("Expedindo",1,"#22c55e"),("Finalizados",5,"#8b8ba0")]),
        ("Fiscal",[("Aguardando",1,"#f59e0b"),("Emitindo NF",1,"#22c55e"),("Finalizados",4,"#8b8ba0")]),
        ("Transporte",[("Aguardando",2,"#f59e0b"),("Em rota",3,"#22c55e"),("Entregues",8,"#22c55e")]),
    ]
    cw,ch,gx,gy=221,150,16,16
    x0,y0=244,242
    for i,(name,subs) in enumerate(phases):
        col=i%4; row=i//4
        x=x0+col*(cw+gx); y=y0+row*(ch+gy)
        b+=rect(x,y,cw,ch,CARD,rx=12,stroke=BORDER)
        b+=rect(x,y,cw,34,"#1e1e2b",rx=12)
        b+=rect(x,y+22,cw,12,"#1e1e2b")
        b+=text(x+14,y+22,name,14,TXT,weight="bold")
        total=sum(v for _,v,_ in subs)
        b+=text(x+cw-14,y+22,f"{total} OPs",11,MUT,anchor="end")
        yy=y+58
        for lbl,val,c in subs:
            b+=f'<circle cx="{x+20}" cy="{yy-4}" r="4" fill="{c}"/>'
            b+=text(x+34,yy,lbl,12.5,"#c8c8d8")
            b+=text(x+cw-14,yy,str(val),15,c,weight="bold",anchor="end")
            yy+=30
    b+=text(244,h-24,"Atualização em tempo real · clique numa fase para ver os pedidos",11,"#55556a")
    save("02-dashboard",svg(w,h,b,bg=DARK_BG))

# ============================================================ generic table
def table(x,y,w,cols,rows,rh=34):
    """cols=[(title,width)], rows=[[cell,...]] cell=str or ('pill',key,label)"""
    s=""
    cx=x+18
    for title,cwid in cols:
        s+=text(cx,y+24,title,11,"#7a8194",weight="bold")
        cx+=cwid
    s+=line(x+16,y+34,x+w-16,y+34)
    ry=y+34
    for r in rows:
        cx=x+18
        for (title,cwid),cell in zip(cols,r):
            if isinstance(cell,tuple) and cell[0]=="pill":
                bg,fg=PILL[cell[1]]
                s+=pill(cx,ry+rh/2-10,cell[2],bg,fg)
            else:
                s+=text(cx,ry+rh/2+5,cell,13,"#1f2430")
            cx+=cwid
        s+=line(x+16,ry+rh,x+w-16,ry+rh,"#f0f0f5")
        ry+=rh
    return s

# ============================================================ 03 TODOS OS PEDIDOS
def s_pedidos():
    w=1200
    cont=""
    fx=244
    for f in ["Cliente ▾","Fase ▾","Setor ▾","Status ▾","Tipo ▾","Entrega __/__ → __/__"]:
        fw=24+len(f)*6.5
        cont+=rect(fx,116,fw,30,"#fff",rx=8,stroke="#e6e6ee")+text(fx+12,135,f,12,"#1f2430")
        fx+=fw+10
    cont+=rect(fx,116,80,30,"#fff",rx=8,stroke="#6d28d9")+text(fx+40,135,"Filtrar",12,"#6d28d9",weight="bold",anchor="middle")
    cont+=rect(244,160,932,480,"#fff",rx=12,stroke="#e6e6ee")
    cols=[("CLIENTE",120),("Nº PEDIDO",140),("ENTREGA",110),("FASE",110),("SETOR",100),("STATUS",130),("RESP.",90),("PARADO",90)]
    rows=[
        ["Loja A","#1001  ⟨G-046⟩","22/06 🔴","Costura","Facção 3",("pill","amber","Em execução"),"Maria","1d 4h"],
        ["Loja A","#1002  ⟨G-046⟩","22/06 🔴","Costura","Facção 3",("pill","amber","Em execução"),"Maria","1d 4h"],
        ["Cliente B","#1010","25/06","Tecelagem","Tear 2",("pill","green","Em execução"),"Pedro","3h 12m"],
        ["Loja C","#1020 ⟨P.Entrega⟩","20/06 🔴","Expedição","Exped.",("pill","amber","Aguardando"),"—","2d 1h"],
        ["Atacado D","#0998","28/06","Revisão","Qualidade",("pill","blue","Aguardando"),"Carla","40m"],
        ["Loja E","#0985","19/06","Transporte","Logística",("pill","green","Entregue"),"Carlos","—"],
        ["Malharia F","#1031","30/06","Corte","Corte 1",("pill","green","Em execução"),"José","1h"],
        ["Loja G","#1033 ⟨Parte 1⟩","26/06","Passadoria","Passad.",("pill","amber","Parado"),"Carla","6h"],
    ]
    cont+=table(244,170,932,cols,rows,rh=56)
    cont+=text(262,664,"142 pedidos",12,"#7a8194")
    cont+=text(820,664,"◀ 1 2 3 … ▶",12,"#7a8194")
    cont+=rect(1060,650,116,26,"#fff",rx=8,stroke="#6d28d9")+text(1118,668,"Exportar Excel",12,"#6d28d9",anchor="middle")
    save("03-todos-pedidos",shell("Todos os Pedidos",1,cont,btn="+ Importar PDF"))

# ============================================================ 04 IMPORTAR PDF
def s_importar():
    cont=""
    cont+=rect(244,120,700,200,"#fff",rx=14,stroke="#c7c2d8",sw=2)
    cont+=text(594,210,"📄  Arraste o PDF do ERP aqui",18,"#7a8194",anchor="middle")
    cont+=rect(514,236,160,40,"#6d28d9",rx=9)+text(594,262,"Selecionar arquivo",13,"#fff",weight="bold",anchor="middle")
    cont+=rect(244,340,700,160,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,372,"Arquivos enviados",14,"#1f2430",weight="bold")
    cont+=text(264,408,"pedido_1001.pdf",13,"#1f2430")+pill(700,396,"Enviado","#dcfce7","#15803d")
    cont+=text(264,444,"pedido_1002.pdf",13,"#1f2430")+pill(700,432,"Processando OCR…","#fef3c7","#b45309")
    cont+=text(264,480,"pedido_1003.pdf",13,"#1f2430")+pill(700,468,"Enviado","#dcfce7","#15803d")
    cont+=text(244,540,"Os PDFs originais ficam preservados no sistema.",12,"#7a8194")
    cont+=rect(784,520,160,40,"#6d28d9",rx=9)+text(864,546,"Processar",14,"#fff",weight="bold",anchor="middle")
    save("04-importar-pdf",shell("Importar Pedido (PDF do ERP)",1,cont))

# ============================================================ 05 CONFERENCIA
def s_conferencia():
    cont=""
    cont+=pill(980,74,"Confiança OCR: 92%","#dcfce7","#15803d",w=150)
    cont+=rect(244,116,440,520,"#fff",rx=12,stroke="#c7c2d8",sw=2)
    cont+=text(464,360,"Visualizador do",14,"#7a8194",anchor="middle")
    cont+=text(464,382,"PDF original do ERP",14,"#7a8194",anchor="middle")
    cont+=text(464,410,"(preservado)",12,"#94a3b8",anchor="middle")
    x=708
    def fld(y,lbl,val,ok=True):
        s=text(x,y,lbl,12,"#7a8194")
        s+=rect(x,y+8,468,38,"#f0fdf4" if ok else "#fffbeb",rx=8,stroke="#bbf7d0" if ok else "#fde68a")
        s+=text(x+12,y+32,val,13,"#1f2430")
        return s
    cont+=fld(140,"Cliente ✅","Loja A")
    cont+=fld(200,"Nº Pedido ✅","1001")
    cont+=fld(260,"Data de entrega ✅","22/06/2026")
    cont+=text(x,330,"Tipo de pedido",12,"#7a8194")
    cont+=rect(x,338,468,38,"#fff",rx=8,stroke="#e6e6ee")+text(x+12,362,"Único ▾",13,"#1f2430")
    cont+=rect(x,396,468,150,"#fff",rx=10,stroke="#e6e6ee")
    cont+=text(x+14,422,"Itens",13,"#1f2430",weight="bold")
    cont+=text(x+14,452,"Blusa Tricô · BT12",13,"#1f2430")+rect(x+330,438,60,24,"#fffbeb",rx=6,stroke="#fde68a")+text(x+345,455,"120",13,"#1f2430")+text(x+396,455,"🟡85%",11,"#b45309")
    cont+=text(x+14,490,"Cachecol · CC07",13,"#1f2430")+rect(x+330,476,60,24,"#fff",rx=6,stroke="#e6e6ee")+text(x+348,493,"60",13,"#1f2430")
    cont+=rect(x+250,560,100,40,"#fff",rx=9,stroke="#6d28d9")+text(x+300,586,"Cancelar",13,"#6d28d9",anchor="middle")
    cont+=rect(x+360,560,108,40,"#6d28d9",rx=9)+text(x+414,586,"🔒 Confirmar",13,"#fff",weight="bold",anchor="middle")
    save("05-conferencia",shell("Conferência — pedido_1001.pdf",1,cont))

# ============================================================ 06 AGRUPAR
def s_agrupar():
    cont=""
    cont+=rect(244,120,932,330,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,150,"Pedidos disponíveis (não agrupados)",14,"#1f2430",weight="bold")
    items=[("☑","#1001","Loja A","120 pç","22/06",True),
           ("☑","#1002","Loja A","60 pç","22/06",True),
           ("☑","#1003","Loja A","40 pç","23/06",True),
           ("☐","#1010","Cliente B","200 pç","25/06",False)]
    y=185
    for chk,num,cli,qt,ent,sel in items:
        if sel: cont+=rect(264,y-18,890,30,"#f7f5ff",rx=6)
        cont+=text(276,y,chk,16,"#6d28d9" if sel else "#94a3b8")
        cont+=text(304,y,num,13,"#1f2430",weight="bold")
        cont+=text(380,y,cli,13,"#1f2430")
        cont+=text(560,y,qt,13,"#1f2430")
        cont+=text(700,y,"entrega "+ent,13,"#7a8194")
        y+=42
    cont+=line(264,y-8,1154,y-8)
    cont+=text(264,y+22,"Selecionados: 3 pedidos · 220 peças · entrega mais próxima 22/06",13,"#1f2430")
    cont+=rect(244,470,932,90,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,500,"Código do agrupamento: G-046 (gerado automaticamente)",13,"#1f2430")
    cont+=text(264,528,"Observação:",12,"#7a8194")+rect(360,512,500,26,"#fff",rx=6,stroke="#e6e6ee")
    cont+=rect(884,508,130,40,"#fff",rx=9,stroke="#6d28d9")+text(949,534,"Cancelar",13,"#6d28d9",anchor="middle")
    cont+=rect(1024,508,150,40,"#6d28d9",rx=9)+text(1099,534,"🔒 Agrupar",13,"#fff",weight="bold",anchor="middle")
    cont+=text(244,590,"Vínculo com #1001, #1002, #1003 é mantido · desmembra na Revisão",12,"#7a8194")
    save("06-agrupar",shell("Agrupar Pedidos",1,cont))

# ============================================================ 07 ROLAGEM
def s_rolagem():
    cont=""
    cont+=rect(370,72,250,22,"#f3effe",rx=8)+text(380,88,"Pedidos: #1001, #1002, #1003",12,"#5b21b6")
    cont+=pill(1020,72,"Em execução","#fef3c7","#b45309",w=150)
    cont+=rect(244,104,932,36,"#fff",rx=10,stroke="#e6e6ee")
    cont+=text(262,127,"Cliente: Loja A    ·    Tipo: Agrupamento    ·    Entrega: 22/06 🔴",13,"#1f2430")
    cont+=rect(244,156,560,580,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,186,"Linha do tempo (rastreabilidade)",14,"#1f2430",weight="bold")
    steps=[("Criação · Ana","18/06 09:12","done"),
           ("Tecelagem · Pedro","18/06 14:30 → 19/06 08:00 (17h30)","done"),
           ("Passadoria · Carla","19/06 08:10 → 10:00 (1h50)","done"),
           ("Corte · José","19/06 10:15 → 12:00 (1h45)","done"),
           ("Costura · Maria — Romaneio R-220","19/06 13:00 → … (parado 1d 4h)","now"),
           ("Revisão","aguardando","wait"),
           ("Expedição · Fiscal · Transporte","—","wait")]
    y=222
    for i,(t,sub,st) in enumerate(steps):
        c={"done":"#16a34a","now":"#d97706","wait":"#cbd5e1"}[st]
        cont+=f'<circle cx="280" cy="{y}" r="11" fill="{c}"/>'
        if st=="done": cont+=text(280,y+4,"✓",11,"#fff",anchor="middle")
        elif st=="now": cont+=text(280,y+4,"●",11,"#fff",anchor="middle")
        tc="#94a3b8" if st=="wait" else ("#b45309" if st=="now" else "#1f2430")
        cont+=text(304,y-2,t,13,tc,weight="bold")
        cont+=text(304,y+16,sub,11,"#7a8194")
        if i<len(steps)-1: cont+=line(280,y+11,280,y+39,"#cbd5e1")
        y+=50
    cont+=rect(820,156,356,150,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(840,186,"Documentos",14,"#1f2430",weight="bold")
    for j,d in enumerate(["📄 PDF original","📄 PDF padronizado","📄 PDF agrupado","📋 Romaneio R-220"]):
        cont+=text(840,216+j*26,d,13,"#1f2430")
    cont+=rect(820,322,356,250,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(840,352,"Rolar fase",14,"#1f2430",weight="bold")
    cont+=text(840,382,"Próxima fase",11,"#7a8194")+rect(840,390,316,34,"#f7f5ff",rx=8,stroke="#e6e6ee")+text(854,412,"Revisão ▶",13,"#1f2430")
    cont+=text(840,448,"Setor",11,"#7a8194")+rect(840,456,316,34,"#fff",rx=8,stroke="#e6e6ee")+text(854,478,"Qualidade",13,"#1f2430")
    cont+=rect(840,510,316,44,"#6d28d9",rx=9)+text(998,538,"🔒 Rolar Fase",14,"#fff",weight="bold",anchor="middle")
    save("07-rolagem-fase",shell("OP G-046",2,cont))

# ============================================================ 08 ENVIAR COSTURA
def s_enviar():
    cont=""
    cont+=rect(244,120,450,360,"#fff",rx=12,stroke="#e6e6ee")
    def f(y,lbl,val):
        return text(264,y,lbl,12,"#7a8194")+rect(264,y+8,410,38,"#fff",rx=8,stroke="#e6e6ee")+text(276,y+32,val,13,"#1f2430")
    cont+=f(150,"Costureira","Maria (Facção 3) · 2 em aberto   ▾")
    cont+=f(214,"Motorista","Carlos   ▾")
    cont+=f(278,"Previsão de retorno","21/06/2026")
    cont+=f(342,"Observação","")
    cont+=rect(714,120,462,360,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(734,150,"Itens a enviar",14,"#1f2430",weight="bold")
    cols=[("PRODUTO",170),("PEDIDO",110),("CORTADA",90),("ENVIAR",80)]
    rows=[["Blusa BT12","#1001","120","[120]"],["Cachecol CC07","#1002","60","[60]"]]
    cont+=table(714,162,462,cols,rows,rh=44)
    cont+=rect(714,520,200,44,"#fff",rx=9,stroke="#6d28d9")+text(814,547,"Cancelar",13,"#6d28d9",anchor="middle")
    cont+=rect(924,520,252,44,"#6d28d9",rx=9)+text(1050,547,"🔒 Gerar Romaneio",14,"#fff",weight="bold",anchor="middle")
    cont+=text(244,600,"→ Gera romaneio (PDF), cria a entrega no app do motorista, inicia rastreio e (futuro) avisa no WhatsApp.",12,"#7a8194")
    save("08-enviar-costura",shell("Enviar para Costura — OP G-046",1,cont))

# ============================================================ 09 ROMANEIOS
def s_romaneios():
    cont=""
    cont+=rect(244,160,932,460,"#fff",rx=12,stroke="#e6e6ee")
    cols=[("Nº",90),("TIPO",170),("OP/PEDIDO",120),("COSTUREIRA",130),("MOTORISTA",120),("STATUS",140)]
    rows=[
        ["R-220","Corte → Costura","G-046","Maria","Carlos",("pill","amber","Em trânsito")],
        ["R-219","Costura → Revisão","#0990","Joana","Carlos",("pill","green","Recebido")],
        ["R-218","Expedição","#0985","—","Transp. X",("pill","green","Entregue")],
        ["R-217","Corte → Costura","#1031","Rita","Rafael",("pill","blue","Emitido")],
        ["R-216","Costura → Revisão","#0988","Cláudia","Carlos",("pill","red","Divergente")],
    ]
    cont+=table(244,170,932,cols,rows,rh=52)
    cont+=text(244,650,"Clique num romaneio para ver itens enviados x recebidos, divergências, PDF e fotos.",12,"#7a8194")
    save("09-romaneios",shell("Romaneios",3,cont,btn="+ Novo Romaneio"))

# ============================================================ 10 COSTURA (board)
def s_costura():
    cont=""
    # sub-status cards
    subs=[("Aguardando início","6","#f59e0b","#fffbeb"),("Costurando agora","12","#16a34a","#f0fdf4"),("Aguardando retorno","5","#2563eb","#eff6ff"),("Finalizados (hoje)","4","#64748b","#f4f4f7")]
    x=244
    for l,n,c,bg in subs:
        cont+=rect(x,116,222,72,bg,rx=12,stroke="#e6e6ee")
        cont+=text(x+16,156,n,26,c,weight="bold")
        cont+=text(x+16,176,l,12,"#64748b")
        x+=228
    cont+=rect(244,204,932,420,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,234,"Costureiras e pedidos em produção",14,"#1f2430",weight="bold")
    cols=[("COSTUREIRA",190),("TIPO",110),("PEDIDOS",90),("PEÇAS",80),("PREV. RETORNO",130),("SITUAÇÃO",150)]
    rows=[
        ["Maria Silva","Facção 3","3","180","21/06",("pill","amber","No prazo")],
        ["Joana Souza","Facção 1","2","90","22/06",("pill","green","No prazo")],
        ["Cláudia Lima","Interna","1","40","20/06",("pill","red","Atrasada")],
        ["Rita Alves","Facção 5","4","260","24/06",("pill","green","No prazo")],
        ["Fernanda Dias","Facção 2","2","120","23/06",("pill","amber","Atenção")],
        ["Sônia Martins","Facção 4","1","55","25/06",("pill","green","No prazo")],
    ]
    cont+=table(244,250,932,cols,rows,rh=56)
    cont+=text(264,610,"Total em costura: 13 pedidos · 745 peças · 6 costureiras ativas",12,"#7a8194")
    save("10-costura",shell("Costura",4,cont))

# ============================================================ 11 REVISAO (board)
def s_revisao():
    cont=""
    subs=[("Aguardando revisão","3","#f59e0b","#fffbeb"),("Revisando agora","2","#16a34a","#f0fdf4"),("Aprovados","8","#2563eb","#eff6ff"),("Devolvidos (retrabalho)","1","#dc2626","#fef2f2")]
    x=244
    for l,n,c,bg in subs:
        cont+=rect(x,116,222,72,bg,rx=12,stroke="#e6e6ee")
        cont+=text(x+16,156,n,26,c,weight="bold")
        cont+=text(x+16,176,l,12,"#64748b")
        x+=228
    # revisores
    cont+=rect(244,204,300,180,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,234,"Revisores",14,"#1f2430",weight="bold")
    revs=[("Carla Nunes","2 revisando","amber"),("Marcos Reis","1 revisando","green"),("Paula Cruz","disponível","blue")]
    yy=270
    for nm,st,col in revs:
        bg,fg=PILL[col]
        cont+=text(264,yy,nm,13,"#1f2430")+pill(420,yy-14,st,bg,fg)
        yy+=40
    # queue
    cont+=rect(560,204,616,420,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(580,234,"Pedidos na Revisão",14,"#1f2430",weight="bold")
    cols=[("PEDIDO/OP",150),("CLIENTE",120),("REVISOR",120),("SITUAÇÃO",130)]
    rows=[
        ["#0998","Atacado D","Carla",("pill","green","Revisando")],
        ["G-045 (3 ped.)","Loja H","Carla",("pill","green","Revisando → desmembrar")],
        ["#1001 ⟨G-046⟩","Loja A","—",("pill","amber","Aguardando")],
        ["#0990","Cliente B","Marcos",("pill","green","Revisando")],
        ["#0988","Loja E","—",("pill","red","Devolvido")],
    ]
    cont+=table(560,250,616,cols,rows,rh=52)
    cont+=text(580,600,"OPs agrupadas são desmembradas aqui: cada pedido segue sozinho para Expedição.",11,"#7a8194")
    save("11-revisao",shell("Revisão",1,cont))

# ============================================================ 12 COSTUREIRA (abas)
def s_costureira():
    cont=""
    cont+=rect(370,72,140,24,"#f3effe",rx=8)+text(380,89,"Facção 3",12,"#5b21b6")
    cont+=pill(1010,72,"Ativa","#dcfce7","#15803d",w=80)
    tabs=["Cadastro","Histórico","Pedidos em Aberto","Romaneios","Pagamentos","Pendências"]
    x=244
    for i,tb in enumerate(tabs):
        tw=24+len(tb)*7.2
        cont+=rect(x,116,tw,34,"#6d28d9" if i==0 else "#fff",rx=8,stroke="#6d28d9")
        cont+=text(x+tw/2,138,tb,12.5,"#fff" if i==0 else "#6d28d9",weight="bold",anchor="middle")
        x+=tw+8
    cont+=rect(244,166,450,300,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,196,"Dados cadastrais",14,"#1f2430",weight="bold")
    def f(y,lbl,val):
        return text(264,y,lbl,12,"#7a8194")+rect(264,y+8,410,34,"#fff",rx=8,stroke="#e6e6ee")+text(276,y+30,val,13,"#1f2430")
    cont+=f(226,"Nome","Maria Silva")
    cont+=f(286,"WhatsApp","(47) 9 9999-0000")
    cont+=f(346,"Chave PIX","maria@email.com")
    cont+=f(406,"Capacidade declarada","400 peças/semana")
    cont+=rect(714,166,462,90,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(734,196,"Pedidos em aberto",14,"#1f2430",weight="bold")
    cont+=text(734,228,"R-220 · G-046 · 180 pç · prev 21/06",13,"#1f2430")+pill(1050,216,"Em trânsito","#fef3c7","#b45309")
    cont+=rect(714,272,462,90,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(734,302,"Pagamentos",14,"#1f2430",weight="bold")
    cont+=text(734,334,"Jun/2026 · R$ 1.240,00",13,"#1f2430")+pill(960,322,"Pendente","#fef3c7","#b45309")
    cont+=rect(1050,318,126,28,"#6d28d9",rx=8)+text(1113,337,"🔒 Pagar",12,"#fff",weight="bold",anchor="middle")
    cont+=rect(714,378,462,90,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(734,408,"Pendências",14,"#1f2430",weight="bold")
    cont+=text(734,440,"2 peças faltantes (R-210) · aberta 15/06",13,"#1f2430")+pill(1060,428,"Aberta","#fee2e2","#b91c1c")
    save("12-costureira",shell("Maria Silva",4,cont,btn="Editar"))

# ============================================================ 13 ALMOXARIFADO
def s_almox():
    cont=""
    for i,(lbl,col) in enumerate([("Entrada","#6d28d9"),("Saída","#6d28d9"),("🔒 Ajuste","#6d28d9")]):
        cont+=rect(900+i*0,0,0,0,"#fff")  # noop
    bx=860
    for lbl in ["Entrada","Saída","🔒 Ajuste"]:
        bw=20+len(lbl)*8
        cont+=rect(bx,68,bw,34,"#fff",rx=9,stroke="#6d28d9")+text(bx+bw/2,90,lbl,12.5,"#6d28d9",weight="bold",anchor="middle")
        bx+=bw+8
    cont+=rect(244,120,932,400,"#fff",rx=12,stroke="#e6e6ee")
    cols=[("MATERIAL",200),("CATEGORIA",160),("ESTOQUE",110),("MÍNIMO",110),("STATUS",160)]
    rows=[
        ["Fio Algodão","Matéria-prima","45 kg","50 kg",("pill","red","Abaixo do mínimo")],
        ["Linha Preta","Aviamento","320 un","100 un",("pill","green","OK")],
        ["Etiqueta BT","Embalagem","1.200 un","500 un",("pill","green","OK")],
        ["Botão Madrepérola","Aviamento","80 un","200 un",("pill","red","Abaixo do mínimo")],
        ["Fio Lã Merino","Matéria-prima","130 kg","60 kg",("pill","green","OK")],
        ["Zíper 20cm","Aviamento","210 un","150 un",("pill","amber","Atenção")],
    ]
    cont+=table(244,130,932,cols,rows,rh=58)
    cont+=text(244,560,"Toda entrada/saída/ajuste é registrada na auditoria. Materiais abaixo do mínimo geram alerta automático.",12,"#7a8194")
    save("13-almoxarifado",shell("Almoxarifado",5,cont))

# ============================================================ 14 RELATORIOS
def s_relatorios():
    cont=""
    cont+=rect(244,116,932,40,"#fff",rx=10,stroke="#e6e6ee")
    cont+=text(264,141,"Período: 01/06 → 19/06",13,"#1f2430")+rect(1056,122,100,28,"#6d28d9",rx=8)+text(1106,141,"Gerar",13,"#fff",weight="bold",anchor="middle")
    cont+=rect(244,172,560,250,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,202,"Lead time médio por fase (horas)",14,"#1f2430",weight="bold")
    bars=[("Tecel.",18,"#6d28d9"),("Passad.",2,"#8b5cf6"),("Corte",2,"#6d28d9"),("Costura",30,"#ef4444"),("Revisão",6,"#f59e0b"),("Exped.",3,"#8b5cf6")]
    bx=284
    for nm,v,c in bars:
        bh=v*5
        cont+=rect(bx,380-bh,56,bh,c,rx=4)+text(bx+28,398,nm,10,"#7a8194",anchor="middle")+text(bx+28,376-bh,str(v),11,"#1f2430",anchor="middle")
        bx+=84
    cont+=rect(820,172,356,250,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(840,202,"Indicadores",14,"#1f2430",weight="bold")
    for j,(k,v) in enumerate([("Gargalo principal","Costura 🔴"),("Entregas no prazo","85%"),("Pedidos atrasados","2"),("Produtividade","745 pç/dia")]):
        cont+=text(840,238+j*34,k,13,"#7a8194")+text(1156,238+j*34,v,13,"#1f2430",weight="bold",anchor="end")
    cont+=rect(244,440,932,80,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,470,"Produtividade por costureira",14,"#1f2430",weight="bold")
    cont+=text(264,500,"Rita 260 · Maria 180 · Fernanda 120 · Joana 90 · Sônia 55 · Cláudia 40 (peças)",13,"#1f2430")
    cont+=rect(244,540,160,40,"#fff",rx=9,stroke="#6d28d9")+text(324,566,"Exportar PDF",13,"#6d28d9",anchor="middle")
    cont+=rect(414,540,160,40,"#fff",rx=9,stroke="#6d28d9")+text(494,566,"Exportar Excel",13,"#6d28d9",anchor="middle")
    save("14-relatorios",shell("Relatórios",7,cont))

# ============================================================ 15 WHATSAPP
def s_whatsapp():
    cont=""
    cont+=pill(940,74,"Provedor: Meta Cloud API ▾","#dcfce7","#15803d",w=236)
    cont+=rect(244,120,932,70,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,150,"Modelos de mensagem",14,"#1f2430",weight="bold")
    bx=264
    for tpl in ["Romaneio emitido","Pagamento","Lembrete de retorno","Relatório semanal"]:
        tw=24+len(tpl)*7
        cont+=rect(bx,160,tw,26,"#f3effe",rx=8)+text(bx+tw/2,178,tpl,12,"#5b21b6",anchor="middle")
        bx+=tw+10
    cont+=rect(244,206,932,330,"#fff",rx=12,stroke="#e6e6ee")
    cont+=text(264,236,"Histórico de envios",14,"#1f2430",weight="bold")
    cols=[("DATA/HORA",150),("DESTINATÁRIO",150),("MENSAGEM",200),("ANEXO",90),("STATUS",150)]
    rows=[
        ["19/06 14:32","Maria","Romaneio R-220","📎 PDF",("pill","green","Entregue · Lida")],
        ["19/06 09:10","Joana","Pagamento Jun","📎 PDF",("pill","green","Entregue")],
        ["18/06 17:00","Carlos","Nova entrega","—",("pill","red","Falha · Reenviar")],
        ["18/06 08:00","Rita","Lembrete retorno","—",("pill","blue","Enviada")],
    ]
    cont+=table(244,216,932,cols,rows,rh=56)
    cont+=text(244,576,"Arquitetura preparada para trocar de provedor sem refazer o sistema.",12,"#7a8194")
    save("15-whatsapp",shell("Notificações (WhatsApp)",3,cont))

# ============================================================ 16 ADMIN
def s_admin():
    cont=""
    cont+=rect(244,120,932,360,"#fff",rx=12,stroke="#e6e6ee")
    cols=[("NOME",200),("LOGIN",160),("PAPÉIS",320),("STATUS",140)]
    rows=[
        ["João Souza","joao","Supervisor de Produção",("pill","green","Ativo")],
        ["Maria Lima","maria","Costura, Revisor",("pill","green","Ativo")],
        ["Carlos Reis","carlos","Motorista",("pill","green","Ativo")],
        ["Ana Paula","ana","Conferente de Pedidos",("pill","green","Ativo")],
        ["Pedro Alves","pedro","Operador Tecelagem",("pill","gray","Inativo")],
        ["Rita Dias","rita.fin","Financeiro (Costureiras)",("pill","green","Ativo")],
    ]
    cont+=table(244,130,932,cols,rows,rh=56)
    cont+=rect(244,500,250,40,"#fff",rx=9,stroke="#6d28d9")+text(369,526,"Gerenciar Papéis",13,"#6d28d9",anchor="middle")
    cont+=rect(504,500,250,40,"#fff",rx=9,stroke="#6d28d9")+text(629,526,"Trilha de Auditoria",13,"#6d28d9",anchor="middle")
    save("16-admin",shell("Usuários e Permissões",8,cont,btn="+ Novo usuário"))

# ============================================================ 17 ASSINATURA
def s_assinatura():
    w,h=900,560
    b=topbar(w)+rect(0,54,w,h-54,"#efeef5")
    cx=w/2
    b+=rect(cx-200,150,400,300,"#fff",rx=16,stroke="#e6e6ee")
    b+=text(cx-176,200,"🔒 Confirme sua identidade",17,"#1f2430",weight="bold")
    b+=text(cx-176,234,"Ação: Rolar OP G-046 para Revisão",13,"#7a8194")
    b+=text(cx-176,272,"Usuário (logado)",12,"#7a8194")
    b+=rect(cx-176,282,352,38,"#f4f4f7",rx=8,stroke="#e6e6ee")+text(cx-164,306,"João",13,"#94a3b8")
    b+=text(cx-176,344,"Senha / PIN",12,"#7a8194")
    b+=rect(cx-176,354,352,38,"#fff",rx=8,stroke="#6d28d9")+text(cx-164,378,"••••••",13,"#1f2430")
    b+=text(cx-176,414,"Será assinada e registrada (usuário, data, hora, ação).",11,"#7a8194")
    b+=rect(cx-176,422,170,40,"#fff",rx=9,stroke="#6d28d9")+text(cx-91,448,"Cancelar",13,"#6d28d9",anchor="middle")
    b+=rect(cx+6,422,170,40,"#6d28d9",rx=9)+text(cx+91,448,"Confirmar",13,"#fff",weight="bold",anchor="middle")
    save("17-assinatura",svg(w,h,b))

# ============================================================ 18 APP MOTORISTA
def s_motorista():
    w,h=820,700
    b=text(40,40,"App do Motorista (mobile)",18,"#1f2430",weight="bold")
    def phone(ox,oy,title,inner):
        s=rect(ox,oy,320,600,"#0b0b14",rx=34)
        s+=rect(ox+12,oy+12,296,576,"#f4f4f7",rx=24)
        s+=rect(ox+12,oy+12,296,56,"#3b0764",rx=24)+rect(ox+12,oy+44,296,24,"#3b0764")
        s+=text(ox+32,oy+46,title,15,"#fff",weight="bold")
        return s+inner
    # phone1
    in1=""
    cards=[("R-220 · Maria","Facção 3 · 180 peças · OP G-046","A caminho","amber"),
           ("R-221 · Joana","Facção 1 · 90 peças","Aguardando","blue"),
           ("R-218 · Cliente C","Entregue 19/06 10:20","Entregue","green")]
    yy=84
    for t,sub,st,col in cards:
        bg,fg=PILL[col]
        in1+=rect(60+28,70+yy-0,264,68,"#fff",rx=12,stroke="#e6e6ee")
        in1+=text(60+44,70+yy+28,t,14,"#1f2430",weight="bold")
        in1+=pill(60+200,70+yy+12,st,bg,fg)
        in1+=text(60+44,70+yy+50,sub,11,"#7a8194")
        yy+=84
    in1+=text(60+28,70+yy+10,"⬤ 2 ações pendentes de sincronização (offline)",10,"#7a8194")
    b+=phone(60,70,"🚚 Minhas Entregas",in1)
    # phone2
    ox=440
    in2=rect(ox+28,154,264,86,"#fff",rx=12,stroke="#e6e6ee")
    in2+=text(ox+44,180,"📍 Rua das Flores, 123",12,"#7a8194")
    in2+=text(ox+44,202,"Itens: Blusa 120 · Cachecol 60",12,"#7a8194")
    in2+=rect(ox+44,212,232,22,"#fff",rx=8,stroke="#6d28d9")+text(ox+160,227,"🗺️ Abrir no mapa",11,"#6d28d9",anchor="middle")
    in2+=rect(ox+28,252,264,60,"#fff",rx=12,stroke="#e6e6ee")
    in2+=text(ox+44,278,"Status: A caminho",13,"#1f2430",weight="bold")
    in2+=rect(ox+44,286,232,20,"#16a34a",rx=8)+text(ox+160,300,"✅ Confirmar Chegada",11,"#fff",weight="bold",anchor="middle")
    in2+=rect(ox+28,324,264,210,"#fff",rx=12,stroke="#e6e6ee")
    in2+=text(ox+44,350,"Fotos da entrega",12,"#7a8194")
    for k in range(3):
        in2+=rect(ox+44+k*64,360,56,56,"#e9e6f5",rx=10)+text(ox+44+k*64+28,394,"📷" if k<2 else "＋",20 if k<2 else 22,"#a99fce",anchor="middle")
    in2+=rect(ox+44,428,232,30,"#fff",rx=8,stroke="#e6e6ee")+text(ox+54,448,"Observação...",12,"#94a3b8")
    in2+=rect(ox+44,466,232,34,"#16a34a",rx=9)+text(ox+160,488,"✅ Confirmar Entrega",13,"#fff",weight="bold",anchor="middle")
    b+=phone(440,70,"← R-220 · Maria",in2)
    save("18-app-motorista",svg(w,h,b))

# build all
for fn in [s_login,s_dashboard,s_pedidos,s_importar,s_conferencia,s_agrupar,s_rolagem,
           s_enviar,s_romaneios,s_costura,s_revisao,s_costureira,s_almox,s_relatorios,
           s_whatsapp,s_admin,s_assinatura,s_motorista]:
    fn()
print("DONE")
