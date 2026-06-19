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

W,H=2020,860
b=rect(0,0,W,54,"#4c1d95")
b+=text(20,33,"🧶 BIG TRICOT",17,"#fff",weight="bold")
b+=rect(176,16,128,22,"#ffffff22",rx=11)+text(188,31,"Rolagem de Fase",12,"#fff")
b+=text(W-24,33,"Pedro · Operador Tecelagem ▾",13,"#fff",anchor="end")
b+=rect(0,54,220,H-54,"#1b1530")+text(20,90,"🧶 Big Tricot",14,"#fff",weight="bold")
b+=text(20,116,"MEU SETOR",10,"#7c6fb0",weight="bold")
items=[("🧶 Tecelagem",True),("📥 Fila de tecelagem",False),("✅ Tecidos",False),("🧵 Máquinas",False),("🗃️ Almoxarifado",False),("📈 Meu desempenho",False)]
y=146
for m,act in items:
    if act: b+=rect(0,y-22,220,34,"#8b5cf633")+rect(0,y-22,3,34,"#8b5cf6")+text(20,y,m,13,"#fff")
    else: b+=text(20,y,m,13,"#cfc8e6")
    y+=34
b+=text(244,92,"Setor: Tecelagem",20,"#1f2430",weight="bold")
b+=text(244,116,"Parte 1 (Máq 3) e Parte 2 (Máq 7) seguem separadas e se unem no Corte · Kits seguem separados.",12,"#7a8194")
# counters
cnt=[("Aguard. Parte 1 · Máq 3","2","#f59e0b","#fffbeb"),("Aguard. Parte 2 · Máq 7","2","#f59e0b","#fff7ed"),
     ("Aguard. Kits","3","#f59e0b","#fffbeb"),("Tecendo","4","#16a34a","#f0fdf4"),
     ("Tecidos","4","#2563eb","#eff6ff"),("Máquinas ativas","6 / 8","#6d28d9","#f3effe")]
x=244
for l,n,c,bg in cnt:
    b+=rect(x,132,270,66,bg,rx=12,stroke="#e6e6ee")
    b+=text(x+14,166,n,22,c,weight="bold")+text(x+14,186,l,11.5,"#64748b")
    x+=284
# machines strip
b+=rect(244,212,1700,86,"#fff",rx=12,stroke="#e6e6ee")
b+=text(262,238,"Máquinas (teares)",13,"#1f2430",weight="bold")
maqs=[("Máq 1","livre","gray"),("Máq 2","#1015","green"),("Máq 3","Parte 1 · #1010","green"),
      ("Máq 4","manutenção","red"),("Máq 5","KIT #1009","green"),("Máq 6","#1040","green"),
      ("Máq 7","Parte 2 · #1033","green"),("Máq 8","setup","amber")]
tx=262
for nm,st,col in maqs:
    hl = "Parte" in st
    b+=rect(tx,250,202,34,"#f3effe" if hl else "#f8f7fc",rx=8,stroke="#c4b5fd" if hl else "#e6e6ee")
    dot={"green":"#22c55e","amber":"#f59e0b","red":"#ef4444","gray":"#cbd5e1"}[col]
    b+=f'<circle cx="{tx+16}" cy="267" r="6" fill="{dot}"/>'
    b+=text(tx+30,265,nm,12,"#1f2430",weight="bold")+text(tx+30,279,st,9.5,"#7a8194")
    tx+=205
# 6 columns
cols=[
 ("Aguardando · Parte 1","Máquina 3","#f59e0b",[
    ("OP #1042","Loja K","Blusa BT12 · 150 pç","amber","start"),
    ("OP #1050","Loja T","Gola GL02 · 80 pç","amber","start"),
 ],2),
 ("Aguardando · Parte 2","Máquina 7","#ea7c0b",[
    ("OP #1042","Loja K","Parte 2 · 150 pç","amber","start"),
    ("OP #1033","Loja G","Parte 2 · 60 pç","amber","start"),
 ],2),
 ("Aguardando · Kits","Fila de kits","#f59e0b",[
    ("KIT #1031","Malharia F","80 pç","amber","start"),
    ("KIT #1027","Loja M","150 pç","amber","start"),
    ("KIT #1055","Atacado U","90 pç","amber","start"),
 ],3),
 ("Tecendo","Em produção","#16a34a",[
    ("OP #1010 · P1","Cliente B","Máq 3 · Pedro · ⏱ 3h","green","stop"),
    ("OP #1033 · P2","Loja G","Máq 7 · Ana · ⏱ 1h","green","stop"),
    ("KIT #1009","Loja V","Máq 5 · ⏱ 2h","green","stop"),
    ("OP #1040","Loja K","Máq 6 · Ana · ⏱ 5h","green","stop"),
 ],4),
 ("Tecidos","Partes prontas","#2563eb",[
    ("OP #1002 · P1","Loja A","60 pç tecidas","blue","send"),
    ("OP #1002 · P2","Loja A","60 pç tecidas","blue","send"),
 ],2),
 ("Tecidos · Kits","Kits prontos","#1d4ed8",[
    ("KIT #0995","Cliente B","120 pç tecidas","blue","send"),
    ("KIT #0996","Loja N","60 pç tecidas","blue","send"),
 ],2),
]
x0=244; cw=276; gap=14; ytop=314
for ci,(name,sub,hc,cards,total) in enumerate(cols):
    x=x0+ci*(cw+gap)
    b+=rect(x,ytop,cw,H-ytop-30,"#eceaf3",rx=12)
    b+=rect(x,ytop,cw,48,hc,rx=12)+rect(x,ytop+36,cw,12,hc)
    b+=text(x+14,ytop+24,name,13,"#fff",weight="bold")
    b+=text(x+14,ytop+40,sub,10,"#ffffffcc")
    b+=rect(x+cw-42,ytop+15,30,18,"#ffffff33",rx=9)+text(x+cw-27,ytop+28,str(total),12,"#fff",weight="bold",anchor="middle")
    cy=ytop+64
    for num,cli,extra,stripe,act in cards:
        ch=80
        b+=rect(x+12,cy,cw-24,ch,"#fff",rx=10,stroke="#e3e0ee")
        scol={"green":"#22c55e","amber":"#f59e0b","red":"#ef4444","blue":"#3b82f6"}[stripe]
        b+=rect(x+12,cy,4,ch,scol,rx=2)
        b+=text(x+24,cy+22,num,12.5,"#1f2430",weight="bold")
        b+=text(x+24,cy+40,cli,11,"#7a8194")
        b+=text(x+24,cy+58,extra,10,"#55556a")
        if act=="start":
            b+=rect(x+cw-96,cy+50,80,24,"#16a34a",rx=7)+text(x+cw-56,cy+66,"▶ Iniciar",11,"#fff",weight="bold",anchor="middle")
        elif act=="stop":
            b+=rect(x+cw-104,cy+50,88,24,"#2563eb",rx=7)+text(x+cw-60,cy+66,"✓ Finalizar",10.5,"#fff",weight="bold",anchor="middle")
        elif act=="send":
            b+=rect(x+cw-104,cy+50,88,24,"#6d28d9",rx=7)+text(x+cw-60,cy+66,"🔒 Enviar ▶",10,"#fff",weight="bold",anchor="middle")
        cy+=ch+10
b+=text(244,H-10,"Fluxo: P1 (Máq 3) + P2 (Máq 7) tecidas separadas → se unem no Corte. Kits tecidos seguem separados. 'Enviar ▶' rola p/ próxima fase 🔒.",11,"#8a8aa0")
os.makedirs(OUT_SVG,exist_ok=True)
p=os.path.join(OUT_SVG,"20-setor-tecelagem.svg"); open(p,"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.2",p,"-o",os.path.join(OUT_PNG,"20-setor-tecelagem.png")],check=True)
print("OK setor-tecelagem")
