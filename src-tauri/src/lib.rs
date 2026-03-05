mod commands;
mod crossref;
mod db;
mod kobo;
mod pdf;
mod search;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub search: Mutex<search::SearchIndex>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            commands::import_pdf,
            commands::import_kobo,
            commands::search_corpus,
            commands::lookup_doi,
            commands::search_crossref,
            commands::list_documents,
            commands::update_document_metadata,
            commands::get_document_highlights,
            commands::save_project,
            commands::list_projects,
            commands::load_project,
            commands::save_citation,
            commands::get_project_citations,
            commands::rebuild_search_index,
        ])
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;

            let db_path = app_dir.join("fragments.db");
            let conn = db::open_database(&db_path)
                .expect("Failed to open database");

            let index_dir = app_dir.join("search_index");
            let search_index = search::SearchIndex::open_or_create(&index_dir)
                .expect("Failed to open search index");

            app.manage(AppState {
                db: Mutex::new(conn),
                search: Mutex::new(search_index),
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
