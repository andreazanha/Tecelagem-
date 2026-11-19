// Big Tricot Desktop — "casco" nativo (Tauri 2) que abre o sistema web completo
// (https://sistema.bigtricot.com.br) dentro de uma janela própria do Windows.
//
// Regras de navegação ("tudo dentro do app", nada abre Chrome/Edge):
//   • Páginas do Big Tricot (mesmo host, *.bigtricot.com.br, *.workers.dev, localhost)
//     abrem DENTRO da janela.
//   • Qualquer outro endereço (link externo) é BARRADO na janela e aberto no navegador
//     padrão do sistema — comportamento seguro e previsível.
//   • window.open(url) e <a target="_blank"> são tratados por um script injetado (ver NAV_SCRIPT):
//     URL interna → sobreposição interna (iframe por cima do sistema, com botão Fechar);
//     janela em branco pra escrever+imprimir → iframe escondido (imprime dentro do app).

use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

// Endereço inicial do sistema (a versão web continua existindo normalmente).
const URL_INICIAL: &str = "https://sistema.bigtricot.com.br/";

// Host que faz parte do Big Tricot (abre dentro do app). Qualquer outro vai pro navegador do SO.
fn host_interno(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    h.is_empty()
        || h == "bigtricot.com.br"
        || h.ends_with(".bigtricot.com.br")
        || h.ends_with(".workers.dev") // staging/preview
        || h == "localhost"
        || h == "127.0.0.1"
}

// Script injetado em TODA página (roda antes do site). Mantém a navegação dentro do app:
//  - marca que está rodando no app (window.__BIG_TRICOT_DESKTOP__);
//  - window.open(url) interno → sobreposição com iframe (não perde a tela atual);
//  - window.open("") (escrever HTML + imprimir) → iframe escondido que imprime no app;
//  - cliques em <a target="_blank"> → mesma lógica do window.open.
// Links externos caem no on_navigation (Rust) e abrem no navegador do sistema.
const NAV_SCRIPT: &str = r#"
(function(){
  if (window.__BIG_TRICOT_DESKTOP__) return;
  window.__BIG_TRICOT_DESKTOP__ = true;
  try { document.documentElement.setAttribute('data-bigtricot-app','1'); } catch(e){}

  function abs(u){ try { return new URL(u, location.href).href; } catch(e){ return String(u||''); } }
  function interno(u){
    try {
      var h = new URL(u, location.href).host.toLowerCase();
      return h === location.host || h === 'bigtricot.com.br' || /\.bigtricot\.com\.br$/.test(h)
          || /\.workers\.dev$/.test(h) || h === 'localhost' || h === '127.0.0.1';
    } catch(e){ return true; }
  }

  // Sobreposição interna: mostra um PDF/relatório/imagem por cima do sistema, sem abrir navegador.
  function sobrepor(url){
    var ov = document.createElement('div');
    ov.setAttribute('data-bigtricot-ov','1');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0b0b0e;display:flex;flex-direction:column';
    var bar = document.createElement('div');
    bar.style.cssText = 'flex:none;height:46px;background:#17171b;color:#fff;display:flex;align-items:center;gap:8px;padding:0 12px;font:600 13px system-ui,Segoe UI,Arial';
    var titulo = document.createElement('span'); titulo.textContent = 'Visualização'; titulo.style.cssText = 'margin-right:auto;opacity:.85';
    var fechar = document.createElement('button'); fechar.textContent = '✕ Fechar';
    fechar.style.cssText = 'background:#d8a24a;color:#17171b;border:0;border-radius:8px;padding:8px 14px;font-weight:800;cursor:pointer';
    var ifr = document.createElement('iframe'); ifr.src = url;
    ifr.style.cssText = 'flex:1;width:100%;border:0;background:#fff';
    function sair(){ try{ ov.remove(); }catch(e){} document.removeEventListener('keydown', onKey, true); }
    function onKey(e){ if(e.key === 'Escape') sair(); }
    fechar.addEventListener('click', sair);
    bar.appendChild(titulo); bar.appendChild(fechar);
    ov.appendChild(bar); ov.appendChild(ifr);
    (document.body || document.documentElement).appendChild(ov);
    document.addEventListener('keydown', onKey, true);
  }

  // Janela em branco pra escrever HTML e imprimir → iframe escondido (imprime dentro do app).
  function janelaImpressao(){
    var ifr = document.createElement('iframe');
    ifr.setAttribute('aria-hidden','true');
    ifr.style.cssText = 'position:fixed;left:-99999px;top:0;width:900px;height:600px;border:0;opacity:0';
    (document.body || document.documentElement).appendChild(ifr);
    var w = ifr.contentWindow;
    try { w.addEventListener('afterprint', function(){ setTimeout(function(){ if(ifr.parentNode) ifr.remove(); }, 400); }); } catch(e){}
    setTimeout(function(){ if(ifr.parentNode) ifr.remove(); }, 180000); // trava de segurança
    return w;
  }

  var _open = window.open;
  window.open = function(u, name, feats){
    try {
      if (!u) { return janelaImpressao(); }          // abrir "" → escrever + imprimir
      var full = abs(u);
      if (interno(full)) { sobrepor(full); return null; }  // PDF/relatório/imagem → sobreposição interna
      location.assign(full);                          // externo → on_navigation manda pro navegador
      return null;
    } catch(e) {
      return _open ? _open.apply(window, arguments) : null;
    }
  };

  document.addEventListener('click', function(e){
    var el = e.target;
    while (el && el.tagName !== 'A') { el = el.parentElement; }
    if (el && el.tagName === 'A' && el.getAttribute('target') === '_blank' && el.href) {
      e.preventDefault(); e.stopPropagation();
      window.open(el.href);
    }
  }, true);
})();
"#;

// Checa se tem versão nova do APP (o "casco" nativo) e atualiza sozinho — sem reinstalar à mão.
// (As mudanças do SISTEMA já chegam sozinhas, pois o app carrega a versão viva do servidor.)
async fn checar_atualizacao(handle: tauri::AppHandle) {
    let updater = match handle.updater() {
        Ok(u) => u,
        Err(_) => return,
    };
    if let Ok(Some(update)) = updater.check().await {
        // Baixa e instala a versão nova em silêncio; depois reinicia o app pra aplicar.
        if update
            .download_and_install(|_baixado, _total| {}, || {})
            .await
            .is_ok()
        {
            handle.restart();
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Atualização automática do app (em segundo plano, logo ao abrir).
            let up_handle = app.handle().clone();
            tauri::async_runtime::spawn(checar_atualizacao(up_handle));

            let handle = app.handle().clone();
            let inicial = Url::parse(URL_INICIAL).expect("URL inicial inválida");

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(inicial))
                .title("Big Tricot")
                .inner_size(1360.0, 860.0)
                .min_inner_size(1024.0, 640.0)
                .center()
                .initialization_script(NAV_SCRIPT)
                .on_navigation(move |url| {
                    let interno = host_interno(url.host_str().unwrap_or(""));
                    if !interno {
                        // Link externo: não navega dentro do app; abre no navegador do sistema.
                        let _ = handle.opener().open_url(url.to_string(), None::<&str>);
                    }
                    interno
                })
                .build()
                .expect("falha ao criar a janela principal do Big Tricot");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Big Tricot Desktop");
}
