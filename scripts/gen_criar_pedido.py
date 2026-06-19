# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,op=None,dash=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if dash: s+=f' stroke-dasharray="{dash}"'
    if filt: s+=f' filter="url(#{filt})"'
    if op is not None: s+=f' fill-opacity="{op}"'
    return s+'/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
DEFS=('<defs>'
 '<linearGradient id="g_brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '</defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,initials,fill="#6366f1"):
    return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,initials,r*0.8,"#fff",weight="bold",anchor="middle")
def field(x,y,w,label,value,muted=False):
    s=text(x,y,label,9.5,"#94a3b8",weight="bold",ls="0.6")
    s+=rect(x,y+8,w,40,"#ffffff",rx=10,stroke="#e2e8f0")
    s+=text(x+14,y+33,value,13,"#94a3b8" if muted else "#0f172a",weight="normal" if muted else "bold")
    return s

W,H=1600,1020
b=rect(0,0,W,60,"url(#g_brand)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
b+=text(W-200,38,"Ana Paula",13,"#fff",anchor="end")+avatar(W-176,30,15,"AP","#a78bfa")
# sidebar
b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Cadastro",10.5,"#5b6478",ls="1")
nav=[("◧","Visão geral",False),("📦","Pedidos",True),("🏭","Produção",False),("📋","Romaneios",False),("🧵","Costureiras",False),("🗃️","Almoxarifado",False),("📊","Relatórios",False),("⚙","Configurações",False)]
y=150
for ic,label,act in nav:
    if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#818cf8",rx=2)+text(34,y+3,ic,13,"#c7d2fe")+text(58,y+3,label,13.5,"#fff",weight="bold")
    else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
    y+=44
# header
b+=text(258,96,"Novo Pedido",24,"#0f172a",weight="bold")+text(258,118,"Pedidos  ›  Novo",12,"#94a3b8")
# tabs origem
b+=rect(258,132,360,40,"#eef0f5",rx=10)
b+=rect(262,136,200,32,"#ffffff",rx=8,filt="cardShadow")+text(362,156,"📄 Importar do ERP (PDF)",12,"#4338ca",weight="bold",anchor="middle")
b+=text(540,156,"✎ Manual",12,"#6b7280",anchor="middle")

# ---------- LEFT: PDF ----------
lx,ly,lw,lh=258,190,452,780
b+=rect(lx,ly,lw,lh,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
b+=text(lx+22,ly+34,"PDF do ERP",14,"#0f172a",weight="bold")
b+=rect(lx+lw-150,ly+18,128,24,"#ecfdf5",rx=12)+circle(lx+lw-150+14,ly+30,3.5,"#10b981")+text(lx+lw-150+24,ly+34,"OCR 94% lido",10.5,"#047857",weight="bold")
# preview
px,py,pw,ph=lx+22,ly+56,lw-44,520
b+=rect(px,py,pw,ph,"#f8fafc",rx=12,stroke="#e2e8f0")
b+=rect(px+24,py+24,pw-48,30,"#e9edf3",rx=6)
for i in range(11):
    wln = pw-48 if i%3 else (pw-160)
    b+=rect(px+24,py+72+i*34,wln,12,"#eef1f6",rx=4)
b+=text(px+pw/2,py+ph-18,"pedido_8842.pdf  ·  preservado no sistema",10.5,"#94a3b8",anchor="middle")
# left buttons
b+=rect(lx+22,ly+lh-60,180,40,"#ffffff",rx=10,stroke="#cbd5e1")+text(lx+22+90,ly+lh-34,"👁  Ver original",12.5,"#334155",weight="bold",anchor="middle")
b+=rect(lx+212,ly+lh-60,180,40,"#ffffff",rx=10,stroke="#cbd5e1")+text(lx+212+90,ly+lh-34,"↻  Reprocessar OCR",11.5,"#334155",weight="bold",anchor="middle")

# ---------- RIGHT: FORM ----------
rx,ry,rw,rh=734,190,842,780
b+=rect(rx,ry,rw,rh,"#ffffff",rx=16,stroke="#eef0f4",filt="cardShadow")
ix=rx+28; iw=rw-56
b+=text(ix,ry+34,"Dados do pedido",15,"#0f172a",weight="bold")
b+=text(rx+rw-28,ry+34,"⚠ campos amarelos: confira o OCR",10.5,"#b45309",anchor="end")
# cliente
b+=field(ix,ry+54,iw,"CLIENTE","Loja K — Malhas & Cia  ▾")
# numero + referencia
half=(iw-16)/2
b+=field(ix,ry+118,half,"Nº DO PEDIDO (ERP)","8842")
b+=field(ix+half+16,ry+118,half,"VENDEDOR","Marcos R.  ▾")
# DATAS (caixinhas suaves, padrão dos cards)
dby=ry+182
b+=rect(ix,dby,half,64,"#f5f3ff",rx=12,stroke="#ddd6fe")
b+=text(ix+16,dby+22,"DATA DO PEDIDO (LANÇAMENTO)",9,"#7c3aed",weight="bold",ls="0.4")
b+=text(ix+16,dby+48,"14/06/2026",20,"#4c1d95",weight="bold")
b+=rect(ix+half+16,dby,half,64,"#fff1f2",rx=12,stroke="#fecdd3")
b+=text(ix+half+16+16,dby+22,"DATA DE ENTREGA",9,"#e11d48",weight="bold",ls="0.4")
b+=text(ix+half+16+16,dby+48,"22/06/2026  📅",20,"#be123c",weight="bold")
# tipo de pedido (segmented)
ty=dby+92
b+=text(ix,ty,"TIPO DE PEDIDO",9.5,"#94a3b8",weight="bold",ls="0.6")
opts=[("Único",False),("Único + Pronta Entrega",True),("Parte 1 + Parte 2",False),("P1 + P2 + Pronta Entrega",False),("Estoque",False),("Pronta Entrega",False)]
ox=ix; oy=ty+12
for lab,sel in opts:
    ow=24+len(lab)*6.8
    if ox+ow>ix+iw: ox=ix; oy+=44
    if sel: b+=rect(ox,oy,ow,34,"url(#g_brand)",rx=9)+text(ox+ow/2,oy+22,lab,12,"#fff",weight="bold",anchor="middle")
    else: b+=rect(ox,oy,ow,34,"#ffffff",rx=9,stroke="#e2e8f0")+text(ox+ow/2,oy+22,lab,12,"#475569",anchor="middle")
    ox+=ow+10
# helper do tipo selecionado
hny=oy+44
b+=rect(ix,hny,iw,30,"#ecfdf5",rx=8,stroke="#a7f3d0")
b+=text(ix+12,hny+20,"ℹ  Único + Pronta Entrega: o pedido único produz normalmente e os itens de Pronta Entrega (não produzem) saem junto.",10.5,"#047857",weight="bold")
oy=hny
# itens
ity=oy+58
b+=text(ix,ity,"ITENS DO PEDIDO",9.5,"#94a3b8",weight="bold",ls="0.6")
b+=rect(rx+rw-28-150,ity-18,150,26,"#eef2ff",rx=8)+text(rx+rw-28-75,ity,"+ Adicionar item",11.5,"#4338ca",weight="bold",anchor="middle")
# table header
thy=ity+18
cols=[("PRODUTO",230),("REF",80),("COR / GRADE",150),("QTD",70),("PARTE",110)]
cx=ix
for t,w in cols:
    b+=text(cx,thy+14,t,9.5,"#94a3b8",weight="bold"); cx+=w
b+=rect(ix,thy+22,iw,1,"#eef0f4")
rows=[("Blusa Tricô","BT12","Off-white · P-M-G","150","Único","#f1f5f9","#475569"),
      ("Echarpe","EC09","Bege · Único","40","Pronta Entrega","#ecfdf5","#047857"),
      ("Gola Alta","GL02","Preto · P-M","80","Único","#f1f5f9","#475569")]
ryy=thy+30
for prod,ref,cor,qt,parte,pbg,pfg in rows:
    b+=text(ix,ryy+20,prod,12.5,"#0f172a",weight="bold")
    b+=text(ix+230,ryy+20,ref,12,"#475569")
    b+=text(ix+310,ryy+20,cor,12,"#475569")
    b+=rect(ix+460,ryy+4,52,24,"#ffffff",rx=6,stroke="#e2e8f0")+text(ix+486,ryy+21,qt,12,"#0f172a",weight="bold",anchor="middle")
    pw=14+len(parte)*6.2
    b+=rect(ix+530,ryy+4,pw,24,pbg,rx=8)+text(ix+530+pw/2,ryy+21,parte,11,pfg,weight="bold",anchor="middle")
    b+=rect(ix,ryy+34,iw,1,"#f3f4f8")
    ryy+=44
# footer actions
fy=ry+rh-66
b+=rect(rx,fy-14,rw,80,"#fafbfc",rx=16)+rect(rx,fy-14,rw,30,"#fafbfc")
pdf_x=rx+rw-28-300
rasc_x=pdf_x-12-160
b+=rect(ix,fy,120,44,"#ffffff",rx=10,stroke="#e2e8f0")+text(ix+60,fy+28,"Cancelar",13,"#475569",weight="bold",anchor="middle")
b+=rect(rasc_x,fy,160,44,"#ffffff",rx=10,stroke="#cbd5e1")+text(rasc_x+80,fy+28,"Salvar rascunho",12.5,"#334155",weight="bold",anchor="middle")
b+=rect(pdf_x,fy,300,44,"url(#g_brand)",rx=10)+text(pdf_x+150,fy+28,"🔒 Conferir e gerar PDF padrão",12.5,"#fff",weight="bold",anchor="middle")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"25-criar-pedido.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.4",os.path.join(OUT_SVG,"25-criar-pedido.svg"),"-o",os.path.join(OUT_PNG,"25-criar-pedido.png")],check=True)
print("OK criar-pedido")
