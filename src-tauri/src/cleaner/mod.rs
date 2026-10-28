use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, time::SystemTime};

#[derive(Debug, Clone, Serialize)]
pub struct CleanupCandidate {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

fn temp_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(p) = std::env::var_os("TEMP") { roots.push(PathBuf::from(p)); }
    if let Some(p) = std::env::var_os("TMP") { roots.push(PathBuf::from(p)); }
    roots.sort();
    roots.dedup();
    roots
}

fn is_old_enough(path: &Path) -> bool {
    let metadata = match fs::metadata(path) { Ok(m) => m, Err(_) => return false };
    if metadata.is_dir() { return false; }
    let modified = match metadata.modified() { Ok(t) => t, Err(_) => return false };
    SystemTime::now().duration_since(modified).map(|age| age.as_secs() > 24 * 60 * 60).unwrap_or(false)
}

pub fn scan_candidates() -> Result<Vec<CleanupCandidate>, String> {
    let mut results = Vec::new();
    for root in temp_roots() {
        if !root.is_dir() { continue; }
        let entries = fs::read_dir(&root).map_err(|e| format!("Cannot scan {}: {e}", root.display()))?;
        for entry in entries.flatten() {
            let path = entry.path();
            // Conservative first version: only top-level files in the user's/system TEMP folders,
            // older than 24 hours. Never recurse into folders or follow directory trees.
            if !is_old_enough(&path) { continue; }
            let metadata = match fs::metadata(&path) { Ok(m) => m, Err(_) => continue };
            results.push(CleanupCandidate {
                name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
            });
            if results.len() >= 500 { return Ok(results); }
        }
    }
    results.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(results)
}

pub fn delete_candidate(raw_path: &str) -> Result<(), String> {
    let target = PathBuf::from(raw_path);
    if !target.is_absolute() { return Err("Only absolute paths are accepted".into()); }
    if target.is_dir() { return Err("Directories are never deleted by this tool".into()); }
    let canonical_target = target.canonicalize().map_err(|e| format!("Cannot resolve target: {e}"))?;
    let allowed = temp_roots().into_iter().filter_map(|p| p.canonicalize().ok()).any(|root| canonical_target.parent() == Some(root.as_path()));
    if !allowed { return Err("Safety check failed: file is not directly inside an approved TEMP folder".into()); }
    let metadata = fs::metadata(&canonical_target).map_err(|e| e.to_string())?;
    if metadata.is_dir() { return Err("Directories are not allowed".into()); }
    fs::remove_file(&canonical_target).map_err(|e| format!("Could not remove file (it may be in use): {e}"))
}