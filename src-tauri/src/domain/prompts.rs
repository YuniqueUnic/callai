//! Embedded prompt templates (source of truth under `src-tauri/prompts/*.prompt`).
//!
//! Composition (frontend `src/ai/generate.ts` / MCP get_prompt):
//! system → runtime(dynamic) → capabilities → task → style? → output_contract → user

pub const SYSTEM_PROMPT: &str = include_str!("../../prompts/system.prompt");
pub const CAPABILITIES_PROMPT: &str = include_str!("../../prompts/capabilities.prompt");
pub const OUTPUT_CONTRACT_PROMPT: &str = include_str!("../../prompts/output_contract.prompt");
pub const ALARM_GENERATE_PROMPT: &str = include_str!("../../prompts/alarm_generate.prompt");
pub const PLUGIN_GENERATE_PROMPT: &str = include_str!("../../prompts/plugin_generate.prompt");
pub const AI2UI_PROMPT: &str = include_str!("../../prompts/ai2ui.prompt");
/// Authoritative animal-island-ui visual/system design for AI-generated UIs.
pub const ANIMAL_ISLAND_STYLE_PROMPT: &str =
    include_str!("../../prompts/animal-island-style.prompt");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptId {
    System,
    Capabilities,
    OutputContract,
    AlarmGenerate,
    PluginGenerate,
    Ai2Ui,
    AnimalIslandStyle,
}

impl PromptId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Capabilities => "capabilities",
            Self::OutputContract => "output_contract",
            Self::AlarmGenerate => "alarm_generate",
            Self::PluginGenerate => "plugin_generate",
            Self::Ai2Ui => "ai2ui",
            Self::AnimalIslandStyle => "animal_island_style",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "system" => Some(Self::System),
            "capabilities" | "capability" | "caps" => Some(Self::Capabilities),
            "output_contract" | "output-contract" | "contract" | "parse_contract" => {
                Some(Self::OutputContract)
            }
            "alarm_generate" | "alarm" => Some(Self::AlarmGenerate),
            "plugin_generate" | "plugin" => Some(Self::PluginGenerate),
            "ai2ui" | "ui" => Some(Self::Ai2Ui),
            "animal_island_style"
            | "animal-island-style"
            | "island_style"
            | "island"
            | "animal_island" => Some(Self::AnimalIslandStyle),
            _ => None,
        }
    }

    pub fn body(self) -> &'static str {
        match self {
            Self::System => SYSTEM_PROMPT,
            Self::Capabilities => CAPABILITIES_PROMPT,
            Self::OutputContract => OUTPUT_CONTRACT_PROMPT,
            Self::AlarmGenerate => ALARM_GENERATE_PROMPT,
            Self::PluginGenerate => PLUGIN_GENERATE_PROMPT,
            Self::Ai2Ui => AI2UI_PROMPT,
            Self::AnimalIslandStyle => ANIMAL_ISLAND_STYLE_PROMPT,
        }
    }

    pub fn all() -> [Self; 7] {
        [
            Self::System,
            Self::Capabilities,
            Self::OutputContract,
            Self::AlarmGenerate,
            Self::PluginGenerate,
            Self::Ai2Ui,
            Self::AnimalIslandStyle,
        ]
    }
}
