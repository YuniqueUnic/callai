//! Embedded prompt templates (source of truth under `src-tauri/prompts/*.prompt`).
//!
//! Composition (frontend `src/ai/generate.ts` / MCP get_prompt):
//! system → runtime(dynamic) → capabilities → task → style? → output_contract → user
//!
//! Continuation turns use `continue_system` + `continue_user` with mini-jinja vars
//! (`incomplete_tail`, `round`, `max_rounds`).
//!
//! Templates may use mini-jinja placeholders such as `{{ product.name }}`.
//! Static `PromptId::body()` returns a product-rendered string (no raw `{{ product.* }}`).
//! Use `render_prompt_id_with` when the template needs runtime vars (e.g. continue_user).

use minijinja::{value::Value, Environment};
use std::collections::BTreeMap;
use std::sync::OnceLock;

pub const SYSTEM_PROMPT: &str = include_str!("../../prompts/system.prompt");
pub const CAPABILITIES_PROMPT: &str = include_str!("../../prompts/capabilities.prompt");
pub const OUTPUT_CONTRACT_PROMPT: &str = include_str!("../../prompts/output_contract.prompt");
pub const ALARM_GENERATE_PROMPT: &str = include_str!("../../prompts/alarm_generate.prompt");
pub const PLUGIN_GENERATE_PROMPT: &str = include_str!("../../prompts/plugin_generate.prompt");
pub const AI2UI_PROMPT: &str = include_str!("../../prompts/ai2ui.prompt");
pub const PLUGIN_SDK_PROMPT: &str = include_str!("../../prompts/plugin_sdk.prompt");
/// Authoritative animal-island-ui visual/system design for AI-generated UIs.
pub const ANIMAL_ISLAND_STYLE_PROMPT: &str =
    include_str!("../../prompts/animal-island-style.prompt");
pub const CONTINUE_SYSTEM_PROMPT: &str = include_str!("../../prompts/continue_system.prompt");
pub const CONTINUE_USER_PROMPT: &str = include_str!("../../prompts/continue_user.prompt");

/// Product-level constants injected into every prompt template.
#[derive(Debug, Clone, Copy)]
pub struct ProductPromptVars {
    pub name: &'static str,
    pub mascot_en: &'static str,
    pub mascot_zh: &'static str,
    pub default_chime: &'static str,
    pub default_model: &'static str,
}

pub const PRODUCT_PROMPT_VARS: ProductPromptVars = ProductPromptVars {
    name: "callai",
    mascot_en: "callai",
    mascot_zh: "阔爱",
    default_chime: "__callai_alarm__",
    default_model: "gpt-5.6-terra",
};

/// Render a prompt template with product context (+ optional runtime string vars).
/// On template error, returns the raw source so generation is never blocked.
pub fn render_prompt_template(source: &str) -> String {
    render_prompt_template_with(source, PRODUCT_PROMPT_VARS, &BTreeMap::new())
}

pub fn render_prompt_template_with(
    source: &str,
    product: ProductPromptVars,
    extra: &BTreeMap<String, String>,
) -> String {
    // Fast path: no jinja markers at all.
    if !source.contains("{{") && !source.contains("{%") {
        return source.to_string();
    }

    let mut env = Environment::new();
    env.set_undefined_behavior(minijinja::UndefinedBehavior::Lenient);
    if let Err(e) = env.add_template("prompt", source) {
        tracing::warn!(error = %e, "prompt template compile failed; using raw");
        return source.to_string();
    }
    let Ok(tmpl) = env.get_template("prompt") else {
        return source.to_string();
    };

    // Build minijinja context: product.* + flat extra keys.
    let mut map: BTreeMap<String, Value> = BTreeMap::new();
    map.insert(
        "product".into(),
        Value::from_serialize(serde_json::json!({
            "name": product.name,
            "mascot_en": product.mascot_en,
            "mascot_zh": product.mascot_zh,
            "default_chime": product.default_chime,
            "default_model": product.default_model,
        })),
    );
    for (k, v) in extra {
        map.insert(k.clone(), Value::from(v.as_str()));
    }

    match tmpl.render(map) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "prompt template render failed; using raw");
            source.to_string()
        }
    }
}

/// Render any known prompt id with optional runtime vars (e.g. continue_user).
pub fn render_prompt_id_with(id: PromptId, extra: &BTreeMap<String, String>) -> String {
    if extra.is_empty() && !id.needs_runtime_vars() {
        return id.body().to_string();
    }
    render_prompt_template_with(id.raw_source(), PRODUCT_PROMPT_VARS, extra)
}

fn cached_body(id: PromptId) -> &'static str {
    static CACHE: OnceLock<[String; 10]> = OnceLock::new();
    let all = CACHE.get_or_init(|| {
        [
            render_prompt_template(SYSTEM_PROMPT),
            render_prompt_template(CAPABILITIES_PROMPT),
            render_prompt_template(OUTPUT_CONTRACT_PROMPT),
            render_prompt_template(ALARM_GENERATE_PROMPT),
            render_prompt_template(PLUGIN_GENERATE_PROMPT),
            render_prompt_template(AI2UI_PROMPT),
            render_prompt_template(ANIMAL_ISLAND_STYLE_PROMPT),
            render_prompt_template(PLUGIN_SDK_PROMPT),
            render_prompt_template(CONTINUE_SYSTEM_PROMPT),
            // continue_user still has {{ incomplete_tail }} etc.; product-only render
            // leaves those for render_prompt_id_with. Cache product-rendered shell.
            render_prompt_template_with(
                CONTINUE_USER_PROMPT,
                PRODUCT_PROMPT_VARS,
                &BTreeMap::from([
                    ("incomplete_tail".into(), String::new()),
                    ("round".into(), "0".into()),
                    ("max_rounds".into(), "0".into()),
                ]),
            ),
        ]
    });
    match id {
        PromptId::System => all[0].as_str(),
        PromptId::Capabilities => all[1].as_str(),
        PromptId::OutputContract => all[2].as_str(),
        PromptId::AlarmGenerate => all[3].as_str(),
        PromptId::PluginGenerate => all[4].as_str(),
        PromptId::Ai2Ui => all[5].as_str(),
        PromptId::AnimalIslandStyle => all[6].as_str(),
        PromptId::PluginSdk => all[7].as_str(),
        PromptId::ContinueSystem => all[8].as_str(),
        PromptId::ContinueUser => all[9].as_str(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PromptId {
    System,
    Capabilities,
    OutputContract,
    AlarmGenerate,
    PluginGenerate,
    Ai2Ui,
    AnimalIslandStyle,
    PluginSdk,
    ContinueSystem,
    ContinueUser,
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
            Self::PluginSdk => "plugin_sdk",
            Self::ContinueSystem => "continue_system",
            Self::ContinueUser => "continue_user",
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
            "plugin_sdk" | "plugin-sdk" | "sdk" => Some(Self::PluginSdk),
            "animal_island_style"
            | "animal-island-style"
            | "island_style"
            | "island"
            | "animal_island" => Some(Self::AnimalIslandStyle),
            "continue_system" | "continue-system" | "cont_system" => Some(Self::ContinueSystem),
            "continue_user" | "continue-user" | "cont_user" | "continuation" => {
                Some(Self::ContinueUser)
            }
            _ => None,
        }
    }

    /// True when the template is designed to be rendered with per-request vars.
    pub fn needs_runtime_vars(self) -> bool {
        matches!(self, Self::ContinueUser)
    }

    /// Product-rendered template body (static prompts). For continue_user without
    /// vars this is an empty-tail shell — prefer `render_prompt_id_with`.
    pub fn body(self) -> &'static str {
        cached_body(self)
    }

    /// Raw source with possible `{{ ... }}` markers.
    pub fn raw_source(self) -> &'static str {
        match self {
            Self::System => SYSTEM_PROMPT,
            Self::Capabilities => CAPABILITIES_PROMPT,
            Self::OutputContract => OUTPUT_CONTRACT_PROMPT,
            Self::AlarmGenerate => ALARM_GENERATE_PROMPT,
            Self::PluginGenerate => PLUGIN_GENERATE_PROMPT,
            Self::Ai2Ui => AI2UI_PROMPT,
            Self::AnimalIslandStyle => ANIMAL_ISLAND_STYLE_PROMPT,
            Self::PluginSdk => PLUGIN_SDK_PROMPT,
            Self::ContinueSystem => CONTINUE_SYSTEM_PROMPT,
            Self::ContinueUser => CONTINUE_USER_PROMPT,
        }
    }

    pub fn all() -> [Self; 10] {
        [
            Self::System,
            Self::Capabilities,
            Self::OutputContract,
            Self::AlarmGenerate,
            Self::PluginGenerate,
            Self::Ai2Ui,
            Self::AnimalIslandStyle,
            Self::PluginSdk,
            Self::ContinueSystem,
            Self::ContinueUser,
        ]
    }
}
