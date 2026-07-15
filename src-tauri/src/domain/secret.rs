//! Shared secret generation (MCP bearer tokens, etc.).

/// 32-byte hex token (64 chars) from two UUIDv4.
pub fn generate_secret_token() -> String {
    let u1 = uuid::Uuid::new_v4();
    let u2 = uuid::Uuid::new_v4();
    format!("{}{}", hex16(u1.as_bytes()), hex16(u2.as_bytes()))
}

fn hex16(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::generate_secret_token;

    #[test]
    fn token_is_64_hex_chars() {
        let t = generate_secret_token();
        assert_eq!(t.len(), 64);
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(generate_secret_token(), t);
    }
}
