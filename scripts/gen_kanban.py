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

W,H=1960,860
TXT="#1f2430"; MUT="#7a8194"
b=rect(0,0,W,54,"#4c1d95")
b+=text(20,33,"🧶 BIG TRICOT",17,"#fff",weight="bold")
b+=rect(176,16,128,22,"#ffffff22",rx=11)+text(188,31,"Rolagem de Fase",12,"#fff")
b+=text(W-24,33,"João (Supervisor) ▾",13,"#fff",anchor="end")
# sidebar
b+=rect(0,54,220,H-54,"#1b1530")+text(20,90,"🧶 Big Tricot",14,"#fff",weight="bold")
menu=["📊 Início","📦 Pedidos","🏭 Ordens de Produção","📋 Romaneios","🧵 Costureiras","🗃️ Almoxarifado","🚚 Motoristas","📈 Relatórios"]
y=120
for i,m in enumerate(menu):
    if i==1:
        b+=rect(0,y-22,220,34,"#8b5cf633")+rect(0,y-22,3,34,"#8b5cf6")+text(20,y,m,13,"#fff")
    else: b+=text(20,y,m,13,"#cfc8e6")
    y+=34
# title + view toggle
b+=text(244,92,"Quadro de Produção",20,TXT,weight="bold")
b+=rect(W-300,68,140,34,"#fff",rx=9,stroke="#e6e6ee")
b+=rect(W-300,68,70,34,"#6d28d9",rx=9)+text(W-265,90,"▦ Quadro",12.5,"#fff",weight="bold",anchor="middle")
b+=text(W-195,90,"☰ Lista",12.5,"#6d28d9",anchor="middle")
b+=text(244,120,"Filtros:  Cliente ▾   Tipo ▾   Atrasados ☐    ·  arraste um cartão para mover de fase",12,MUT)

PILL={"green":("#dcfce7","#15803d"),"amber":("#fef3c7","#b45309"),"red":("#fee2e2","#b91c1c"),"blue":("#dbeafe","#1d4ed8"),"purple":("#f3effe","#5b21b6")}
def pill(x,y,label,key,fs=10,h=18):
    bg,fg=PILL[key]; w=12+len(label)*5.6
    return rect(x,y,w,h,bg,rx=h/2)+text(x+6,y+h/2+3.5,label,fs,fg)

HEAD={"Tecelagem":"#6d28d9","Passadoria":"#7c3aed","Corte":"#8b5cf6","Costura":"#0ea5e9",
      "Revisão":"#f59e0b","Expedição":"#10b981","Fiscal":"#14b8a6","Transporte":"#22c55e"}

# columns: (name,total,substatus_str,[cards])  card=(num,badge,cliente,extra,stripe,statuslabel,statuskey)
cols=[
 ("Tecelagem",12,"5 aguard · 4 exec · 3 fim",[
    ("#1010","","Cliente B","👤 Pedro · ⏱ 3h","green","Tecendo","green"),
    ("#1031","","Malharia F","👤 Pedro · ⏱ 1h","green","Tecendo","green"),
    ("#1040","P1","Loja K","👤 — · ⏱ 5h","amber","Aguardando","amber"),
 ]),
 ("Passadoria",5,"2 aguard · 1 exec · 2 fim",[
    ("#1033","P1","Loja G","👤 Carla · ⏱ 6h","red","Parado","red"),
    ("#1028","","Atacado J","👤 Carla · ⏱ 20m","green","Passando","green"),
 ]),
 ("Corte",8,"3 aguard · 2 exec · 3 fim",[
    ("#1031","","Malharia F","👤 José · ⏱ 1h","green","Cortando","green"),
    ("#1027","","Loja M","👤 — · ⏱ 2h","amber","Aguardando","amber"),
 ]),
 ("Costura",22,"6 aguard · 12 exec · 4 fim",[
    ("#1001","G-046","Loja A","🧵 Maria · ⏱ 1d4h","amber","Costurando","amber"),
    ("#1002","G-046","Loja A","🧵 Maria","amber","Costurando","amber"),
    ("#0995","","Cliente B","🧵 Rita · ⏱ 2h","green","Costurando","green"),
    ("#0996","","Loja N","🧵 Cláudia","red","Atrasada","red"),
 ]),
 ("Revisão",3,"1 aguard · 1 exec · 1 fim",[
    ("#0998","","Atacado D","👤 Carla · ⏱ 40m","green","Revisando","green"),
    ("G-045","3 ped","Loja H","👤 Carla","blue","Desmembrar","blue"),
 ]),
 ("Expedição",8,"2 aguard · 1 exec · 5 fim",[
    ("#1020","P.Entrega","Loja C","👤 — · ⏱ 2d","red","Aguardando","red"),
    ("#0991","","Loja P","👤 Lucas","green","Expedindo","green"),
 ]),
 ("Fiscal",6,"1 aguard · 1 exec · 4 fim",[
    ("#0989","","Cliente Q","👤 Fiscal · NF","green","Emitindo","green"),
 ]),
 ("Transporte",13,"2 aguard · 3 rota · 8 fim",[
    ("#0985","","Loja E","🚚 Carlos","green","Em rota","green"),
    ("#0982","","Atacado R","🚚 Rafael","green","Em rota","green"),
 ]),
]

x0=244; cw=200; gap=14; ytop=140
for ci,(name,total,subs,cards) in enumerate(cols):
    x=x0+ci*(cw+gap)
    b+=rect(x,ytop,cw,H-ytop-30,"#eceaf3",rx=12)
    b+=rect(x,ytop,cw,40,HEAD[name],rx=12)+rect(x,ytop+28,cw,12,HEAD[name])
    b+=text(x+12,ytop+25,name,13.5,"#fff",weight="bold")
    b+=rect(x+cw-40,ytop+11,28,18,"#ffffff33",rx=9)+text(x+cw-26,ytop+24,str(total),12,"#fff",weight="bold",anchor="middle")
    b+=text(x+12,ytop+56,subs,9.5,"#6b6b80")
    cy=ytop+68
    for num,badge,cli,extra,stripe,stlbl,stkey in cards:
        ch=84
        b+=rect(x+10,cy,cw-20,ch,"#fff",rx=10,stroke="#e3e0ee")
        scol={"green":"#22c55e","amber":"#f59e0b","red":"#ef4444","blue":"#3b82f6"}[stripe]
        b+=rect(x+10,cy,4,ch,scol,rx=2)
        b+=text(x+22,cy+22,num,12.5,TXT,weight="bold")
        if badge: b+=pill(x+22+len(num)*7.5+6,cy+10,badge,"purple")
        b+=text(x+22,cy+42,cli,11,MUT)
        b+=text(x+22,cy+60,extra,10,"#55556a")
        b+=pill(x+22,cy+66,stlbl,stkey)
        cy+=ch+10
    if total>len(cards):
        b+=text(x+12,cy+16,f"+ {total-len(cards)} pedidos…",11,"#6d28d9")

b+=text(244,H-10,"Mesmo dado da tela 'Todos os Pedidos', em formato de quadro. Arrastar = rolar fase (pede confirmação 🔒).",11,"#8a8aa0")

os.makedirs(OUT_SVG,exist_ok=True)
p=os.path.join(OUT_SVG,"19-kanban.svg"); open(p,"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.2",p,"-o",os.path.join(OUT_PNG,"19-kanban.png")],check=True)
print("OK kanban")
