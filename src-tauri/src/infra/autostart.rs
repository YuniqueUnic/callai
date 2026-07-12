//! Cross-platform login autostart.
//!
//! macOS: Ventura (13+) uses SMAppService; older releases use AppleScript login items.
//! Linux: XDG Autostart. Windows: registry (Dynamic).
use std::path::PathBuf;

use auto_launch::{
    AutoLaunch, AutoLaunchBuilder, LinuxLaunchMode, MacOSLaunchMode, WindowsEnableMode,
};

use crate::domain::{DomainError, DomainResult, ErrorCode};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AutoStartState {
    pub enabled: bool,
    pub changed: bool,
}

#[derive(Clone, Debug)]
pub struct AutoStart {
    app_name: String,
    app_path: PathBuf,
    args: Vec<String>,
}

impl AutoStart {
    pub fn new(
        app_name: impl Into<String>,
        app_path: PathBuf,
        args: &[String],
    ) -> DomainResult<Self> {
        let app_name = app_name.into();
        if app_name.trim().is_empty() {
            return Err(DomainError::new(ErrorCode::Internal, "app_name is empty"));
        }
        if !app_path.exists() {
            return Err(DomainError::new(
                ErrorCode::Internal,
                format!("app_path does not exist: {}", app_path.display()),
            ));
        }
        if !app_path.is_absolute() {
            return Err(DomainError::new(
                ErrorCode::Internal,
                format!("app_path must be absolute: {}", app_path.display()),
            ));
        }
        Ok(Self {
            app_name,
            app_path,
            args: args.to_vec(),
        })
    }

    pub fn for_current_exe(app_name: impl Into<String>, args: &[String]) -> DomainResult<Self> {
        let app_path = std::env::current_exe()
            .map_err(|e| DomainError::new(ErrorCode::Internal, format!("read current_exe: {e}")))?;
        // Prefer .app bundle root on macOS when running from Contents/MacOS/*
        let app_path = prefer_macos_app_bundle(app_path);
        Self::new(app_name, app_path, args)
    }

    pub fn enable(&self) -> DomainResult<()> {
        self.build_primary_auto_launch()?
            .enable()
            .map_err(|e| DomainError::new(ErrorCode::Internal, format!("enable auto-start: {e}")))
    }

    pub fn disable(&self) -> DomainResult<()> {
        self.build_primary_auto_launch()?
            .disable()
            .map_err(|e| DomainError::new(ErrorCode::Internal, format!("disable auto-start: {e}")))
    }

    pub fn is_enabled(&self) -> DomainResult<bool> {
        self.build_primary_auto_launch()?
            .is_enabled()
            .map_err(|e| DomainError::new(ErrorCode::Internal, format!("query auto-start: {e}")))
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn app_name(&self) -> &str {
        &self.app_name
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn app_path(&self) -> &PathBuf {
        &self.app_path
    }

    pub fn sync_enabled(&self, desired_enabled: bool) -> DomainResult<AutoStartState> {
        let before = self.is_enabled()?;
        if before != desired_enabled {
            if desired_enabled {
                self.enable()?;
            } else {
                self.disable()?;
            }
        }
        let enabled = self.is_enabled()?;
        Ok(AutoStartState {
            enabled,
            changed: before != enabled,
        })
    }

    fn build_primary_auto_launch(&self) -> DomainResult<AutoLaunch> {
        let args = self.args.iter().map(|s| s.as_str()).collect::<Vec<_>>();
        let app_path = self.app_path.to_string_lossy();
        let mut builder = AutoLaunchBuilder::new();
        builder
            .set_app_name(&self.app_name)
            .set_app_path(app_path.as_ref())
            .set_args(&args)
            .set_macos_launch_mode(macos_primary_launch_mode())
            .set_linux_launch_mode(LinuxLaunchMode::XdgAutostart)
            .set_windows_enable_mode(WindowsEnableMode::Dynamic);

        #[cfg(target_os = "macos")]
        {
            // Bundle id from tauri.conf identifier; helps LaunchAgent/SMAppService identity.
            builder.set_bundle_identifiers(&["com.yunxuan.callai"]);
        }

        builder
            .build()
            .map_err(|e| DomainError::new(ErrorCode::Internal, format!("build auto-launch: {e}")))
    }
}

fn prefer_macos_app_bundle(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        // .../Foo.app/Contents/MacOS/binary -> .../Foo.app
        let mut p = path.as_path();
        for _ in 0..3 {
            if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                if name.ends_with(".app") {
                    return p.to_path_buf();
                }
            }
            match p.parent() {
                Some(parent) => p = parent,
                None => break,
            }
        }
        path
    }
    #[cfg(not(target_os = "macos"))]
    {
        path
    }
}

fn macos_primary_launch_mode() -> MacOSLaunchMode {
    #[cfg(target_os = "macos")]
    {
        macos_primary_launch_mode_for_os_version(os_info::get().version())
    }
    #[cfg(not(target_os = "macos"))]
    {
        MacOSLaunchMode::LaunchAgent
    }
}

#[cfg(target_os = "macos")]
fn macos_primary_launch_mode_for_os_version(version: &os_info::Version) -> MacOSLaunchMode {
    if macos_smappservice_supported(version) {
        MacOSLaunchMode::SMAppService
    } else {
        // Pre-Ventura: AppleScript login items are more reliable than LaunchAgent for GUI apps.
        MacOSLaunchMode::AppleScript
    }
}

#[cfg(target_os = "macos")]
fn macos_smappservice_supported(version: &os_info::Version) -> bool {
    matches!(version, os_info::Version::Semantic(major, _, _) if *major >= 13)
}

#[cfg(test)]
mod mode_tests {
    #[cfg(target_os = "macos")]
    use super::{macos_primary_launch_mode_for_os_version, macos_smappservice_supported};
    #[cfg(target_os = "macos")]
    use auto_launch::MacOSLaunchMode;
    #[cfg(target_os = "macos")]
    use os_info::Version;

    #[test]
    #[cfg(target_os = "macos")]
    fn ventura_and_newer_use_smappservice() {
        assert!(macos_smappservice_supported(&Version::Semantic(13, 0, 0)));
        assert!(macos_smappservice_supported(&Version::Semantic(14, 5, 0)));
        assert_eq!(
            macos_primary_launch_mode_for_os_version(&Version::Semantic(13, 0, 0)),
            MacOSLaunchMode::SMAppService
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn older_macos_uses_applescript() {
        assert!(!macos_smappservice_supported(&Version::Semantic(12, 7, 0)));
        assert_eq!(
            macos_primary_launch_mode_for_os_version(&Version::Semantic(12, 7, 0)),
            MacOSLaunchMode::AppleScript
        );
    }

    #[test]
    fn for_current_exe_builds() {
        // In unit tests the binary exists; enable/disable is best-effort OS side-effect — skip.
        let a = super::AutoStart::for_current_exe("callai-test", &[]).expect("current exe");
        assert!(!a.app_name().is_empty());
        assert!(a.app_path().is_absolute());
    }
}
