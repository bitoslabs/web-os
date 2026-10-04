# Native API contract

Status: stage 3 core implemented. The broker lives in `br2-external/package/bitos-setup-broker` (protocol covered by `tests/broker_protocol_test.py`), and `br2-external/package/bitos-launcher` injects the bridge (`tests/bridge_test.c` covers the client side). Both still need verification inside a booted image; names and shapes may still change; preserve the trust rules below.

## Boundary

The local Bitos shell calls a launcher-controlled message channel. The launcher or broker checks the origin and app identity, validates a typed request, and forwards allowed operations to native services. A response carries either a value or a structured error. Never expose raw shell commands, raw D-Bus, or a generic filesystem path operation to web content. A script loaded from the network must not inherit the shell channel.

```text
trusted local shell -> message channel -> broker -> native service -> Linux subsystem
                                      <- result/error <-
```

All messages need a request ID, method name, protocol version, and bounded arguments. Reject unknown methods, extra privileged fields, oversized payloads, invalid types, and requests from an untrusted origin. Each operation should have a timeout. Log method, app identity, outcome, and error code, but never passwords or network secrets.

## Proposed JavaScript surface

```ts
type BitosErrorCode =
  | 'DENIED' | 'INVALID_ARGUMENT' | 'UNAVAILABLE'
  | 'TIMEOUT' | 'CONFLICT' | 'INTERNAL';

interface BitosAPI {
  system: {
    getInfo(): Promise<{ apiVersion: 1; deviceName: string; cpuArch: string }>;
    requestPowerAction(action: 'restart' | 'shutdown'): Promise<void>;
  };
  setup: {
    getState(): Promise<{ completed: boolean; language?: string; displayName?: string;
                          hostname?: string; npub?: string; nsec?: string }>;
    complete(input: { language: string; displayName: string; hostname?: string;
                      npub?: string; nsec?: string }): Promise<void>;
  };
  network: {
    listWifi(): Promise<Array<{ id: string; label: string; signal: number; secured: boolean }>>;
    connectWifi(input: { id: string; password?: string }): Promise<void>;
  };
  fs: {
    list(path: string): Promise<{ path: string; entries: Array<{ name: string; dir: boolean; size: number; mtime: number }> }>;
    mkdir(path: string): Promise<{ created: boolean }>;
    rename(from: string, to: string): Promise<{ renamed: boolean }>;
    delete(path: string): Promise<{ deleted: boolean }>;
    readText(path: string): Promise<{ content: string; length: number }>;
    writeText(path: string, content: string): Promise<{ written: boolean; bytes: number }>;
  };
}
```

`system.getInfo` must return only non-sensitive device information. `setup.complete` must validate length and allowed characters, write persistently, and return success only after the state is committed. The optional identity fields (`npub`, `nsec`) carry the first-boot keypair: they are persisted in the setup record and returned by `setup.getState` to the trusted shell only, never logged. `network.listWifi` uses opaque IDs rather than raw device paths. Secrets sent to `connectWifi` are never logged or returned. Power actions require a trusted shell action and a visible confirmation in the UI.

`fs.*` (GUI-02) is scoped to the session home (`fs_init` root, `/home/bitos` by default): paths are relative with 1-16 components of `[A-Za-z0-9 ._-]`, `..` and absolute paths are rejected, every walked component is opened `O_NOFOLLOW` so symlinks are denied and invisible, and text payloads are capped at 16 KiB with binary detection. Delete is permanent until the data partition and trash arrive.

## Wire protocol and bridge

The broker (AF_UNIX stream, one JSON request per connection, `/run/bitos/setup.sock`) accepts `{"id":...,"version":1,"method":"...","params":{...}}` and answers `{"id":...,"ok":true,"result":{...}}` or `{"id":...,"ok":false,"error":{"code":"...","message":"..."}}`. The launcher (`bitos-launcher`) exposes this to the shell page by injecting `window.__bitosNative.postMessage(request)` at document start and calling `window.__bitosNative._resolve(id, ok, value)` from native code after the broker round-trip; the launcher denies any navigation outside the installed UI bundle, so external content cannot reach the bridge. `ui/shared/runtime.js` wraps the bridge as promise methods and falls back to preview state when it is absent. See `tests/broker_protocol_test.py` and `tests/bridge_test.c` for the shared input and error cases.

## Permissions

| Caller | Setup read | Setup write | Network | Power | Home files |
| --- | --- | --- | --- | --- | --- |
| Trusted setup shell | Yes | Yes, before completion | Yes | Confirmed action | No |
| Trusted desktop shell | Yes | Profile-specific methods later | Yes | Confirmed action | Yes, home scope |
| Third-party app | No by default | No | No by default | No | No by default |
| Remote page | No | No | No | No | No |

Treat UI confirmation as an interaction safeguard, not the sole authorization check. The broker must verify caller identity and policy independently. If separate web views are introduced, each needs its own origin and permission context.

## Browser preview adapter

The client boundary lives in `ui/shared/runtime.js`; Files adds its scoped preview/native adapter in `apps/files/app.js`. Preview implementations must be clearly marked as simulated. Contract tests should run the same input and error cases against preview and native adapters where possible.

## Error behavior

Errors should be stable codes plus human-readable messages. The UI should offer retry for temporary `UNAVAILABLE` and `TIMEOUT`, explain invalid input for `INVALID_ARGUMENT`, and disable unauthorized actions for `DENIED`. Native failures must never leave setup marked complete before persistence succeeds.
