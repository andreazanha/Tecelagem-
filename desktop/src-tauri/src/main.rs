// Ponto de entrada do executável. Em release (Windows) não abre a janela preta do console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    big_tricot_desktop_lib::run();
}
