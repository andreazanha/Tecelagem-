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
DEFS=('<defs>'
 '<linearGradient id="g_brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<linearGradient id="g_em" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#059669"/><stop offset="1" stop-color="#10b981"/></linearGradient>'
 '<linearGradient id="g_bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient>'
 '<filter id="paper" x="-15%" y="-6%" width="130%" height="112%"><feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.20"/></filter></defs>')
def svg(w,h,body,bg="#e5e7eb"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

W,H=820,1180
b=text(W/2,30,"Relatório Mensal — PDF",13.5,"#0f172a",weight="bold",anchor="middle")
px,py,pw,ph=60,52,700,1100
b+=rect(px,py,pw,ph,"#ffffff",rx=8,filt="paper")
ix=px+40; iw=pw-80

# ---- header band ----
hh=120
b+=rect(px,py,pw,hh,"url(#g_brand)",rx=8)+rect(px,py+hh-20,pw,20,"url(#g_brand)")
b+=text(ix,py+50,"BIG TRICOT",26,"#fff",weight="bold",ls="0.5")
b+=text(ix,py+74,"Malharia · Produção e Costura",12,"#e0e7ff")
b+=rect(px+pw-40-150,py+30,150,26,"#ffffff2e",rx=13)+text(px+pw-40-75,py+47,"RELATÓRIO MENSAL",10.5,"#fff",weight="bold",anchor="middle")
b+=text(px+pw-40,py+86,"Pagamento de Costura",15,"#fff",weight="bold",anchor="end")
b+=text(px+pw-40,py+106,"Junho / 2026",13,"#e0e7ff",anchor="end")

# ---- subinfo ----
sy=py+hh+24
b+=text(ix,sy,"Emitido em: 01/07/2026 08:00",11,"#64748b")
b+=text(ix+260,sy,"Responsável: Financeiro Big Tricot",11,"#64748b")
b+=text(px+pw-40,sy,"Período: 01–30/06/2026",11,"#64748b",anchor="end")

# ---- KPI cards ----
ky=sy+18; kw=(iw-3*14)/4;
kpis=[("Romaneios","17","#6366f1"),("Costureiras","5","#a855f7"),("Total a pagar","R$ 4.820","#10b981"),("Bloqueado","R$ 435","#ef4444")]
for i,(l,n,c) in enumerate(kpis):
    kx=ix+i*(kw+14)
    b+=rect(kx,ky,kw,68,"#f8fafc",rx=12,stroke="#eef0f4")
    b+=rect(kx,ky+14,4,40,c,rx=2)
    b+=text(kx+16,ky+34,n,19,"#0f172a",weight="bold")
    b+=text(kx+16,ky+54,l,10.5,"#64748b")

# ---- section: gráfico ----
def sectitle(yy,txt,accent="#6366f1"):
    return rect(ix,yy-12,4,18,accent,rx=2)+text(ix+14,yy+3,txt,13,"#0f172a",weight="bold",ls="0.2")
gy=ky+68+38
b+=sectitle(gy,"Valores por costureira","#a855f7")
chart=[("Silvia",980),("Angélica",1140),("Bene",1260),("Nice",740),("Cris",700)]
mx=max(v for _,v in chart); bx=ix+110; bw=iw-110-90
cy=gy+24
for nm,val in chart:
    b+=text(ix,cy+14,nm,11.5,"#334155",weight="bold")
    b+=rect(bx,cy+2,bw,16,"#eef2ff",rx=8)
    b+=rect(bx,cy+2,bw*val/mx,16,"url(#g_bar)",rx=8)
    b+=text(bx+bw+90,cy+15,f"R$ {val:,.0f}".replace(",","."),11.5,"#0f172a",weight="bold",anchor="end")
    cy+=30

# ---- section: tabela pagamento ----
ty=cy+22
b+=sectitle(ty,"Pagamento por costureira (liberado)","#10b981")
ty+=20
b+=rect(ix,ty,iw,30,"#f1f5f9",rx=8)
cols=[("COSTUREIRA",ix+14),("ROMANEIOS",ix+200),("SERVIÇOS",ix+310),("VALOR",ix+iw-14)]
for t,hx in cols: b+=text(hx,ty+20,t,9,"#94a3b8",weight="bold",ls="0.3",anchor="end" if t=="VALOR" else "start")
rows=[("Silvia","3","Capas · Etiquetas","R$ 980,00"),
      ("Angélica","4","Etiquetas · Costura","R$ 1.140,00"),
      ("Bene","5","Costura","R$ 1.260,00"),
      ("Nice","2","Almofadas","R$ 740,00"),
      ("Cris","3","Peseiras/Mantas","R$ 700,00")]
ry=ty+30
for i,(nm,rm,sv,vl) in enumerate(rows):
    if i%2==0: b+=rect(ix,ry,iw,30,"#fafbfc")
    b+=text(ix+14,ry+20,nm,12,"#0f172a",weight="bold")
    b+=text(ix+200,ry+20,rm,12,"#475569")
    b+=text(ix+310,ry+20,sv,11.5,"#475569")
    b+=text(ix+iw-14,ry+20,vl,12,"#0f172a",weight="bold",anchor="end")
    ry+=30
# total row
b+=rect(ix,ry,iw,34,"#ecfdf5",rx=8)
b+=text(ix+14,ry+22,"TOTAL A PAGAR (liberado)",11.5,"#047857",weight="bold")
b+=text(ix+iw-14,ry+22,"R$ 4.820,00",14,"#047857",weight="bold",anchor="end")
ry+=34+24

# ---- section: bloqueados ----
b+=sectitle(ry,"Não liberado — não retornou até o dia 31","#ef4444")
ry+=20
b+=rect(ix,ry,iw,76,"#fff5f5",rx=10,stroke="#fecaca")
b+=text(ix+16,ry+24,"ROMANEIO",9,"#b91c1c",weight="bold")+text(ix+150,ry+24,"COSTUREIRA",9,"#b91c1c",weight="bold")+text(ix+300,ry+24,"MOTIVO",9,"#b91c1c",weight="bold")+text(ix+iw-16,ry+24,"VALOR",9,"#b91c1c",weight="bold",anchor="end")
bl=[("R-210","Cris","Não devolvido até 31/06","R$ 135,00"),("R-205","Nice","Não devolvido até 31/06","R$ 300,00")]
by=ry+30
for num,cost,mot,vl in bl:
    b+=text(ix+16,by+14,num,11.5,"#0f172a",weight="bold")+text(ix+150,by+14,cost,11.5,"#334155")+text(ix+300,by+14,mot,11,"#991b1b")+text(ix+iw-16,by+14,vl,11.5,"#b91c1c",weight="bold",anchor="end")
    by+=22
b+=text(ix,by+18,"Valores bloqueados aparecem no relatório mas NÃO entram no total a pagar do mês.",10,"#94a3b8")

# ---- footer ----
fyy=py+ph-46
b+=line(ix,fyy,ix+iw,fyy,"#eef0f4",1)
b+=text(ix,fyy+22,"Gerado automaticamente pelo sistema Rolagem de Fase · Big Tricot",10,"#94a3b8")
b+=text(px+pw-40,fyy+22,"Página 1 de 1",10,"#94a3b8",anchor="end")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"50-relatorio-mensal-pdf.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.55",os.path.join(OUT_SVG,"50-relatorio-mensal-pdf.svg"),"-o",os.path.join(OUT_PNG,"50-relatorio-mensal-pdf.png")],check=True)
print("OK relatorio pdf")
