use serde::Serialize;
use sysinfo::{Disks, System};

pub struct SystemMonitor {
    system: System,
    disks: Disks,
    started_at: std::time::Instant,
}

#[derive(Debug, Clone, Serialize)]
pub struct DriveInfo {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_percent: f32,
    pub free_percent: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub name: String,
    pub pid: u32,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemSnapshot {
    pub cpu_percent: f32,
    pub memory_percent: f32,
    pub total_memory_bytes: u64,
    pub used_memory_bytes: u64,
    pub uptime_seconds: u64,
    pub drives: Vec<DriveInfo>,
    pub processes: Vec<ProcessInfo>,
    pub timestamp: String,
}

impl SystemMonitor {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        std::thread::sleep(std::time::Duration::from_millis(800));
        system.refresh_all();
        let mut disks = Disks::new_with_refreshed_list();
        disks.refresh(true);
        Self { system, disks, started_at: std::time::Instant::now() }
    }

    pub fn snapshot(&mut self) -> SystemSnapshot {
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        self.system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        self.disks.refresh(true);

        let cpu_percent = self.system.global_cpu_usage().clamp(0.0, 100.0);
        let total_memory_bytes = self.system.total_memory();
        let used_memory_bytes = self.system.used_memory();
        let memory_percent = if total_memory_bytes > 0 {
            (used_memory_bytes as f32 / total_memory_bytes as f32 * 100.0).clamp(0.0, 100.0)
        } else { 0.0 };

        let mut drives: Vec<DriveInfo> = self.disks.list().iter().map(|d| {
            let total = d.total_space();
            let available = d.available_space();
            let free_percent = if total > 0 { available as f32 / total as f32 * 100.0 } else { 0.0 };
            let mount = d.mount_point().to_string_lossy().to_string();
            let name = if mount.len() >= 2 && mount.as_bytes()[1] == b':' {
                mount[..2].to_string()
            } else if mount == "/" { "/".to_string() } else { mount.trim_end_matches(['\\', '/']).to_string() };
            DriveInfo {
                name,
                mount_point: mount,
                total_bytes: total,
                available_bytes: available,
                used_percent: (100.0 - free_percent).clamp(0.0, 100.0),
                free_percent: free_percent.clamp(0.0, 100.0),
            }
        }).collect();
        drives.sort_by(|a, b| a.name.cmp(&b.name));

        let mut processes: Vec<ProcessInfo> = self.system.processes().iter().map(|(pid, p)| ProcessInfo {
            name: p.name().to_string_lossy().to_string(),
            pid: pid.as_u32(),
            cpu_percent: p.cpu_usage().clamp(0.0, 100.0),
            memory_bytes: p.memory(),
        }).collect();
        processes.sort_by(|a, b| b.cpu_percent.partial_cmp(&a.cpu_percent).unwrap_or(std::cmp::Ordering::Equal));
        processes.truncate(100);

        SystemSnapshot {
            cpu_percent,
            memory_percent,
            total_memory_bytes,
            used_memory_bytes,
            uptime_seconds: self.started_at.elapsed().as_secs(),
            drives,
            processes,
            timestamp: chrono_free_timestamp(),
        }
    }
}

fn chrono_free_timestamp() -> String {
    // Timestamp is intentionally dependency-free; this is a UTC Unix-seconds marker.
    format!("unix:{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_secs())
}