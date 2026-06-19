# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,dash=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if dash: s+=f' stroke-dasharray="{dash}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
GRADS={"brand":("#4f46e5","#7c3aed"),"exp":("#0891b2","#0ea5e9")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.12"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill="#22d3ee"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,"#083344",weight="bold",anchor="middle")

W,H=1500,940
b=rect(0,0,W,60,"url(#g_brand)")
b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
b+=text(W-200,38,"Ana Expedição",13,"#fff",anchor="end")+avatar(W-176,30,15,"AE")
b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
nav=[("◧","Visão geral",False),("📦","Expedição",True),("🧾","Fiscal",False),("🚚","Transporte",False),("📋","Romaneios",False)]
y=150
for ic,label,act in nav:
    if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#22d3ee",rx=2)+text(34,y+3,ic,13,"#a5f3fc")+text(58,y+3,label,13.5,"#fff",weight="bold")
    else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
    y+=44
# título
b+=text(258,96,"Formulário de Medidas e Pesos",23,"#0f172a",weight="bold")+text(258,118,"Expedição  ›  OP-0990 · Atacado D · Cardigã CG04",12,"#94a3b8")
b+=rect(258,134,520,26,"#ecfeff",rx=8,stroke="#a5f3fc")+text(272,151,"👁  O Fiscal visualiza este formulário (somente leitura) para cotar o frete.",11,"#0e7490",weight="bold")

# card form
cx,cy0,cw=258,180,1000
ch=560
b+=rect(cx,cy0,cw,ch,"#ffffff",rx=18,stroke="#eef0f4",filt="cardShadow")
# header tira
b+=rect(cx,cy0,cw,8,"url(#g_exp)",rx=18)+rect(cx,cy0+4,cw,4,"url(#g_exp)")

# definição das colunas
pad=28
cols=[("CAIXA / FARDO",170,"sel"),("Nº",80,"c"),("ALTURA (cm)",140,"c"),("LARGURA (cm)",140,"c"),("COMPRIMENTO (cm)",170,"c"),("PESO (kg)",140,"c")]
gap=12
xs=[]; xx=cx+pad
for name,w,kind in cols:
    xs.append((xx,w,name,kind)); xx+=w+gap
delx=xx
# cabeçalho da tabela
hy=cy0+34
b+=rect(cx+pad,hy,cw-2*pad,40,"#f1f5f9",rx=10)
for x,w,name,kind in xs:
    anchor="middle" if kind=="c" else "start"
    tx=x+w/2 if kind=="c" else x+14
    b+=text(tx,hy+25,name,10.5,"#334155",weight="bold",anchor=anchor)

# linhas de dados
rows=[("Caixa","01","40","30","50","8,5"),
      ("Caixa","02","40","30","50","8,0"),
      ("Fardo","03","60","40","30","12,0")]
ry=hy+50; rh=46
for i,(tp,n,a,l,c,p) in enumerate(rows):
    b+=rect(cx+pad,ry,cw-2*pad,rh-8,"#ffffff",rx=10,stroke="#e2e8f0")
    for j,(x,w,name,kind) in enumerate(xs):
        val=[tp,n,a,l,c,p][j]
        if kind=="sel":
            b+=text(x+14,ry+24,val,13,"#0f172a",weight="bold")+text(x+w-16,ry+24,"▾",12,"#94a3b8",anchor="end")
        else:
            b+=text(x+w/2,ry+24,val,13,"#0f172a",weight="bold",anchor="middle")
    # botão remover
    b+=circle(delx+16,ry+19,12,"#fef2f2")+text(delx+16,ry+23,"✕",11,"#ef4444",anchor="middle")
    ry+=rh

# linha em branco (nova) tracejada
b+=rect(cx+pad,ry,cw-2*pad,rh-8,"#fafbff",rx=10,stroke="#c7d2fe",dash="5 4")
for x,w,name,kind in xs:
    ph = "Caixa/Fardo ▾" if kind=="sel" else ""
    if kind=="sel": b+=text(x+14,ry+24,ph,12.5,"#a5b4fc")
    else: b+=text(x+w/2,ry+24,"—",12.5,"#cbd5e1",anchor="middle")
ry+=rh

# botão adicionar linha
b+=rect(cx+pad,ry+2,200,36,"#eef2ff",rx=10,stroke="#c7d2fe")+text(cx+pad+18,ry+25,"＋  Adicionar linha",13,"#4338ca",weight="bold")

# totais
ty=ry+58
b+=rect(cx+pad,ty,cw-2*pad,56,"#f8fafc",rx=12,stroke="#e5e7eb")
b+=text(cx+pad+20,ty+34,"TOTAIS",10,"#94a3b8",weight="bold",ls="0.6")
b+=circle(cx+pad+150,ty+28,4,"#0891b2")+text(cx+pad+162,ty+33,"Volumes: 3",13.5,"#0f172a",weight="bold")
b+=circle(cx+pad+320,ty+28,4,"#7c3aed")+text(cx+pad+332,ty+33,"Peso total: 28,5 kg",13.5,"#0f172a",weight="bold")
b+=text(cx+cw-pad-16,ty+33,"medidas usadas pelo Fiscal p/ cotar frete",11,"#94a3b8",anchor="end")

# footer ações
fy=cy0+ch-58
b+=rect(cx+pad,fy,150,42,"#ffffff",rx=10,stroke="#e2e8f0")+text(cx+pad+75,fy+27,"Cancelar",13,"#475569",weight="bold",anchor="middle")
b+=rect(cx+cw-pad-300,fy,300,42,"url(#g_exp)",rx=10)+text(cx+cw-pad-150,fy+27,"💾  Salvar e enviar ao Fiscal",13,"#fff",weight="bold",anchor="middle")

b+=text(258,H-22,"Cada linha = 1 volume (caixa ou fardo). A Expedição preenche; o Fiscal só lê para cotar o frete e emitir a NF.",11.5,"#94a3b8")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"32-form-expedicao.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.4",os.path.join(OUT_SVG,"32-form-expedicao.svg"),"-o",os.path.join(OUT_PNG,"32-form-expedicao.png")],check=True)
print("OK form expedicao")
