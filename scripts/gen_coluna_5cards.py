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
def circle(cx,cy,r,fill): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
GRADS={"p1":("#4338ca","#6366f1"),"p2":("#7c3aed","#c026d3"),"kit":("#0891b2","#06b6d4"),
       "uni":("#475569","#64748b"),"brand":("#4f46e5","#7c3aed")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
TLBL={"p1":"PARTE 1","p2":"PARTE 2","kit":"KIT","uni":"ÚNICO"}

def card(x,y,cw,tkey,num,client,product,qty,pedido_date,due_date,foot):
    ch=150
    s=rect(x,y,cw,ch,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
    hh=36
    s+=rect(x,y,cw,hh,f"url(#g_{tkey})",rx=16)+rect(x,y+hh-16,cw,16,f"url(#g_{tkey})")
    s+=text(x+16,y+23,f"OP-{num}",13,"#fff",weight="bold",ls="0.3")
    tl=TLBL[tkey]; tw=14+len(tl)*6.4
    s+=rect(x+cw-16-tw,y+9,tw,18,"#ffffff33",rx=9)+text(x+cw-16-tw/2,y+22,tl,9.5,"#fff",weight="bold",anchor="middle")
    s+=text(x+16,y+hh+24,client,14.5,"#0f172a",weight="bold")
    s+=text(x+16,y+hh+42,f"{product} · {qty} pç",11,"#64748b")
    bw=(cw-32-10)/2; by=y+hh+54
    s+=rect(x+16,by,bw,36,"#f5f3ff",rx=10)+text(x+16+10,by+14,"PEDIDO",7.5,"#7c3aed",weight="bold",ls="0.5")+text(x+16+10,by+29,pedido_date,12,"#4c1d95",weight="bold")
    s+=rect(x+16+bw+10,by,bw,36,"#fff1f2",rx=10)+text(x+16+bw+10+10,by+14,"ENTREGA",7.5,"#e11d48",weight="bold",ls="0.5")+text(x+16+bw+10+10,by+29,due_date,12,"#be123c",weight="bold")
    fy=y+ch-26
    s+=text(x+16,fy+14,foot,10,"#94a3b8")
    lab="▶ Iniciar"; lw=20+len(lab)*6.6
    s+=rect(x+cw-16-lw,fy,lw,24,"#10b981",rx=8)+text(x+cw-16-lw/2,fy+16,lab,11,"#fff",weight="bold",anchor="middle")
    return s

W,H=560,1020
b=rect(0,0,W,56,"url(#g_brand)")+text(24,35,"BIG TRICOT",16,"#fff",weight="bold",ls="0.5")+text(W-24,35,"Tecelagem",13,"#e0e7ff",anchor="end")
b+=text(28,92,"Empilhamento de cards na coluna",17,"#0f172a",weight="bold")
b+=text(28,113,"Os cards ficam um embaixo do outro; a coluna rola quando passa da altura.",11,"#64748b")
# coluna
cx,cy0,cw=28,134,504
colh=H-cy0-20
b+=rect(cx,cy0,cw,colh,"#f1f3f7",rx=16)
# header coluna
b+=rect(cx,cy0,cw,50,"#eef2ff",rx=16)+rect(cx,cy0+34,cw,16,"#eef2ff")
b+=circle(cx+20,cy0+25,5,"#6366f1")+text(cx+34,cy0+23,"Aguardando Tecelagem · Parte 1",12.5,"#4338ca",weight="bold")+text(cx+34,cy0+39,"fila da Máquina 3",10,"#6366f1")
b+=rect(cx+cw-40,cy0+14,26,22,"#ffffffcc",rx=11)+text(cx+cw-27,cy0+29,"5",12,"#4338ca",weight="bold",anchor="middle")
# 5 cards empilhados
cards=[("p1","1042","Loja K","Blusa · BT12","150","14/06","22/06","entrou 08:12"),
       ("p1","1031","Malharia F","Gola Alta · GL02","80","14/06","24/06","entrou 09:40"),
       ("p1","1010","Cliente B","Suéter · SU11","120","13/06","25/06","entrou 10:05"),
       ("p1","0998","Atacado D","Blusa · BT12","300","12/06","26/06","entrou 11:20"),
       ("p1","0990","Loja W","Cardigã · CG04","90","11/06","27/06","entrou 13:55")]
yy=cy0+60
for c in cards:
    b+=card(cx+12,yy,cw-24-8,*c); yy+=162
# scrollbar hint
b+=rect(cx+cw-9,cy0+60,5,260,"#cbd5e1",rx=3)
os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"37-coluna-5cards.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.7",os.path.join(OUT_SVG,"37-coluna-5cards.svg"),"-o",os.path.join(OUT_PNG,"37-coluna-5cards.png")],check=True)
print("OK coluna 5 cards")
