# Security Policy

## Supported versions

Security fixes are applied on the current `main` branch / latest released tag when practical.

## Reporting a vulnerability

Please **do not** open a public issue for sensitive security reports.

Prefer one of:

1. GitHub private vulnerability reporting on this repository (if enabled)
2. Contact the maintainer listed in `src-tauri/Cargo.toml` (`unic <yuniqueunic@gmail.com>`)

Include:

- affected version / commit
- reproduction steps
- impact assessment
- any suggested fix (optional)

You should receive an acknowledgement when the report is seen. Please allow reasonable time before public disclosure.

## Scope notes

callai runs local scheduled processes configured by the user. Treat alarm binaries and arguments as trusted only if you configured them yourself. Do not point alarms at untrusted executables.
