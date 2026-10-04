# Bitos package format v1

Status: frozen for the preview (APP-01). The `os-web` validator, pack tool, and
runtime loader implement this document. `bitos/os` must mirror it before device
install ships (APP-15). Read with the [App Store plan](APP_STORE_PLAN.md) and
[data model](ECOSYSTEM_DATA_MODEL.md).

## Container

A package is one UTF-8 JSON document with the extension `.bitos-app`. It is the
whole archive: there is no zip or tar layer, so the same file validates in the
browser and in Node without dependencies.

```json
{
  "format": "bitos-app",
  "version": 1,
  "manifest": {
    "schema": 1,
    "id": "example-counter",
    "version": "0.1.0",
    "name": "Example Counter",
    "entry": "index.html",
    "icon": "icon.svg",
    "minBitosApi": 1,
    "permissions": [],
    "files": {
      "index.html": "sha256-<64 lowercase hex>",
      "app.js": "sha256-<64 lowercase hex>",
      "style.css": "sha256-<64 lowercase hex>",
      "icon.svg": "sha256-<64 lowercase hex>"
    }
  },
  "files": {
    "index.html": { "encoding": "utf8", "data": "<html>…" },
    "icon.svg": { "encoding": "base64", "data": "PHN2ZyB4bWxucz0i…" }
  }
}
```

- `manifest` is the app's `app.json`. It is the only copy; it is not repeated in
  `files`, so a manifest cannot contain its own hash.
- `files` holds every content file exactly once. `encoding` is `utf8` for text
  and `base64` for binary. `manifest.files` maps each path to its digest and
  must equal the key set of `files` exactly.
- Unknown top-level keys are ignored by v1 consumers and preserved by the pack
  tool only if they are part of the manifest.

## Canonical form and digests

- **Canonical JSON** sorts object keys recursively and emits no insignificant
  whitespace. The pack tool writes canonical JSON; the validator hashes
  canonical bytes, so equivalent JSON produces the same digest.
- **File digest** is `sha256-` followed by the 64-character lowercase hex
  SHA-256 of the decoded file bytes. Manifest entries use this prefix.
- **Package digest** is the 64-character lowercase hex SHA-256 of the canonical
  **payload** — `{ format, version, manifest, files }` — stored without a
  prefix. Top-level envelope keys (such as `release`) are excluded, so a
  package can be signed after packing without changing its digest. It is the
  version's identity; a changed byte needs a new version.
- **Release envelope** (optional) is `release: { publisherKey, publicKey, signature }`.
  `publicKey` and `signature` are base64 Ed25519 values; the signed message is
  the canonical `{ schema, publisherKey, appId, version, digest, permissions, minBitosApi }`
  release manifest. The installer verifies it before activation. This proves
  integrity against the embedded signer; mapping publishers to trusted keys is
  the Nostr layer (APP-13/14).

## Identity

A package does not assert its own publisher. Identity is the pair
`(publisher public key, manifest.id)`, bound by the signed release event and the
package digest. On install, the manifest `id`, `version`, `minBitosApi`, and
`permissions` are compared with the signed release; any mismatch fails.

## Rules and limits

| Rule | v1 value |
| --- | --- |
| Manifest `schema` | `1` |
| Package `version` | `1` |
| `id` | lowercase kebab-case, 1–64, no leading/trailing hyphen |
| `version` | `MAJOR.MINOR.PATCH`, optional prerelease |
| `entry` | a listed path, safe relative |
| `icon` | optional, a listed path |
| `minBitosApi` | integer `<= 1` (current host API) |
| `permissions` | subset of `app.storage`, `app.window` |
| Paths | relative, `/`-separated, no `..`, `.`, empty, `\`, drive letter, or scheme; max 200 chars |
| Files | max 64 |
| Single file | max 128 KiB decoded |
| Manifest | max 64 KiB canonical |
| Package | max 512 KiB canonical |
| Payloads | no `.wasm`, `.node`, `.so`, `.dll`, `.dylib`, `.exe`, `.bin` |

## Error codes

`validatePackage` returns `{ ok, errors: [{ code, message, path? }], manifest?, digest? }`.
Codes are stable so callers and tests can assert without message matching.

| Code | Meaning |
| --- | --- |
| `E_FORMAT` | not an object, or wrong `format` |
| `E_VERSION` | wrong package `version` |
| `E_MANIFEST` | manifest missing or malformed |
| `E_ID` / `E_SEMVER` / `E_API` / `E_PERMISSION` | manifest field rule |
| `E_PATH` | a path violates the path rules |
| `E_DUPLICATE` | two paths normalize to one |
| `E_FILE_MISSING` | a listed path has no file entry |
| `E_FILE_UNLISTED` | a file entry is not listed in the manifest |
| `E_ENCODING` | unknown `encoding` or undecodable `data` |
| `E_FILE_HASH` | decoded bytes do not match the manifest digest |
| `E_ENTRY` | `entry`/`icon` not in the file set |
| `E_PAYLOAD` | blocked native/executable extension |
| `E_LIMIT` | file count, file, manifest, or package size exceeded |

## Open items

Signing and Nostr listing events (APP-13/14), catalog approval tuples (APP-12),
and the booted-OS storage layout (APP-15) are outside this document. `manifestDigest`
is not used: the package digest plus per-file hashes are sufficient in v1.
