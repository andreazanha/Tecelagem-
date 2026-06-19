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

W,H=1400,840
b=rect(0,0,W,54,"#4c1d95")
b+=text(20,33,"🧶 BIG TRICOT",17,"#fff",weight="bold")
b+=rect(176,16,128,22,"#ffffff22",rx=11)+text(188,31,"Rolagem de Fase",12,"#fff")
b+=text(W-24,33,"Pedro · Operador Tecelagem ▾",13,"#fff",anchor="end")
b+=rect(0,54,220,H-54,"#1b1530")+text(20,90,"🧶 Big Tricot",14,"#fff",weight="bold")
b+=text(20,116,"MEU SETOR",10,"#7c6fb0",weight="bold")
items=[("🧶 Tecelagem",True),("📥 Fila de tecelagem",False),("✅ Tecidos",False),("🧵 Teares",False),("🗃️ Almoxarifado",False),("📈 Meu desempenho",False)]
y=146
for m,act in items:
    if act: b+=rect(0,y-22,220,34,"#8b5cf633")+rect(0,y-22,3,34,"#8b5cf6")+text(20,y,m,13,"#fff")
    else: b+=text(20,y,m,13,"#cfc8e6")
    y+=34
b+=text(244,92,"Setor: Tecelagem",20,"#1f2430",weight="bold")
b+=text(244,116,"Fluxo do setor: Aguardando tecelagem → Tecendo → Tecidos (prontos p/ Passadoria).",12,"#7a8194")
cnt=[("Aguardando tecelagem","5","#f59e0b","#fffbeb"),("Tecendo","4","#16a34a","#f0fdf4"),("Tecidos (hoje)","3","#2563eb","#eff6ff"),("Teares ativos","4 / 6","#6d28d9","#f3effe")]
x=244
for l,n,c,bg in cnt:
    b+=rect(x,132,200,66,bg,rx=12,stroke="#e6e6ee")
    b+=text(x+14,168,n,24,c,weight="bold")+text(x+14,186,l,12,"#64748b")
    x+=212
# teares strip
b+=rect(244,212,1112,86,"#fff",rx=12,stroke="#e6e6ee")
b+=text(262,238,"Teares",13,"#1f2430",weight="bold")
teares=[("Tear 1","#1031 · Pedro","green"),("Tear 2","#1010 · Pedro","green"),("Tear 3","setup","amber"),("Tear 4","manutenção","red"),("Tear 5","livre","gray"),("Tear 6","#1040 · Ana","green")]
tx=262
for nm,st,col in teares:
    b+=rect(tx,250,170,34,"#f8f7fc",rx=8,stroke="#e6e6ee")
    dot={"green":"#22c55e","amber":"#f59e0b","red":"#ef4444","gray":"#cbd5e1"}[col]
    b+=f'<circle cx="{tx+16}" cy="267" r="6" fill="{dot}"/>'
    b+=text(tx+30,265,nm,12,"#1f2430",weight="bold")+text(tx+30,279,st,10,"#7a8194")
    tx+=182
# 3 columns
cols=[
 ("Aguardando Tecelagem","Fila do setor","#f59e0b",[
    ("OP #1042","Loja K · P1","Blusa BT12 · 150 pç","amber","start"),
    ("OP #1045","Cliente S","Casaco CA09 · 220 pç","amber","start"),
    ("OP #1050","Loja T","Gola GL02 · 80 pç","amber","start"),
 ],5),
 ("Tecendo","Em produção no tear","#16a34a",[
    ("OP #1010","Cliente B","Tear 2 · Pedro · ⏱ 3h","green","stop"),
    ("OP #1031","Malharia F","Tear 1 · Pedro · ⏱ 1h","green","stop"),
    ("OP #1040","Loja K","Tear 6 · Ana · ⏱ 5h","green","stop"),
    ("OP #1055","Atacado U","Tear 3 · setup","amber","stop"),
 ],4),
 ("Tecidos","Prontos p/ Passadoria","#2563eb",[
    ("OP #1009","Loja V","200 pç tecidas","blue","send"),
    ("OP #1002","Loja A","60 pç tecidas","blue","send"),
    ("OP #0993","Cliente B","140 pç tecidas","blue","send"),
 ],3),
]
x0=244; cw=360; gap=16; ytop=314
for ci,(name,sub,hc,cards,total) in enumerate(cols):
    x=x0+ci*(cw+gap)
    b+=rect(x,ytop,cw,H-ytop-30,"#eceaf3",rx=12)
    b+=rect(x,ytop,cw,48,hc,rx=12)+rect(x,ytop+36,cw,12,hc)
    b+=text(x+14,ytop+24,name,14,"#fff",weight="bold")
    b+=text(x+14,ytop+40,sub,10.5,"#ffffffcc")
    b+=rect(x+cw-44,ytop+15,30,18,"#ffffff33",rx=9)+text(x+cw-29,ytop+28,str(total),12,"#fff",weight="bold",anchor="middle")
    cy=ytop+64
    for num,cli,extra,stripe,act in cards:
        ch=82
        b+=rect(x+12,cy,cw-24,ch,"#fff",rx=10,stroke="#e3e0ee")
        scol={"green":"#22c55e","amber":"#f59e0b","red":"#ef4444","blue":"#3b82f6"}[stripe]
        b+=rect(x+12,cy,4,ch,scol,rx=2)
        b+=text(x+26,cy+24,num,13.5,"#1f2430",weight="bold")
        b+=text(x+26,cy+44,cli,11.5,"#7a8194")
        b+=text(x+26,cy+62,extra,10.5,"#55556a")
        if act=="start":
            b+=rect(x+cw-112,cy+22,90,28,"#16a34a",rx=8)+text(x+cw-67,cy+41,"▶ Iniciar",11.5,"#fff",weight="bold",anchor="middle")
        elif act=="stop":
            b+=rect(x+cw-120,cy+22,98,28,"#2563eb",rx=8)+text(x+cw-71,cy+41,"✓ Finalizar",11.5,"#fff",weight="bold",anchor="middle")
        elif act=="send":
            b+=rect(x+cw-156,cy+22,134,28,"#6d28d9",rx=8)+text(x+cw-89,cy+41,"🔒 Enviar p/ Passadoria",9.8,"#fff",weight="bold",anchor="middle")
        cy+=ch+10
    if total>len(cards):
        b+=text(x+14,cy+16,f"+ {total-len(cards)} na fila…",11,"#6d28d9")
b+=text(244,H-10,"'Iniciar' move p/ Tecendo (escolhe o tear) · 'Finalizar' move p/ Tecidos · 'Enviar p/ Passadoria' rola de setor com assinatura 🔒.",11,"#8a8aa0")
os.makedirs(OUT_SVG,exist_ok=True)
p=os.path.join(OUT_SVG,"20-setor-tecelagem.svg"); open(p,"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.4",p,"-o",os.path.join(OUT_PNG,"20-setor-tecelagem.png")],check=True)
print("OK setor-tecelagem")
