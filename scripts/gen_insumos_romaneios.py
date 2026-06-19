# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,dash=None,op=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if dash: s+=f' stroke-dasharray="{dash}"'
    if op is not None: s+=f' fill-opacity="{op}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def line(x1,y1,x2,y2,stroke,sw=1,dash=None):
    d=f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"{d}/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill,stroke=None,sw=2):
    s=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'
GRADS={"brand":("#4f46e5","#7c3aed"),"rom":("#b45309","#d97706"),"ins":("#0d9488","#0891b2")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '<filter id="ph" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="22" flood-color="#0f172a" flood-opacity="0.22"/></filter>'
 '<filter id="paper" x="-15%" y="-8%" width="130%" height="116%"><feDropShadow dx="0" dy="6" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.18"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill,fg="#fff"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.78,fg,weight="bold",anchor="middle")
def topbar(W,user,ini,acolor,active,nav):
    b=rect(0,0,W,60,"url(#g_brand)")
    b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
    b+=text(W-200,38,user,13,"#fff",anchor="end")+avatar(W-176,30,15,ini,acolor)
    b+=rect(0,60,230,1000,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
    y=150
    for ic,label in nav:
        if label==active: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,acolor,rx=2)+text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
        else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
        y+=44
    return b
def kpi(x,y,n,l,c,w=240):
    return rect(x,y,w,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,y+12,4,32,c,rx=2)+text(x+20,y+36,n,22,"#0f172a",weight="bold")+text(x+20,y+53,l,11.5,"#64748b")
def chip(x,y,label,bg,fg,fs=10,h=20):
    w=16+len(label)*5.9
    return rect(x,y,w,h,bg,rx=h/2)+text(x+8,y+h*0.69,label,fs,fg,weight="bold"),w

# ============================ 1) SEPARAÇÃO DE INSUMOS ============================
def insumos():
    W,H=1560,900
    nav=[("◧","Visão geral"),("📦","Pedidos"),("🧰","Separação de Insumos"),("📋","Romaneios"),("🗃️","Almoxarifado")]
    b=topbar(W,"Vera Insumos","VI","#2dd4bf","Separação de Insumos",nav)
    b+=text(258,96,"Separação de Insumos",24,"#0f172a",weight="bold")+text(258,118,"Pedidos  ›  Separação de Insumos",12,"#94a3b8")
    b+=text(258,150,"Insumos = embalagem, etiquetas, encartes, tags, tassel. Lista de todos os pedidos; ao separar, confirme no botão.",12,"#475569")
    x=258
    for n,l,c in [("8","A separar","#f59e0b"),("23","Separados hoje","#10b981"),("5","Insumos faltando","#ef4444"),("31","Pedidos no mês","#6366f1")]:
        b+=kpi(x,168,n,l,c,236); x+=248
    # tabs
    b+=rect(258,244,360,38,"#eef0f5",rx=10)
    b+=rect(262,248,150,30,"#ffffff",rx=8,filt="cardShadow")+text(337,268,"A separar (8)",12,"#0d9488",weight="bold",anchor="middle")
    b+=text(470,268,"Separados",12,"#6b7280",anchor="middle")+text(575,268,"Todos",12,"#6b7280",anchor="middle")
    # tabela
    tx,ty,tw=258,300,W-258-40
    b+=rect(tx,ty,tw,H-ty-30,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    heads=[("PEDIDO",tx+20),("CLIENTE",tx+150),("PRODUTO",tx+320),("INSUMOS NECESSÁRIOS",tx+560),("AÇÃO",tx+tw-150)]
    for t,hx in heads: b+=text(hx,ty+30,t,9.5,"#94a3b8",weight="bold",ls="0.4")
    b+=line(tx+16,ty+42,tx+tw-16,ty+42,"#eef0f4",1)
    INS=[("📦 Embalagem",),("🏷 Etiquetas",),("📄 Encartes",),("🔖 Tags",),("🎀 Tassel",)]
    rows=[
     ("PV-3050","Loja K","Blusa BT12 · 150",[1,1,1,0,0],"sep"),
     ("PV-3051","Cliente B","Cachecol CC07 · 60",[1,1,0,1,1],"sep"),
     ("OP-1042","Loja K","Kit Conforto · 45",[1,0,1,1,1],"falta"),
     ("OP-0990","Atacado D","Cardigã CG04 · 90",[1,1,1,1,0],"sep"),
     ("PV-3052","Loja N","Manta MT04 · 30",[1,1,0,0,1],"done"),
    ]
    ry=ty+54; rh=86
    for ped,cli,prod,ins,st in rows:
        if st=="done": b+=rect(tx+12,ry,tw-24,rh-12,"#f0fdf4",rx=10,stroke="#bbf7d0")
        elif st=="falta": b+=rect(tx+12,ry,tw-24,rh-12,"#fff7ed",rx=10,stroke="#fed7aa")
        else: b+=rect(tx+12,ry,tw-24,rh-12,"#ffffff",rx=10,stroke="#eef0f4")
        b+=text(tx+20,ry+34,ped,13.5,"#0f172a",weight="bold")
        b+=text(tx+150,ry+34,cli,12.5,"#334155")
        b+=text(tx+320,ry+34,prod,12.5,"#334155")
        # insumo chips
        cxp=tx+560
        for i,need in enumerate(ins):
            label=INS[i][0]
            if need:
                bg,fg=("#ecfdf5","#047857") if st!="falta" or i!=3 else ("#fef2f2","#dc2626")
                ck="✓ " if st in("done","sep") and not(st=="falta" and i==3) else ("✕ " if (st=="falta" and i==3) else "")
                c,w=chip(cxp,ry+18,ck+label,bg,fg)
                b+=c; cxp+=w+8
        if cxp>tx+560:
            pass
        # ação
        ax=tx+tw-150
        if st=="done":
            b+=text(ax,ry+34,"✓ Separado 10:32",11.5,"#047857",weight="bold")
            b+=text(ax,ry+52,"por Vera",10,"#94a3b8")
        elif st=="falta":
            b+=rect(ax,ry+18,130,32,"#ffffff",rx=8,stroke="#fca5a5")+text(ax+65,ry+39,"⚠ Falta Tags",11,"#dc2626",weight="bold",anchor="middle")
        else:
            b+=rect(ax,ry+18,140,34,"#10b981",rx=8)+text(ax+70,ry+40,"✓ Insumos separados",10.5,"#fff",weight="bold",anchor="middle")
        ry+=rh
    b+=text(258,H-12,"Marcar 'Insumos separados' registra quem separou e a hora. Se faltar algum insumo, o pedido fica sinalizado (não trava a produção).",11,"#94a3b8")
    return svg(W,H,b)

# ============================ 2) ROMANEIOS (lista + controle) ============================
def romaneios():
    W,H=1640,940
    nav=[("◧","Visão geral"),("📦","Pedidos"),("🧵","Costura"),("📋","Romaneios"),("💲","Financeiro")]
    b=topbar(W,"Bia Romaneios","BR","#f59e0b","Romaneios",nav)
    b+=text(258,96,"Romaneios",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Romaneios",12,"#94a3b8")
    b+=text(258,150,"Romaneio avulso ou por pedido. Gera PDF em 2 vias. Controle de saída/retorno e liberação de pagamento.",12,"#475569")
    b+=rect(258+1010,84,170,40,"#ffffff",rx=10,stroke="#cbd5e1")+text(258+1010+85,109,"＋ Avulso",13,"#334155",weight="bold",anchor="middle")
    b+=rect(258+1192,84,190,40,"url(#g_rom)",rx=10)+text(258+1192+95,109,"＋ Por pedido",13,"#fff",weight="bold",anchor="middle")
    x=258
    for n,l,c in [("12","Abertos","#3b82f6"),("34","Devolvidos no prazo","#10b981"),("R$ 4.820","A pagar","#6366f1"),("3","Vencidos (não voltaram)","#ef4444")]:
        b+=kpi(x,168,n,l,c,250); x+=262
    # tabela
    tx,ty,tw=258,300,W-258-40
    b+=rect(tx,ty,tw,H-ty-52,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    heads=[("Nº",tx+20),("TIPO",tx+90),("COSTUREIRA",tx+210),("PEDIDO",tx+360),("SAÍDA",tx+470),("RET. PREV.",tx+560),("RETORNO",tx+670),("SERVIÇOS / QTD",tx+780),("VALOR",tx+990),("STATUS",tx+1090),("PAGAMENTO",tx+1230)]
    for t,hx in heads: b+=text(hx,ty+30,t,9,"#94a3b8",weight="bold",ls="0.3")
    b+=line(tx+16,ty+42,tx+tw-16,ty+42,"#eef0f4",1)
    rows=[
     ("R-223","Costura","Cris","OP-1042","19/06","26/06","—","Pes/Mantas 15 · Alm 20","R$ 420","aberto","aguard"),
     ("R-222","Costura","Bene","OP-1015","17/06","24/06","23/06","Costurar 200","R$ 600","devolvido","liberado"),
     ("R-221","Costura","Angélica","OP-0990","16/06","23/06","22/06","Etiquetas 90","R$ 180","devolvido","liberado"),
     ("R-210","Costura","Cris","OP-0980","02/06","09/06","—","Costurar 45","R$ 135","vencido","bloqueado"),
     ("R-205","Avulso","Nice","—","01/06","08/06","—","Almofadas 60","R$ 300","vencido","bloqueado"),
     ("R-218","Costura","Silvia","OP-0995","15/06","22/06","21/06","Capas 120","R$ 240","devolvido","liberado"),
    ]
    STAT={"aberto":("Aberto","#eff6ff","#1d4ed8"),"devolvido":("Devolvido","#ecfdf5","#047857"),"vencido":("Vencido","#fef2f2","#dc2626")}
    PAG={"aguard":("Aguardando","#f1f5f9","#475569"),"liberado":("✓ Liberado","#ecfdf5","#047857"),"bloqueado":("✗ Bloqueado","#fef2f2","#dc2626")}
    ry=ty+52; rh=50
    for num,tp,cost,ped,sai,prev,ret,serv,val,st,pg in rows:
        if st=="vencido": b+=rect(tx+12,ry,tw-24,rh-8,"#fff5f5",rx=8,stroke="#fecaca")
        else: b+=rect(tx+12,ry,tw-24,rh-8,"#ffffff",rx=8,stroke="#f1f5f9")
        b+=text(tx+20,ry+28,num,12,"#0f172a",weight="bold")
        b+=text(tx+90,ry+28,tp,11.5,"#475569")
        b+=text(tx+210,ry+28,cost,12,"#0f172a",weight="bold")
        b+=text(tx+360,ry+28,ped,11.5,"#475569")
        b+=text(tx+470,ry+28,sai,11.5,"#475569")
        b+=text(tx+560,ry+28,prev,11.5,"#475569")
        b+=text(tx+670,ry+28,ret if ret!="—" else "—",11.5,"#dc2626" if ret=="—" and st=="vencido" else "#475569",weight="bold" if ret!="—" else "normal")
        b+=text(tx+780,ry+28,serv,11,"#334155")
        b+=text(tx+990,ry+28,val,12,"#0f172a",weight="bold")
        lab,bg,fg=STAT[st]; c,w=chip(tx+1090,ry+15,lab,bg,fg); b+=c
        lab2,bg2,fg2=PAG[pg]; c2,w2=chip(tx+1230,ry+15,lab2,bg2,fg2); b+=c2
        ry+=rh
    # rodapé regra
    b+=rect(tx,H-40,tw,24,"#0f1629",rx=8)
    b+=text(tx+16,H-23,"⚠ Romaneios não devolvidos até o dia 31 aparecem no relatório, mas NÃO são liberados para pagamento.  📲 Todo dia 1º: relatório mensal + valores a pagar enviados por WhatsApp.",10.5,"#fde68a",weight="bold")
    return svg(W,H,b)

# ============================ 3) ROMANEIO PDF (2 vias) ============================
def romaneio_pdf():
    W,H=820,1140
    b=rect(0,0,W,H,"#e5e7eb")
    b+=text(W/2,32,"Romaneio de Costura — PDF (2 vias na mesma página)",14,"#0f172a",weight="bold",anchor="middle")
    px,py,pw,ph=60,52,700,1040
    b+=rect(px,py,pw,ph,"#ffffff",rx=6,filt="paper")
    def via(oy,label):
        s=""
        ix=px+34; iw=pw-68
        # header
        s+=text(ix,oy+34,"BIG TRICOT",20,"#0f172a",weight="bold",ls="0.5")
        s+=text(ix,oy+54,"Malharia · Rolagem de Fase",10.5,"#64748b")
        s+=rect(px+pw-34-150,oy+18,150,24,"#fef3c7",rx=6)+text(px+pw-34-75,oy+35,label,10.5,"#92400e",weight="bold",anchor="middle")
        s+=text(px+pw-34,oy+62,"ROMANEIO Nº R-223",14,"#b45309",weight="bold",anchor="end")
        s+=line(ix,oy+74,ix+iw,oy+74,"#e5e7eb",1.5)
        # info linha
        s+=text(ix,oy+98,"Costureira:",10,"#94a3b8")+text(ix+74,oy+98,"Cris",12,"#0f172a",weight="bold")
        s+=text(ix+220,oy+98,"Pedido:",10,"#94a3b8")+text(ix+270,oy+98,"OP-1042 · Loja K",12,"#0f172a",weight="bold")
        s+=text(ix,oy+120,"Saída:",10,"#94a3b8")+text(ix+74,oy+120,"19/06/2026",12,"#0f172a",weight="bold")
        s+=text(ix+220,oy+120,"Retorno previsto:",10,"#94a3b8")+text(ix+330,oy+120,"26/06/2026",12,"#be123c",weight="bold")
        # itens agrupados
        s+=rect(ix,oy+136,iw,86,"#f8fafc",rx=8,stroke="#e5e7eb")
        s+=text(ix+14,oy+158,"ITENS (agrupados)",9,"#94a3b8",weight="bold",ls="0.5")
        s+=text(ix+14,oy+182,"• Peseiras / Mantas:",12,"#0f172a")+text(ix+200,oy+182,"15",13,"#b45309",weight="bold")+text(ix+230,oy+182,"(5 peseiras + 10 mantas)",10.5,"#94a3b8")
        s+=text(ix+14,oy+204,"• Almofadas / Capas:",12,"#0f172a")+text(ix+200,oy+204,"20",13,"#b45309",weight="bold")
        # serviços
        s+=text(ix,oy+246,"SERVIÇOS A EXECUTAR (marque ao concluir)",9,"#94a3b8",weight="bold",ls="0.5")
        servs=[("Colocar etiquetas","35 pç"),("Colocar capas","20"),("Colocar almofadas","20"),("Costurar","15")]
        sy=oy+258
        for i,(nm,q) in enumerate(servs):
            cxp=ix+(i%2)*(iw/2)
            yy=sy+(i//2)*34
            s+=rect(cxp,yy,18,18,"#ffffff",rx=4,stroke="#94a3b8",sw=1.5)
            s+=text(cxp+28,yy+14,nm,12,"#0f172a",weight="bold")+text(cxp+iw/2-20,yy+14,q,11,"#64748b",anchor="end")
        # assinaturas
        ay=oy+340
        s+=line(ix,ay,ix+iw/2-20,ay,"#0f172a",1)+text(ix,ay+16,"Assinatura na SAÍDA",9.5,"#94a3b8")
        s+=line(ix+iw/2+20,ay,ix+iw,ay,"#0f172a",1)+text(ix+iw/2+20,ay+16,"Assinatura no RETORNO",9.5,"#94a3b8")
        s+=text(px+pw-34,ay+16,"Valor: R$ 420,00",12,"#0f172a",weight="bold",anchor="end")
        return s
    b+=via(py+8,"1ª VIA — EMPRESA")
    # linha de corte
    cuty=py+ph/2
    b+=line(px+10,cuty,px+pw-10,cuty,"#cbd5e1",1.5,dash="8 6")
    b+=text(px+pw/2,cuty-6,"✂  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -",11,"#cbd5e1",anchor="middle")
    b+=via(cuty+8,"2ª VIA — COSTUREIRA")
    return svg(W,H,b,bg="#e5e7eb")

# ============================ 4) CADASTRO DE SERVIÇOS ============================
def servicos():
    W,H=1180,860
    b=rect(0,0,W,60,"url(#g_brand)")+text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")+text(W-28,38,"Bia Romaneios",13,"#fff",anchor="end")
    b+=rect(0,60,W,H-60,"#eceef3")
    mw,mh=720,680; mx=(W-mw)/2; my=90
    b+=rect(mx,my,mw,mh,"#ffffff",rx=22,filt="paper")
    b+=rect(mx,my,mw,80,"url(#g_rom)",rx=22)+rect(mx,my+48,mw,32,"url(#g_rom)")
    b+=text(mx+28,my+38,"Serviços de Costura",19,"#fff",weight="bold")+text(mx+28,my+60,"Cadastre os serviços e valores usados nos romaneios",11.5,"#fde68a")
    b+=circle(mx+mw-40,my+34,15,"#ffffff2e")+text(mx+mw-40,my+39,"✕",15,"#fff",anchor="middle")
    ix=mx+28; iw=mw-56
    # tabela serviços
    b+=text(ix,my+118,"SERVIÇOS CADASTRADOS",9.5,"#94a3b8",weight="bold",ls="0.5")
    b+=rect(ix,my+128,iw,1,"#eef0f4")
    cols=[("SERVIÇO",ix+4),("UNIDADE",ix+300),("AGRUPA COM",ix+430),("VALOR UNIT.",iw+mx-30)]
    for t,hx in cols: b+=text(hx if t!="VALOR UNIT." else hx,my+150,t,9,"#94a3b8",weight="bold",anchor="end" if t=="VALOR UNIT." else "start")
    servs=[("Colocar etiquetas","peça","—","R$ 0,50"),
           ("Colocar capas","capa","Almofadas/Capas","R$ 1,00"),
           ("Colocar almofadas","almofada","Almofadas/Capas","R$ 1,50"),
           ("Costurar peseira","peseira","Peseiras/Mantas","R$ 2,00"),
           ("Costurar manta","manta","Peseiras/Mantas","R$ 2,00")]
    ry=my+162
    for nm,un,gr,vl in servs:
        b+=rect(ix,ry,iw,42,"#ffffff",rx=8,stroke="#eef0f4")
        b+=text(ix+12,ry+26,nm,12.5,"#0f172a",weight="bold")
        b+=text(ix+300,ry+26,un,11.5,"#475569")
        gc,gf=("#eef2ff","#4338ca") if gr!="—" else ("#f1f5f9","#94a3b8")
        c,w=chip(ix+430,ry+13,gr,gc,gf); b+=c
        b+=text(mx+mw-40,ry+26,vl,12.5,"#047857",weight="bold",anchor="end")
        ry+=50
    # novo serviço
    b+=text(ix,ry+18,"NOVO SERVIÇO",9.5,"#94a3b8",weight="bold",ls="0.5")
    fy=ry+28
    b+=rect(ix,fy,260,42,"#f8fafc",rx=8,stroke="#e2e8f0")+text(ix+12,fy+27,"Nome do serviço",12,"#94a3b8")
    b+=rect(ix+272,fy,150,42,"#f8fafc",rx=8,stroke="#e2e8f0")+text(ix+284,fy+27,"Unidade ▾",12,"#94a3b8")
    b+=rect(ix+434,fy,120,42,"#f8fafc",rx=8,stroke="#e2e8f0")+text(ix+446,fy+27,"R$ 0,00",12,"#94a3b8")
    b+=rect(mx+mw-28-120,fy,120,42,"url(#g_rom)",rx=8)+text(mx+mw-28-60,fy+27,"＋ Adicionar",12,"#fff",weight="bold",anchor="middle")
    return svg(W,H,b)

# ============================ 5) WHATSAPP RELATÓRIO MENSAL ============================
def whats_mensal():
    W,H=760,1000
    b=rect(0,0,W,H,"#e9edef")
    b+=text(W/2,34,"Relatório mensal automático — enviado todo dia 1º",13.5,"#0f172a",weight="bold",anchor="middle")
    pw,ph=440,880; px=(W-pw)/2; py=58
    b+=rect(px,py,pw,ph,"#0b141a",rx=38,filt="ph")
    sx,sy,sw,sh=px+12,py+12,pw-24,ph-24
    b+=rect(sx,sy,sw,sh,"#0b141a",rx=28)
    b+=rect(sx,sy,sw,72,"#202c33",rx=28)+rect(sx,sy+40,sw,32,"#202c33")
    b+=text(sx+20,sy+30,"‹",22,"#aebac1")+avatar(sx+58,sy+36,18,"$","#25d366")
    b+=text(sx+86,sy+32,"Financeiro Big Tricot",13.5,"#e9edef",weight="bold")+text(sx+86,sy+50,"você, Ana, Bia",10.5,"#8696a0")
    cy0=sy+72
    b+=rect(sx,cy0,sw,sh-72-58,"#0b141a")
    b+=rect(sx+sw/2-50,cy0+14,100,22,"#182229",rx=11)+text(sx+sw/2,cy0+29,"01/07 · 08:00",10,"#8696a0",weight="bold",anchor="middle")
    bx=sx+24; by=cy0+48; bw=sw-48
    lines=[("*📊 Relatório Mensal — Junho/2026*","b"),
           ("",""),
           ("Romaneios devolvidos no prazo: *34*","n"),
           ("Total a pagar (liberado): *R$ 4.820,00*","n"),
           ("",""),
           ("*Por costureira:*","b"),
           ("• Silvia — R$ 980,00","n"),
           ("• Angélica — R$ 1.140,00","n"),
           ("• Bene — R$ 1.260,00","n"),
           ("• Nice — R$ 740,00","n"),
           ("• Cris — R$ 700,00","n"),
           ("",""),
           ("*⚠ Não liberado (não voltou até 31):*","b"),
           ("• R-210 Cris — R$ 135,00","n"),
           ("• R-205 Nice — R$ 300,00","n"),
           ("",""),
           ("Detalhes completos no sistema. 📎","n")]
    bh=20+len([l for l in lines])*21+16
    b+=rect(bx,by,bw,bh,"#005c4b",rx=14)
    b+=f'<path d="M {bx} {by+8} l -12 0 l 12 12 z" fill="#005c4b"/>'
    ty=by+24
    for txt,st in lines:
        if txt=="": ty+=10; continue
        if st=="b": b+=text(bx+16,ty,txt.replace("*",""),12.5,"#e9edef",weight="bold")
        else: b+=text(bx+16,ty,txt,12,"#e9edef")
        ty+=21
    b+=text(bx+bw-14,by+bh-10,"08:00 ✓✓",10,"#8aa9a0",anchor="end")
    iby=sy+sh-50
    b+=rect(sx+14,iby,sw-92,38,"#2a3942",rx=19)+text(sx+34,iby+24,"Mensagem",12,"#8696a0")
    b+=circle(sx+sw-32,iby+19,19,"#25d366")+text(sx+sw-32,iby+24,"➤",14,"#0b141a",anchor="middle")
    b+=text(W/2,H-16,"Valores vêm dos romaneios devolvidos. Vencidos (não voltaram até dia 31) aparecem, mas não entram no total a pagar.",10.5,"#64748b",anchor="middle")
    return svg(W,H,b,bg="#e9edef")

# ============================ 6) WHATSAPP LEMBRETES DA COSTUREIRA ============================
def whats_lembretes():
    W,H=760,1080
    b=rect(0,0,W,H,"#e9edef")
    b+=text(W/2,30,"Lembretes automáticos da costureira (previsão informada no romaneio)",12.5,"#0f172a",weight="bold",anchor="middle")
    pw,ph=440,980; px=(W-pw)/2; py=52
    b+=rect(px,py,pw,ph,"#0b141a",rx=38,filt="ph")
    sx,sy,sw,sh=px+12,py+12,pw-24,ph-24
    b+=rect(sx,sy,sw,sh,"#0b141a",rx=28)
    b+=rect(sx,sy,sw,72,"#202c33",rx=28)+rect(sx,sy+40,sw,32,"#202c33")
    b+=text(sx+20,sy+30,"‹",22,"#aebac1")+avatar(sx+58,sy+36,18,"CR","#3b82f6")
    b+=text(sx+86,sy+32,"Cris (costureira)",13.5,"#e9edef",weight="bold")+text(sx+86,sy+50,"romaneio R-223 · prev. 26/06",10.5,"#8696a0")
    cy0=sy+72
    b+=rect(sx,cy0,sw,sh-72-58,"#0b141a")
    def bubble(y,date,head,hcolor,lines,time):
        s=rect(sx+sw/2-46,y,92,22,"#182229",rx=11)+text(sx+sw/2,y+15,date,10,"#8696a0",weight="bold",anchor="middle")
        by=y+30; bx=sx+22; bw=sw-44
        bh=20+ (1+len(lines))*20 +20
        s+=rect(bx,by,bw,bh,"#005c4b",rx=14)
        s+=f'<path d="M {bx} {by+8} l -12 0 l 12 12 z" fill="#005c4b"/>'
        # tag automatica
        s+=rect(bx+12,by+12,142,18,"#0b3b30",rx=9)+text(bx+22,by+25,"🤖 mensagem automática",9.5,"#7ee0c4",weight="bold")
        ty=by+50
        s+=text(bx+14,ty,head,12.5,hcolor,weight="bold"); ty+=20
        for ln in lines:
            s+=text(bx+14,ty,ln,11.5,"#e9edef"); ty+=20
        s+=text(bx+bw-14,by+bh-9,time+" ✓✓",9.5,"#8aa9a0",anchor="end")
        return s, by+bh
    y=cy0+14
    s,y=bubble(y,"25/06","⏰ Lembrete — véspera",
               "#bfdbfe",["Olá, Cris! Amanhã (26/06) é a","previsão de entrega do romaneio","R-223 (Pes/Mantas 15 · Almof. 20).","Qualquer coisa, nos avise. 🙂"],"18:00"); b+=s
    y+=12
    s,y=bubble(y,"26/06","☀ Bom dia — dia da entrega",
               "#fde68a",["Hoje é o dia de retorno do","romaneio R-223. Aguardamos a","sua entrega ainda hoje. 📦"],"08:00"); b+=s
    y+=12
    s,y=bubble(y,"27/06","⚠ Romaneio em ATRASO",
               "#fca5a5",["A previsão era 26/06 e o romaneio","R-223 ainda não retornou.","Por favor, retorne assim que possível.","Não devolvidos até dia 31 não","entram no pagamento do mês."],"09:00"); b+=s
    iby=sy+sh-50
    b+=rect(sx+14,iby,sw-92,38,"#2a3942",rx=19)+text(sx+34,iby+24,"Mensagem",12,"#8696a0")
    b+=circle(sx+sw-32,iby+19,19,"#25d366")+text(sx+sw-32,iby+24,"➤",14,"#0b141a",anchor="middle")
    b+=text(W/2,H-14,"A previsão de entrega é informada no momento de gerar o romaneio. 3 lembretes: véspera · manhã da entrega · e se atrasar.",10.5,"#64748b",anchor="middle")
    return svg(W,H,b,bg="#e9edef")

os.makedirs(OUT_SVG,exist_ok=True)
for name,fn,z in [("43-insumos",insumos,1.3),("44-romaneios",romaneios,1.0),
                  ("46-cadastro-servicos",servicos,1.4),
                  ("47-whatsapp-mensal",whats_mensal,1.35),("48-whatsapp-lembretes",whats_lembretes,1.3)]:
    open(os.path.join(OUT_SVG,name+".svg"),"w").write(fn())
    subprocess.run(["rsvg-convert","-z",str(z),os.path.join(OUT_SVG,name+".svg"),"-o",os.path.join(OUT_PNG,name+".png")],check=True)
    print("OK",name)
