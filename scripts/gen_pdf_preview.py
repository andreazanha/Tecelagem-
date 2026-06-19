# -*- coding: utf-8 -*-
import os, subprocess, base64
OUT_SVG="docs/prototipo/svg"; OUT_PNG="docs/prototipo"
_p=os.path.abspath(os.path.join(OUT_PNG,"51-relatorio-individual-pdf.png"))
ABS="data:image/png;base64,"+base64.b64encode(open(_p,"rb").read()).decode()
def esc(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1,filt=None,op=None):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'
    if stroke: s+=f' stroke="{stroke}" stroke-width="{sw}"'
    if op is not None: s+=f' fill-opacity="{op}"'
    if filt: s+=f' filter="url(#{filt})"'
    return s+'/>'
def text(x,y,s,size=13,fill="#0f172a",weight="normal",anchor="start",ls=None):
    extra=f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{extra}>{esc(s)}</text>'
def circle(cx,cy,r,fill): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
def image(x,y,w,h,href): return f'<image x="{x}" y="{y}" width="{w}" height="{h}" xlink:href="{href}" preserveAspectRatio="xMidYMid meet"/>'
DEFS=('<defs><linearGradient id="g_brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>'
 '<filter id="mod" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="30" flood-color="#0f172a" flood-opacity="0.35"/></filter>'
 '<filter id="dlg" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="34" flood-color="#0b1020" flood-opacity="0.45"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')

W,H=1520,980
b=rect(0,0,W,56,"url(#g_brand)")+text(24,35,"BIG TRICOT",17,"#fff",weight="bold",ls="0.5")+text(W-24,35,"Romaneios › Financeiro",12.5,"#e0e7ff",anchor="end")
b+=rect(0,56,W,H-56,"#e8eaef")

# ---- modal visualizador ----
mx,my,mw,mh=110,86,1300,852
b+=rect(mx,my,mw,mh,"#ffffff",rx=16,filt="mod")
# toolbar
tb=58
b+=rect(mx,my,mw,tb,"#1f2430",rx=16)+rect(mx,my+tb-16,mw,16,"#1f2430")
b+=text(mx+22,my+36,"📄  Resumo-SILVIA-Junho-2026.pdf",14,"#fff",weight="bold")
# centro: zoom/page
cxm=mx+mw/2
b+=rect(cxm-150,my+14,300,30,"#2c3340",rx=8)
b+=text(cxm-130,my+34,"−",16,"#cbd5e1")+text(cxm-95,my+34,"100%",12,"#e5e7eb",weight="bold")+text(cxm-55,my+34,"+",15,"#cbd5e1")
b+=text(cxm+10,my+34,"|  Página 1 de 1",11.5,"#9aa3b2")
# direita: botões
bx=mx+mw-22
# baixar (primary)
bw=150; bx-=bw
b+=rect(bx,my+13,bw,32,"url(#g_brand)",rx=8)+text(bx+bw/2,my+34,"⬇  Baixar PDF",12.5,"#fff",weight="bold",anchor="middle")
# visualizar (ativo)
bw2=130; bx-=bw2+10
b+=rect(bx,my+13,bw2,32,"#2c3340",rx=8,stroke="#4f46e5",sw=1.5)+text(bx+bw2/2,my+34,"👁  Visualizar",12.5,"#c7d2fe",weight="bold",anchor="middle")
# imprimir
bx-=44
b+=text(bx,my+34,"🖨",16,"#cbd5e1")
# área de preview (cinza com documento centralizado)
pvy=my+tb
b+=rect(mx,pvy,mw,mh-tb,"#525a6b",rx=0)+rect(mx,mh+my-16,mw,16,"#525a6b")
# documento (embed do PDF do resumo)
dw=560; dh=int(dw*1260/1200)  # ratio do 51
ddx=mx+mw/2-dw/2; ddy=pvy+24
b+=rect(ddx-6,ddy-6,dw+12,dh+12,"#000000",op=0.18,rx=4)
b+=rect(ddx,ddy,dw,dh,"#ffffff")
b+=image(ddx,ddy,dw,dh,ABS)
# scrollbar
b+=rect(mx+mw-12,pvy+20,6,180,"#a8b0bd",rx=3)

# ---- diálogo salvar (escolher diretório) ----
b+=rect(mx,my+tb,mw,mh-tb,"#0b1020",op=0.45)  # dim
dx,dy,dw2,dh2=470,250,580,470
b+=rect(dx,dy,dw2,dh2,"#ffffff",rx=14,filt="dlg")
b+=rect(dx,dy,dw2,52,"#f1f3f7",rx=14)+rect(dx,dy+36,dw2,16,"#f1f3f7")
b+=text(dx+20,dy+33,"Salvar PDF como…",15,"#0f172a",weight="bold")
b+=circle(dx+dw2-26,dy+26,13,"#e5e7eb")+text(dx+dw2-26,dy+31,"✕",13,"#475569",anchor="middle")
# sidebar acesso rápido
sbx=dx+14; sby=dy+66
b+=rect(sbx,sby,170,dh2-150,"#f8fafc",rx=10,stroke="#eef0f4")
b+=text(sbx+14,sby+24,"Acesso rápido",10,"#94a3b8",weight="bold",ls="0.4")
qf=[("🖥","Área de Trabalho",False),("⬇","Downloads",False),("📄","Documentos",False),("⭐","Relatórios Big Tricot",True)]
qy=sby+40
for ic,nm,sel in qf:
    if sel: b+=rect(sbx+8,qy-16,154,28,"#eef2ff",rx=8)
    b+=text(sbx+18,qy+3,ic,12,"#475569")+text(sbx+40,qy+3,nm,11.5,"#1d4ed8" if sel else "#334155",weight="bold" if sel else "normal")
    qy+=34
# main: breadcrumb + pastas
mnx=dx+196; mny=dy+66; mnw=dw2-196-14
b+=rect(mnx,mny,mnw,28,"#ffffff",rx=8,stroke="#e2e8f0")+text(mnx+12,mny+19,"📁 Documentos › Relatórios Big Tricot",11,"#475569")
b+=rect(mnx,mny+38,mnw,170,"#ffffff",rx=10,stroke="#eef0f4")
folders=[("📁","2026-06",""),("📁","Costureiras",""),("📁","Mensal",""),("📄","Resumo-CRIS-Junho-2026.pdf","ontem")]
fy=mny+38
for ic,nm,meta in folders:
    b+=text(mnx+16,fy+26,ic,13,"#64748b")+text(mnx+42,fy+26,nm,12,"#0f172a",weight="bold" if ic=="📁" else "normal")
    if meta: b+=text(mnx+mnw-16,fy+26,meta,10.5,"#94a3b8",anchor="end")
    b+=rect(mnx+10,fy+40,mnw-20,1,"#f3f4f8")
    fy+=42
# nome + tipo
ny=mny+222
b+=text(mnx,ny,"Nome do arquivo",9.5,"#94a3b8",weight="bold")
b+=rect(mnx,ny+8,mnw,38,"#ffffff",rx=8,stroke="#4f46e5",sw=1.5)+text(mnx+12,ny+33,"Resumo-SILVIA-Junho-2026.pdf",12.5,"#0f172a",weight="bold")
b+=text(mnx,ny+70,"Tipo",9.5,"#94a3b8",weight="bold")
b+=rect(mnx,ny+78,mnw,34,"#ffffff",rx=8,stroke="#e2e8f0")+text(mnx+12,ny+101,"Documento PDF (*.pdf)  ▾",12,"#334155")
# footer botões
fyy=dy+dh2-58
b+=rect(dx,fyy,dw2,58,"#fafbfc",rx=14)+rect(dx,fyy,dw2,20,"#fafbfc")
b+=rect(dx+dw2-260,fyy+12,110,36,"#ffffff",rx=8,stroke="#cbd5e1")+text(dx+dw2-205,fyy+35,"Cancelar",12.5,"#475569",weight="bold",anchor="middle")
b+=rect(dx+dw2-140,fyy+12,120,36,"url(#g_brand)",rx=8)+text(dx+dw2-80,fyy+35,"💾 Salvar",12.5,"#fff",weight="bold",anchor="middle")

b+=text(110,H-14,"Fluxo: 👁 Visualizar o PDF na tela → ⬇ Baixar PDF → escolher o diretório (Salvar como). O nome do arquivo já vem sugerido.",11.5,"#64748b")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"52-pdf-preview.svg"),"w").write(svg(W,H,b))
subprocess.run(["rsvg-convert","-z","1.2",os.path.join(OUT_SVG,"52-pdf-preview.svg"),"-o",os.path.join(OUT_PNG,"52-pdf-preview.png")],check=True)
print("OK pdf preview")
