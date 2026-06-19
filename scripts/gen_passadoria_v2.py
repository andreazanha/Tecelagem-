# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,op=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if filt: s+=f' filter="url(#{filt})"'
    if op is not None: s+=f' fill-opacity="{op}"'
    return s+'/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
DEFS=('<defs>'
 '<linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">'
 '<stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '</defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,initials,fill="#6366f1"):
    return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,initials,r*0.8,"#fff",weight="bold",anchor="middle")

TINT={"amber":("#fff8ee","#f59e0b","#b45309"),"orange":("#fff3ea","#f97316","#c2410c"),
      "emerald":("#edfcf4","#10b981","#047857"),"blue":("#eef4ff","#3b82f6","#1d4ed8")}

# ---------- CARD FECHADO no estilo do card aberto ----------
def card(x,y,cw,op_prefix,op_num,client,product,qty,part,status_label,status_key,action,pedido_date,due_date,who=None):
    ch=176
    s=rect(x,y,cw,ch,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    # top: OP chip + status pill
    code=f"{op_prefix}-{op_num}"
    cwid=20+len(code)*7.0
    s+=rect(x+16,y+16,cwid,23,"#f1f5f9",rx=7,stroke="#e2e8f0")
    s+=text(x+16+10,y+31.5,code,12,"#334155",weight="bold",ls="0.3")
    bg,dot,fg=TINT[status_key]
    sp_w=26+len(status_label)*6.2
    s+=rect(x+cw-16-sp_w,y+16,sp_w,23,bg,rx=11)
    s+=circle(x+cw-16-sp_w+13,y+27.5,3.5,dot)
    s+=text(x+cw-16-sp_w+23,y+31.5,status_label,11,fg,weight="bold")
    # client + product
    s+=text(x+16,y+62,client,15.5,"#0f172a",weight="bold")
    prod=f"{product} · {qty} pç"
    s+=text(x+16,y+81,prod,11.5,"#64748b")
    # date mini-boxes (estilo do card aberto)
    bw=(cw-32-10)/2; by=y+92
    s+=rect(x+16,by,bw,42,"#f5f3ff",rx=10,stroke="#e9e3ff")
    s+=text(x+16+12,by+16,"PEDIDO",8,"#7c3aed",weight="bold",ls="0.6")
    s+=text(x+16+12,by+33,pedido_date,13,"#4c1d95",weight="bold")
    s+=rect(x+16+bw+10,by,bw,42,"#fff1f2",rx=10,stroke="#fde0e3")
    s+=text(x+16+bw+10+12,by+16,"ENTREGA",8,"#e11d48",weight="bold",ls="0.6")
    s+=text(x+16+bw+10+12,by+33,due_date,13,"#be123c",weight="bold")
    # footer: part tag + action
    fy=y+ch-28
    if part:
        pw=14+len(part)*6.2
        s+=rect(x+16,fy,pw,22,"#eef2ff",rx=8)+text(x+16+7,fy+15,part,10.5,"#4338ca",weight="bold")
    lab,col={"start":("Passar","#10b981"),"stop":("Finalizar","#3b82f6"),"send":("Enviar ▶","#6d28d9")}[action]
    bwid=26+len(lab)*7.2
    s+=rect(x+cw-16-bwid,fy,bwid,24,col,rx=8)+text(x+cw-16-bwid/2,fy+16,lab,11.5,"#fff",weight="bold",anchor="middle")
    return s

def build_board():
    W,H=2240,940
    b=""
    b+=rect(0,0,W,60,"url(#hg)")
    b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")
    b+=circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
    b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar OP, cliente, kit…",12,"#e0e7ff")
    b+=text(W-200,38,"Carla Mendes",13,"#fff",anchor="end")+avatar(W-176,30,15,"CM","#a78bfa")
    b+=rect(0,60,230,H-60,"#0f1629")
    b+=text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
    nav=[("◧","Visão geral",False),("🔥","Passadoria",True),("📥","Fila de entrada",False),
         ("✅","Finalizados",False),("👥","Passadeiras",False),("📊","Desempenho",False),("⚙","Configurações",False)]
    y=150
    for ic,label,act in nav:
        if act:
            b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#818cf8",rx=2)
            b+=text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
        else:
            b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
        y+=44
    b+=text(258,96,"Passadoria",24,"#0f172a",weight="bold")
    b+=text(258,118,"Produção  ›  Passadoria",12,"#94a3b8")
    b+=rect(W-372,80,150,34,"#ffffff",rx=9,stroke="#e5e7eb",filt="cardShadow")
    b+=rect(W-368,84,72,26,"url(#hg)",rx=7)+text(W-332,101,"▦ Quadro",12,"#fff",weight="bold",anchor="middle")
    b+=text(W-258,101,"☰ Lista",12,"#6b7280",anchor="middle")
    b+=rect(W-208,80,120,34,"#ffffff",rx=9,stroke="#e5e7eb",filt="cardShadow")+text(W-148,101,"⚙  Filtros",12.5,"#374151",weight="bold",anchor="middle")
    kpis=[("Em fila","6","#f59e0b"),("Passando","3","#10b981"),("Finalizados hoje","4","#3b82f6"),
          ("No prazo","92%","#6366f1"),("Passadeiras","3 / 4","#8b5cf6")]
    x=258
    for l,n,c in kpis:
        b+=rect(x,138,210,62,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
        b+=rect(x,152,4,34,c,rx=2)+text(x+20,170,n,22,"#0f172a",weight="bold")+text(x+20,189,l,11.5,"#64748b")
        x+=222
    b+=text(258,228,"Parte 1 e Parte 2 permanecem separadas na Passadoria — unem-se apenas no Corte.",12,"#94a3b8")
    cols=[
     ("Aguardando · Kits","amber",[("KIT","1031","Malharia F","Blusa Tricô · BT12",80,None,"Aguardando","amber","start","16/06","23/06"),
                                   ("KIT","1027","Loja M","Casaco · CA09",150,None,"Aguardando","amber","start","17/06","24/06")]),
     ("Aguardando · Parte 1","amber",[("OP","1042","Loja K","Blusa Tricô · BT12",150,"Parte 1","Aguardando","amber","start","14/06","22/06"),
                                      ("OP","1050","Loja T","Gola · GL02",80,"Parte 1","Aguardando","amber","start","18/06","26/06")]),
     ("Aguardando · Parte 2","orange",[("OP","1042","Loja K","Blusa Tricô · BT12",150,"Parte 2","Aguardando","orange","start","14/06","22/06"),
                                       ("OP","1033","Loja G","Colete · CV03",60,"Parte 2","Aguardando","orange","start","18/06","26/06")]),
     ("Passando","emerald",[("OP","1010","Cliente B","Suéter · SU11",120,"Parte 1","Passando","emerald","stop","13/06","25/06"),
                            ("KIT","1009","Loja V","Touca · TC01",90,None,"Passando","emerald","stop","12/06","21/06"),
                            ("OP","1015","Loja W","Cardigã · CG04",100,"Parte 2","Passando","emerald","stop","15/06","27/06")]),
     ("Finalizados · Kits","blue",[("KIT","0995","Cliente B","Cachecol · CC07",120,None,"Pronto","blue","send","15/06","25/06"),
                                   ("KIT","0996","Loja N","Luva · LV02",60,None,"Pronto","blue","send","14/06","24/06")]),
     ("Finalizados · Parte 1","blue",[("OP","1002","Loja A","Blusa · BT12",60,"Parte 1","Pronto","blue","send","11/06","22/06")]),
     ("Finalizados · Parte 2","blue",[("OP","1002","Loja A","Blusa · BT12",60,"Parte 2","Pronto","blue","send","11/06","22/06")]),
    ]
    x0=258; cw=266; gap=16; ytop=244
    for ci,(title,key,cards) in enumerate(cols):
        x=x0+ci*(cw+gap); bgt,dot,fg=TINT[key]; colh=H-ytop-30
        b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
        b+=rect(x,ytop,cw,52,bgt,rx=16)+rect(x,ytop+36,cw,16,bgt)
        b+=circle(x+20,ytop+26,5,dot)+text(x+34,ytop+24,title.split(" · ")[0],12.5,fg,weight="bold")
        sub=title.split(" · ")[1] if " · " in title else ""
        if sub: b+=text(x+34,ytop+40,sub,11,fg,weight="bold")
        b+=rect(x+cw-40,ytop+15,26,22,"#ffffffcc",rx=11)+text(x+cw-27,ytop+30,str(len(cards)),12,fg,weight="bold",anchor="middle")
        cy=ytop+66
        for (pf,num,cl,pr,qt,pt,sl,sk,ac,pd,du) in cards:
            b+=card(x+10,cy,cw-20,pf,num,cl,pr,qt,pt,sl,sk,ac,pd,du)
            cy+=192
    b+=text(258,H-12,"Clique em qualquer card para abrir os detalhes completos (mesmo visual, ampliado).",11.5,"#94a3b8")
    return svg(W,H,b)

def build_closeup():
    # close-up de um card fechado para o cliente avaliar o acabamento
    W,Hc=360,250
    b=card(40,40,280,"OP","1042","Loja K","Blusa Tricô · BT12",150,"Parte 1","Aguardando","amber","start","14/06","22/06")
    return svg(W,Hc,b,bg="#eef0f5")

os.makedirs(OUT_SVG,exist_ok=True)
p=os.path.join(OUT_SVG,"22-setor-passadoria.svg"); open(p,"w").write(build_board())
subprocess.run(["rsvg-convert","-z","1.1",p,"-o",os.path.join(OUT_PNG,"22-setor-passadoria.png")],check=True)
p2=os.path.join(OUT_SVG,"24-card-fechado.svg"); open(p2,"w").write(build_closeup())
subprocess.run(["rsvg-convert","-z","2.6",p2,"-o",os.path.join(OUT_PNG,"24-card-fechado.png")],check=True)
print("OK passadoria + closeup")
