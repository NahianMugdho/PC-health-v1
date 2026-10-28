//! Local rule-based health recommendations. No external API is required.
pub fn cpu_recommendation(cpu_percent: f32) -> &'static str {
    if cpu_percent >= 90.0 { "Critical CPU load: inspect the top processes and check whether the workload is expected." }
    else if cpu_percent >= 80.0 { "High CPU load: monitor whether this persists and inspect the process list." }
    else { "CPU load is within the configured alert range." }
}
pub fn memory_recommendation(memory_percent: f32) -> &'static str {
    if memory_percent >= 90.0 { "Very high memory use: inspect memory-heavy processes and close only apps you do not need." }
    else if memory_percent >= 80.0 { "Memory use is elevated. Review running applications." }
    else { "Memory use is within the usual alert range." }
}