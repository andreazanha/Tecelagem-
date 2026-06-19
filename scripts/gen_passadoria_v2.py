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
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None,fam=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill,stroke=None,sw=1):
    s=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    return s+'/>'

DEFS=('<defs>'
 '<linearGradient id="hg" x1="0" y1="0" x2="1" y2="0">'
 '<stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '<filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="#1e1b4b" flood-opacity="0.16"/></filter>'
 '</defs>')

def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

def chip(x,y,label,bg,fg,fs=11,h=20,bold=True,pad=10):
    w=pad*2+len(label)*fs*0.56
    return rect(x,y,w,h,bg,rx=h/2)+text(x+pad,y+h/2+fs*0.35,label,fs,fg,weight="bold" if bold else "normal"), w

def avatar(cx,cy,r,initials,fill="#6366f1"):
    return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,initials,r*0.8,"#fff",weight="bold",anchor="middle")

W,H=2240,900
b=""
# ---- topbar ----
b+=rect(0,0,W,60,"url(#hg)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")
b+=circle(150,30,3,"#c7d2fe")
b+=text(168,38,"Rolagem de Fase",13,"#e0e7ff")
# search
b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar OP, cliente, kit…",12,"#e0e7ff")
b+=text(W-196,38,"Carla Mendes",13,"#fff",anchor="end")
b+=text(W-196,38,"",1,"#fff")
b+=avatar(W-176,30,15,"CM","#a78bfa")
# ---- sidebar ----
b+=rect(0,60,230,H-60,"#0f1629")
b+=text(26,98,"Big Tricot",15,"#fff",weight="bold")
b+=text(26,118,"Produção",10.5,"#5b6478",ls="1")
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
b+=rect(14,H-92,202,64,"#172036",rx=12)
b+=text(30,H-66,"Você está em",10,"#7b8499")+text(30,H-48,"Setor: Passadoria",12.5,"#e7eaf3",weight="bold")
# ---- header / toolbar ----
b+=text(258,96,"Passadoria",24,"#0f172a",weight="bold")
b+=text(258,118,"Produção  ›  Passadoria",12,"#94a3b8")
# view toggle + filtros
b+=rect(W-372,80,150,34,"#ffffff",rx=9,stroke="#e5e7eb",filt="cardShadow")
b+=rect(W-368,84,72,26,"url(#hg)",rx=7)+text(W-332,101,"▦ Quadro",12,"#fff",weight="bold",anchor="middle")
b+=text(W-258,101,"☰ Lista",12,"#6b7280",anchor="middle")
b+=rect(W-208,80,120,34,"#ffffff",rx=9,stroke="#e5e7eb",filt="cardShadow")+text(W-148,101,"⚙  Filtros",12.5,"#374151",weight="bold",anchor="middle")
# ---- KPI strip ----
kpis=[("Em fila","6","#f59e0b"),("Passando","3","#10b981"),("Finalizados hoje","4","#3b82f6"),
      ("No prazo","92%","#6366f1"),("Passadeiras","3 / 4","#8b5cf6")]
x=258
for l,n,c in kpis:
    b+=rect(x,138,210,62,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
    b+=rect(x,152,4,34,c,rx=2)
    b+=text(x+20,170,n,22,"#0f172a",weight="bold")
    b+=text(x+20,189,l,11.5,"#64748b")
    x+=222
b+=text(258,228,"Parte 1 e Parte 2 permanecem separadas na Passadoria — unem-se apenas no Corte.",12,"#94a3b8")
# ---- board ----
TINT={"amber":("#fff8ee","#f59e0b","#b45309"),"orange":("#fff3ea","#f97316","#c2410c"),
      "emerald":("#edfcf4","#10b981","#047857"),"blue":("#eef4ff","#3b82f6","#1d4ed8")}
def card(x,y,cw,op_prefix,op_num,client,product,qty,part,stripe,status_label,status_key,
         action,due=None,who=None,passadeira_time=None):
    ch=118
    s=rect(x,y,cw,ch,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
    scol={"amber":"#f59e0b","orange":"#f97316","emerald":"#10b981","blue":"#3b82f6"}[stripe]
    s+=rect(x,y+14,4,ch-28,scol,rx=2)
    # OP chip
    code=f"{op_prefix}-{op_num}"
    cw_chip=22+len(code)*7.2
    s+=rect(x+18,y+16,cw_chip,22,"#f1f5f9",rx=6,stroke="#e2e8f0")
    s+=text(x+18+11,y+31,code,12,"#334155",weight="bold",ls="0.3")
    # status pill
    bg,dot,fg=TINT[status_key]
    sp_w=26+len(status_label)*6.4
    s+=rect(x+cw-18-sp_w,y+16,sp_w,22,bg,rx=11)
    s+=circle(x+cw-18-sp_w+12,y+27,3.5,dot)
    s+=text(x+cw-18-sp_w+22,y+31,status_label,11,fg,weight="bold")
    # client
    s+=text(x+18,y+60,client,15,"#0f172a",weight="bold")
    # product
    s+=text(x+18,y+79,product,11.5,"#64748b")
    # footer
    fy=y+99
    if part:
        pw=14+len(part)*6.2
        s+=rect(x+18,fy-13,pw,18,"#eef2ff",rx=9)+text(x+18+7,fy,part,10.5,"#4338ca",weight="bold")
        fx=x+18+pw+8
    else: fx=x+18
    s+=text(fx,fy,f"◷ {qty} pç",11,"#475569")
    if due:
        s+=text(x+cw-150,fy,f"📅 {due}",11,"#dc2626",weight="bold") if due_red else ""
    # action button
    lab,col={"start":("Passar","#10b981"),"stop":("Finalizar","#3b82f6"),"send":("Enviar ▶","#6d28d9")}[action]
    bwid=24+len(lab)*7.2
    s+=rect(x+cw-18-bwid,fy-15,bwid,24,col,rx=8)+text(x+cw-18-bwid/2,fy+1,lab,11.5,"#fff",weight="bold",anchor="middle")
    if who:
        s+=avatar(x+cw-150,fy-5,9,who,"#6366f1")
    return s

due_red=True
cols=[
 ("Aguardando · Kits","amber",[("KIT","1031","Malharia F","Blusa Tricô · BT12",80,None,"amber","Aguardando","amber","start","23/06",None),
                               ("KIT","1027","Loja M","Casaco · CA09",150,None,"amber","Aguardando","amber","start","24/06",None)]),
 ("Aguardando · Parte 1","amber",[("OP","1042","Loja K","Blusa Tricô · BT12",150,"Parte 1","amber","Aguardando","amber","start","22/06",None),
                                  ("OP","1050","Loja T","Gola · GL02",80,"Parte 1","amber","Aguardando","amber","start","26/06",None)]),
 ("Aguardando · Parte 2","orange",[("OP","1042","Loja K","Blusa Tricô · BT12",150,"Parte 2","orange","Aguardando","orange","start","22/06",None),
                                   ("OP","1033","Loja G","Colete · CV03",60,"Parte 2","orange","Aguardando","orange","start","26/06",None)]),
 ("Passando","emerald",[("OP","1010","Cliente B","Suéter · SU11",120,"Parte 1","emerald","Passando","emerald","stop","25/06","MA"),
                        ("KIT","1009","Loja V","Touca · TC01",90,None,"emerald","Passando","emerald","stop","21/06","RI"),
                        ("OP","1015","Loja W","Cardigã · CG04",100,"Parte 2","emerald","Passando","emerald","stop","27/06","AN")]),
 ("Finalizados · Kits","blue",[("KIT","0995","Cliente B","Cachecol · CC07",120,None,"blue","Pronto","blue","send","25/06",None),
                               ("KIT","0996","Loja N","Luva · LV02",60,None,"blue","Pronto","blue","send","24/06",None)]),
 ("Finalizados · Parte 1","blue",[("OP","1002","Loja A","Blusa · BT12",60,"Parte 1","blue","Pronto","blue","send","22/06",None)]),
 ("Finalizados · Parte 2","blue",[("OP","1002","Loja A","Blusa · BT12",60,"Parte 2","blue","Pronto","blue","send","22/06",None)]),
]
x0=258; cw=266; gap=16; ytop=244
for ci,(title,key,cards) in enumerate(cols):
    x=x0+ci*(cw+gap)
    bgt,dot,fg=TINT[key]
    colh=H-ytop-30
    b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
    # header
    b+=rect(x,ytop,cw,52,bgt,rx=16)+rect(x,ytop+36,cw,16,bgt)
    b+=circle(x+20,ytop+26,5,dot)
    b+=text(x+34,ytop+24,title.split(" · ")[0],12.5,fg,weight="bold")
    sub=title.split(" · ")[1] if " · " in title else ""
    if sub: b+=text(x+34,ytop+40,sub,11,fg,weight="bold")
    cnt=str(len(cards))
    b+=rect(x+cw-40,ytop+15,26,22,"#ffffffcc",rx=11)+text(x+cw-27,ytop+30,cnt,12,fg,weight="bold",anchor="middle")
    cy=ytop+66
    for (pf,num,cl,pr,qt,pt,st,sl,sk,ac,du,wh) in cards:
        b+=card(x+10,cy,cw-20,pf,num,cl,pr,qt,pt,st,sl,sk,ac,du,wh)
        cy+=132
b+=text(258,H-12,"Clique em qualquer card para abrir os detalhes (Data do pedido, Data de entrega e histórico).",11.5,"#94a3b8")

os.makedirs(OUT_SVG,exist_ok=True)
p=os.path.join(OUT_SVG,"22-setor-passadoria.svg"); open(p,"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.1",p,"-o",os.path.join(OUT_PNG,"22-setor-passadoria.png")],check=True)
print("OK passadoria v2")
