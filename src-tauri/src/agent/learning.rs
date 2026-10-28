//! Minimal in-memory baseline. A later version can persist rolling statistics in SQLite.
#[derive(Debug, Clone)]
pub struct RollingBaseline {
    samples: Vec<f32>,
    capacity: usize,
}
impl RollingBaseline {
    pub fn new(capacity: usize) -> Self { Self { samples: Vec::new(), capacity: capacity.max(5) } }
    pub fn push(&mut self, value: f32) {
        self.samples.push(value);
        if self.samples.len() > self.capacity { self.samples.remove(0); }
    }
    pub fn mean(&self) -> Option<f32> {
        if self.samples.is_empty() { None } else { Some(self.samples.iter().sum::<f32>() / self.samples.len() as f32) }
    }
    pub fn is_unusual(&self, value: f32, minimum_delta: f32) -> bool {
        self.mean().map(|m| value > m + minimum_delta).unwrap_or(false)
    }
}