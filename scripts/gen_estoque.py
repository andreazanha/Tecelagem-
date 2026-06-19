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
GRADS={"est":("#d97706","#f59e0b"),"kit":("#0891b2","#06b6d4"),"pe":("#059669","#10b981"),
       "pv":("#2563eb","#3b82f6"),"uni":("#475569","#64748b"),"brand":("#4f46e5","#7c3aed")}
def gdefs(): return "".join(f'<linearGradient id="g_{k}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>' for k,(a,b) in GRADS.items())
DEFS=('<defs>'+gdefs()+'<filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%">'
 '<feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/></filter>'
 '<filter id="ph" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="22" flood-color="#0f172a" flood-opacity="0.22"/></filter></defs>')
def svg(w,h,body,bg="#f6f7f9"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif">'+DEFS+rect(0,0,w,h,bg)+body+'</svg>')
def avatar(cx,cy,r,ini,fill): return circle(cx,cy,r,fill)+text(cx,cy+r*0.35,ini,r*0.78,"#fff",weight="bold",anchor="middle")
TLBL={"est":"ESTOQUE","kit":"KIT","pe":"PRONTA ENTREGA","pv":"PEDIDO VENDA","uni":"ÚNICO"}
def btn(x,y,w,label,col,h=30,fs=11):
    return rect(x,y,w,h,col,rx=8)+text(x+w/2,y+h*0.64,label,fs,"#fff",weight="bold",anchor="middle")
def header(s,x,y,cw,tkey,code):
    hh=34
    s+=rect(x,y,cw,hh,f"url(#g_{tkey})",rx=14)+rect(x,y+hh-14,cw,14,f"url(#g_{tkey})")
    s+=text(x+14,y+22,code,12.5,"#fff",weight="bold",ls="0.3")
    tl=TLBL[tkey]; tw=12+len(tl)*5.8
    s+=rect(x+cw-14-tw,y+8,tw,17,"#ffffff33",rx=8)+text(x+cw-14-tw/2,y+20,tl,8.5,"#fff",weight="bold",anchor="middle")
    return s,hh

def entrada_card(x,y,cw,tkey,code,product,kit,size,color,qty,entered=False):
    ch=210; s=rect(x,y,cw,ch,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
    s,hh=header(s,x,y,cw,tkey,code)
    s+=text(x+14,y+hh+24,product,14.5,"#0f172a",weight="bold")
    # grid 2x2
    gx=x+14; gy=y+hh+38; gw=(cw-28-10)/2
    cells=[("KIT",kit),("TAMANHO",size),("COR",color),("QTD",f"{qty} pç")]
    for i,(lab,val) in enumerate(cells):
        cxp=gx+(i%2)*(gw+10); cyp=gy+(i//2)*40
        s+=rect(cxp,cyp,gw,34,"#f8fafc",rx=8,stroke="#eef0f4")
        s+=text(cxp+10,cyp+14,lab,7.5,"#94a3b8",weight="bold",ls="0.4")+text(cxp+10,cyp+28,val,11.5,"#0f172a",weight="bold")
    # whatsapp note
    ny=gy+88
    s+=rect(x+14,ny,cw-28,30,"#ecfdf5",rx=8,stroke="#a7f3d0")
    s+=text(x+24,ny+19,"📲 Ao dar entrada, avisa os representantes no WhatsApp",10,"#047857",weight="bold")
    if entered:
        s+=rect(x+14,y+ch-38,cw-28,30,"#f1f5f9",rx=8,stroke="#e2e8f0")+text(x+(cw)/2,y+ch-18,"✓ Em estoque · representantes avisados 09:12",10.5,"#475569",weight="bold",anchor="middle")
    else:
        s+=btn(x+14,y+ch-38,cw-28,"📥 Dar entrada no estoque  →  📲 avisar","#10b981",fs=11)
    return s

def separar_card(x,y,cw,tkey,code,client,product,qty,unionOP):
    ch=178; s=rect(x,y,cw,ch,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")
    s,hh=header(s,x,y,cw,tkey,code)
    s+=text(x+14,y+hh+24,client,14,"#0f172a",weight="bold")
    s+=text(x+14,y+hh+42,f"{product} · {qty} pç",11,"#64748b")
    ny=y+hh+52
    s+=rect(x+14,ny,cw-28,42,"#eef2ff",rx=8,stroke="#c7d2fe")
    s+=text(x+24,ny+17,"🔗 UNE NA REVISÃO",8,"#4338ca",weight="bold",ls="0.4")
    s+=text(x+24,ny+34,f"vai se juntar ao card {unionOP} (P1+P2)",10.5,"#4338ca",weight="bold")
    s+=btn(x+14,y+ch-38,cw-28,"✂️ Separar  →  Revisão","#2563eb",fs=11)
    return s

def board():
    W,H=1640,940
    b=rect(0,0,W,60,"url(#g_brand)")
    b+=text(28,38,"BIG TRICOT",18,"#fff",weight="bold",ls="0.5")+circle(150,30,3,"#c7d2fe")+text(168,38,"Rolagem de Fase",13,"#e0e7ff")
    b+=rect(W-470,16,250,28,"#ffffff26",rx=14)+text(W-452,34,"🔎  Buscar produto, kit, cor…",12,"#e0e7ff")
    b+=text(W-200,38,"Rê Estoque",13,"#fff",anchor="end")+avatar(W-176,30,15,"RE","#fbbf24")
    b+=rect(0,60,230,H-60,"#0f1629")+text(26,98,"Big Tricot",15,"#fff",weight="bold")+text(26,118,"Produção",10.5,"#5b6478",ls="1")
    nav=[("◧","Visão geral",False),("🏭","Produção",False),("🗃️","Estoque",True),("🔎","Revisão",False),("📦","Expedição",False)]
    y=150
    for ic,label,act in nav:
        if act: b+=rect(14,y-22,202,38,"#6366f11f",rx=10)+rect(14,y-22,3,38,"#fbbf24",rx=2)+text(34,y+3,ic,13,"#fde68a")+text(58,y+3,label,13.5,"#fff",weight="bold")
        else: b+=text(34,y+3,ic,13,"#7b8499")+text(58,y+3,label,13.5,"#aeb6c7")
        y+=44
    b+=text(258,96,"Estoque",24,"#0f172a",weight="bold")+text(258,118,"Produção  ›  Estoque",12,"#94a3b8")
    b+=text(258,150,"Dar entrada avisa os representantes no WhatsApp. Separar (vendas / pronta entrega) envia o item à Revisão p/ unir com o P1+P2.",12,"#475569")
    kpis=[("Para dar entrada","3","#f59e0b"),("Avisados hoje","7","#10b981"),("A separar (vendas)","2","#2563eb"),("PE p/ unir","1","#059669")]
    x=258
    for l,n,c in kpis:
        b+=rect(x,170,250,60,"#ffffff",rx=14,stroke="#eef0f4",filt="cardShadow")+rect(x,182,4,32,c,rx=2)+text(x+20,206,n,22,"#0f172a",weight="bold")+text(x+20,223,l,11.5,"#64748b")
        x+=264
    cols=[("Entrada no Estoque","dar entrada → avisa WhatsApp","est"),
          ("Pedido de Vendas — Separar","separar do estoque → Revisão","pv"),
          ("Pronta Entrega + Estoque (juntos)","separar p/ unir na Revisão","pe")]
    x0=258; cw=430; gap=18; ytop=250; colh=H-ytop-30
    TINT={"est":("#fff7ed","#f59e0b","#b45309"),"pv":("#eff6ff","#3b82f6","#1d4ed8"),"pe":("#ecfdf5","#10b981","#047857")}
    for ci,(title,sub,key) in enumerate(cols):
        x=x0+ci*(cw+gap); bgt,dot,fg=TINT[key]
        b+=rect(x,ytop,cw,colh,"#f1f3f7",rx=16)
        b+=rect(x,ytop,cw,52,bgt,rx=16)+rect(x,ytop+36,cw,16,bgt)
        b+=circle(x+20,ytop+26,5,dot)+text(x+34,ytop+24,title,12.5,fg,weight="bold")+text(x+34,ytop+40,sub,10,fg)
        cnt={"est":3,"pv":2,"pe":1}[key]
        b+=rect(x+cw-40,ytop+15,26,22,"#ffffffcc",rx=11)+text(x+cw-27,ytop+30,str(cnt),12,fg,weight="bold",anchor="middle")
        cy=ytop+64
        if key=="est":
            b+=entrada_card(x+14,cy,cw-28,"kit","KIT-0996","Cachecol CC07","KIT-0996","Único","Cinza mescla","120"); cy+=222
            b+=entrada_card(x+14,cy,cw-28,"est","EST-2001","Touca TC01","—","Único","Preto","200"); cy+=222
            b+=entrada_card(x+14,cy,cw-28,"kit","KIT-0985","Luva LV02","KIT-0985","M","Bege","60",entered=True)
        elif key=="pv":
            b+=separar_card(x+14,cy,cw-28,"pv","PV-3050","Loja K","Blusa BT12","30","OP-1042"); cy+=190
            b+=separar_card(x+14,cy,cw-28,"pv","PV-3051","Cliente B","Cachecol CC07","20","OP-0995")
        else:
            b+=separar_card(x+14,cy,cw-28,"pe","OP-0990","Atacado D","Echarpe EC09 (PE)","40","OP-0990")
    b+=text(258,H-12,"As colunas e os nomes são configuráveis. Separar move o item para a Revisão, onde ele se reúne ao pedido P1+P2 para seguirem juntos.",11.5,"#94a3b8")
    return svg(W,H,b)

def whatsapp():
    W,H=760,940
    b=rect(0,0,W,H,"#e9edef")
    # phone
    pw,ph=440,800; px=(W-pw)/2; py=70
    b+=rect(px,py,pw,ph,"#0b141a",rx=38,filt="ph")
    sx,sy,sw,sh=px+12,py+12,pw-24,ph-24
    b+=rect(sx,sy,sw,sh,"#0b141a",rx=28)
    # whatsapp header
    b+=rect(sx,sy,sw,72,"#202c33",rx=28)+rect(sx,sy+40,sw,32,"#202c33")
    b+=text(sx+20,sy+30,"‹",22,"#aebac1")
    b+=avatar(sx+58,sy+36,18,"BT","#25d366")
    b+=text(sx+86,sy+32,"Representantes Big Tricot",13.5,"#e9edef",weight="bold")+text(sx+86,sy+50,"você, Marcos, Paula, +18",10.5,"#8696a0")
    b+=text(sx+sw-44,sy+40,"📞",15,"#aebac1")+text(sx+sw-22,sy+40,"⋮",16,"#aebac1",anchor="end")
    # chat area
    cy0=sy+72
    b+=rect(sx,cy0,sw,sh-72-58,"#0b141a")
    # date chip
    b+=rect(sx+sw/2-40,cy0+16,80,22,"#182229",rx=11)+text(sx+sw/2,cy0+31,"HOJE",10,"#8696a0",weight="bold",anchor="middle")
    # outgoing bubble (green)
    bx=sx+40; by=cy0+52; bw=sw-70
    lines=[("*Atenção, atualização de estoque!* 🧶","b",13),
           ("Novo item disponível:","n",12.5),
           ("• Produto:  Cachecol CC07","n",12.5),
           ("• Kit:  KIT-0996","n",12.5),
           ("• Tamanho:  Único","n",12.5),
           ("• Cor:  Cinza mescla","n",12.5),
           ("• Quantidade:  120 pç","n",12.5),
           ("Já disponível para venda imediata.","n",12.5),
           ("Fale com seu contato comercial! 📦","n",12.5)]
    bh=24+len(lines)*22+14
    b+=rect(bx,by,bw,bh,"#005c4b",rx=14)
    # little tail
    b+=f'<path d="M {bx+bw} {by+8} l 12 0 l -12 12 z" fill="#005c4b"/>'
    ty=by+26
    for txt,st,sz in lines:
        if st=="b": b+=text(bx+16,ty,txt.replace("*",""),sz,"#e9edef",weight="bold")
        else: b+=text(bx+16,ty,txt,sz,"#e9edef")
        ty+=22
    b+=text(bx+bw-16,by+bh-10,"09:12  ✓✓",10,"#8aa9a0",anchor="end")
    # input bar
    iby=sy+sh-50
    b+=rect(sx+14,iby,sw-92,38,"#2a3942",rx=19)+text(sx+34,iby+24,"Mensagem",12,"#8696a0")
    b+=circle(sx+sw-32,iby+19,19,"#25d366")+text(sx+sw-32,iby+24,"➤",14,"#0b141a",anchor="middle")
    # caption
    b+=text(W/2,40,"Mensagem automática enviada ao grupo ao dar entrada no estoque",13,"#0f172a",weight="bold",anchor="middle")
    b+=text(W/2,H-22,"O produto, kit, tamanho e cor vêm do PDF gerado do pedido. Texto/frases são configuráveis.",11,"#64748b",anchor="middle")
    return svg(W,H,b,bg="#e9edef")

os.makedirs(OUT_SVG,exist_ok=True)
open(os.path.join(OUT_SVG,"41-setor-estoque.svg"),"w").write(board())
subprocess.run(["rsvg-convert","-z","1.3",os.path.join(OUT_SVG,"41-setor-estoque.svg"),"-o",os.path.join(OUT_PNG,"41-setor-estoque.png")],check=True)
open(os.path.join(OUT_SVG,"42-whatsapp-estoque.svg"),"w").write(whatsapp())
subprocess.run(["rsvg-convert","-z","1.4",os.path.join(OUT_SVG,"42-whatsapp-estoque.svg"),"-o",os.path.join(OUT_PNG,"42-whatsapp-estoque.png")],check=True)
print("OK estoque + whatsapp")
