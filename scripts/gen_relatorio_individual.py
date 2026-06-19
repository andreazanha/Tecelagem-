# -*- coding: utf-8 -*-
import os, subprocess
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,op=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if op is not None: s+=f' fill-opacity="{op}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def line(x1,y1,x2,y2,stroke,sw=1):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
def avatar(cx,cy,r,ini,fill,fg="#fff"): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.8,fg,weight="bold",anchor="middle")
def chip(x,y,label,bg,fg,fs=9.5,h=19):
    w=14+len(label)*5.8
    return rect(x,y,w,h,bg,rx=h/2)+text(x+7,y+h*0.69,label,fs,fg,weight="bold"),w
DEFS=('<defs>'
 '<linearGradient id="g_brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<filter id="paper" x="-15%" y="-6%" width="130%" height="112%"><feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.20"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

W,H=820,1200
b=text(W/2,28,"Relatório Individual por Costureira — PDF (1 por costureira)",12.5,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=60,46,700,1130
b+=rect(px,py,pw,ph,"#ffffff",rx=8,filt="paper")
ix=px+40; iw=pw-80

# header band
hh=116
b+=rect(px,py,pw,hh,"url(#g_brand)",rx=8)+rect(px,py+hh-20,pw,20,"url(#g_brand)")
b+=text(ix,py+44,"BIG TRICOT",22,"#fff",weight="bold",ls="0.5")
b+=text(ix,py+66,"Demonstrativo Individual de Costura",12,"#e0e7ff")
b+=rect(px+pw-40-130,py+28,130,24,"#ffffff2e",rx=12)+text(px+pw-40-65,py+44,"JUNHO / 2026",10.5,"#fff",weight="bold",anchor="middle")
b+=text(px+pw-40,py+86,"Período: 01–30/06/2026",11.5,"#e0e7ff",anchor="end")

# costureira info card
cy=py+hh+18
b+=rect(ix,cy,iw,64,"#f8fafc",rx=12,stroke="#eef0f4")
b+=avatar(ix+38,cy+32,22,"CR","#3b82f6")
b+=text(ix+74,cy+28,"Cris",17,"#0f172a",weight="bold")
c,w=chip(ix+74,cy+38,"Interna","#eef2ff","#4338ca"); b+=c
c2,w2=chip(ix+74+w+8,cy+38,"Costureira ativa","#ecfdf5","#047857"); b+=c2
b+=text(ix+iw-16,cy+28,"Contato: (00) 0 0000-0000",10.5,"#64748b",anchor="end")
b+=text(ix+iw-16,cy+48,"Romaneios no mês: 4",10.5,"#64748b",anchor="end")

# KPIs
ky=cy+64+16; kw=(iw-3*12)/4
kpis=[("Devolvidos","3","#10b981"),("Peças/serviços","134","#6366f1"),("A pagar (liberado)","R$ 700","#10b981"),("Bloqueado","R$ 135","#ef4444")]
for i,(l,n,c) in enumerate(kpis):
    kx=ix+i*(kw+12)
    b+=rect(kx,ky,kw,64,"#ffffff",rx=12,stroke="#eef0f4")+rect(kx,ky+12,4,40,c,rx=2)
    b+=text(kx+14,ky+32,n,18,"#0f172a",weight="bold")+text(kx+14,ky+51,l,10,"#64748b")

# tabela romaneios
def sectitle(yy,txt,accent):
    return rect(ix,yy-12,4,18,accent,rx=2)+text(ix+14,yy+3,txt,13,"#0f172a",weight="bold")
ty=ky+64+34
b+=sectitle(ty,"Romaneios do mês","#6366f1")
ty+=18
b+=rect(ix,ty,iw,30,"#f1f5f9",rx=8)
cols=[("Nº",ix+12),("PEDIDO",ix+80),("SAÍDA",ix+185),("RETORNO",ix+260),("SERVIÇOS / QTD",ix+350),("VALOR",ix+iw-110),("STATUS",ix+iw-12)]
for t,hx in cols:
    an="end" if t in("VALOR","STATUS") else "start"
    b+=text(hx,ty+20,t,8.5,"#94a3b8",weight="bold",ls="0.2",anchor=an)
rows=[("R-150","OP-0900","03/06","10/06","Costurar 45","R$ 135,00","ok"),
      ("R-168","OP-0925","09/06","16/06","Peseiras/Mantas 49","R$ 245,00","ok"),
      ("R-190","OP-0955","14/06","21/06","Almofadas/Capas 40","R$ 320,00","ok"),
      ("R-210","OP-0980","02/06","—","Costurar 45","R$ 135,00","blk")]
ry=ty+30
for i,(num,ped,sai,ret,serv,vl,st) in enumerate(rows):
    if st=="blk": b+=rect(ix,ry,iw,32,"#fff5f5",rx=6,stroke="#fecaca")
    elif i%2==0: b+=rect(ix,ry,iw,32,"#fafbfc")
    b+=text(ix+12,ry+21,num,11.5,"#0f172a",weight="bold")
    b+=text(ix+80,ry+21,ped,11,"#475569")
    b+=text(ix+185,ry+21,sai,11,"#475569")
    b+=text(ix+260,ry+21,ret,11,"#dc2626" if ret=="—" else "#475569",weight="bold" if ret=="—" else "normal")
    b+=text(ix+350,ry+21,serv,11,"#334155")
    b+=text(ix+iw-110,ry+21,vl,11.5,"#0f172a",weight="bold",anchor="end")
    if st=="ok": c,w=chip(ix+iw-12-58,ry+7,"Devolvido","#ecfdf5","#047857")
    else: c,w=chip(ix+iw-12-58,ry+7,"Bloqueado","#fef2f2","#dc2626")
    b+=c
    ry+=32
# subtotais
b+=rect(ix,ry+6,iw,28,"#ecfdf5",rx=8)
b+=text(ix+14,ry+25,"Subtotal LIBERADO (3 romaneios devolvidos)",11,"#047857",weight="bold")
b+=text(ix+iw-14,ry+25,"R$ 700,00",13,"#047857",weight="bold",anchor="end")
ry+=34
b+=rect(ix,ry+6,iw,26,"#fff5f5",rx=8)
b+=text(ix+14,ry+24,"Bloqueado — não voltou até 31 (não entra no pagamento)",10.5,"#b91c1c",weight="bold")
b+=text(ix+iw-14,ry+24,"R$ 135,00",12,"#b91c1c",weight="bold",anchor="end")
ry+=32+20

# resumo por serviço
b+=sectitle(ry,"Resumo por serviço (liberado)","#a855f7")
ry+=18
serv=[("Costurar","45 pç","R$ 3,00","R$ 135,00"),
      ("Peseiras / Mantas","49","R$ 5,00","R$ 245,00"),
      ("Almofadas / Capas","40","R$ 8,00","R$ 320,00")]
b+=rect(ix,ry,iw,26,"#f1f5f9",rx=6)
for t,hx in [("SERVIÇO",ix+12),("QTD",ix+260),("UNIT.",ix+360),("SUBTOTAL",ix+iw-12)]:
    b+=text(hx,ry+18,t,8.5,"#94a3b8",weight="bold",anchor="end" if t=="SUBTOTAL" else "start")
ry+=26
for nm,q,u,sub in serv:
    b+=text(ix+12,ry+19,nm,11.5,"#0f172a",weight="bold")+text(ix+260,ry+19,q,11,"#475569")+text(ix+360,ry+19,u,11,"#475569")+text(ix+iw-12,ry+19,sub,11.5,"#0f172a",weight="bold",anchor="end")
    b+=line(ix,ry+28,ix+iw,ry+28,"#f1f5f9",1); ry+=30

# recibo / assinatura
ry+=14
b+=rect(ix,ry,iw,86,"#fffdf5",rx=12,stroke="#fde68a")
b+=text(ix+16,ry+26,"RECIBO",9.5,"#92400e",weight="bold",ls="0.5")
b+=text(ix+16,ry+48,"Recebi a importância de R$ 700,00 (setecentos reais) referente aos",11.5,"#334155")
b+=text(ix+16,ry+64,"serviços de costura prestados em Junho/2026.",11.5,"#334155")
b+=line(ix+iw-230,ry+66,ix+iw-16,ry+66,"#0f172a",1)+text(ix+iw-123,ry+80,"Assinatura da costureira",9.5,"#94a3b8",anchor="middle")

# footer
fyy=py+ph-40
b+=line(ix,fyy,ix+iw,fyy,"#eef0f4",1)
b+=text(ix,fyy+20,"Gerado automaticamente · um relatório por costureira · Big Tricot",10,"#94a3b8")
b+=text(px+pw-40,fyy+20,"Cris · 1 de 5",10,"#94a3b8",anchor="end")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"51-relatorio-individual-pdf.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.5",os.path.join(OUT_SVG,"51-relatorio-individual-pdf.svg"),"-o",os.path.join(OUT_PNG,"51-relatorio-individual-pdf.png")],check=True)
print("OK relatorio individual")
