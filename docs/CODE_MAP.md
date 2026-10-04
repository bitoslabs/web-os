# Code map

This map answers “where should this code go?”

```text
bitos/os/
├── ui/                         real OS shell and browser preview
│   ├── index.html              DOM mount points and ordered script list
│   ├── main.js                 app registry and session coordinator
│   ├── bootstrap.js            final startup call only
│   ├── boot/                   startup sequence and recovery UI
│   ├── setup/                  first-boot workflow
│   ├── shell/                  desktop-wide behavior
│   ├── shared/                 common runtime and native client
│   └── vendor/                 pinned browser dependencies and licenses
├── apps/                       one folder per built-in program
│   ├── _template/              starting point for a new program
│   ├── files/                  Files UI and scoped storage adapter
│   ├── settings/               Settings UI
│   ├── system-monitor/         simulated preview monitor
│   └── ...
├── br2-external/               Buildroot and native OS implementation
│   ├── board/bitos/x86_64/     kernel/image/session/installed assets
│   ├── configs/                saved Buildroot configurations
│   └── package/                launcher and native service packages
├── scripts/                    build, QEMU, preview, and validation tools
├── tests/                      structure, native protocol, bridge, and boot tests
└── docs/                       architecture, contracts, roadmap, and status
```

## UI shell modules

| File or folder | Responsibility |
| --- | --- |
| `ui/shared/runtime.js` | DOM helpers, icons, preview state, native message client, notifications |
| `ui/setup/setup.js` | First-boot fields and preview identity generation |
| `ui/boot/boot.js` | Startup presentation and setup-versus-desktop decision |
| `ui/shell/window-manager.js` | Window lifecycle, focus, movement, resize, minimize, close |
| `ui/shell/launchers.js` | Pinned shell app catalog |
| `ui/shell/dock.js` and `desktop-icons.js` | App launch surfaces |
| `ui/shell/menubar.js` and `menus.js` | System menu bar and menu actions |
| `ui/shell/search.js` | Search over registered apps and Handbook content |
| `ui/shell/global-input.js` | Global pointer and keyboard routing |
| `ui/shell/control-center.js` | Fast appearance and preview status controls |
| `ui/shell/lock.js` | Preview lock screen |
| `ui/shell/wallpaper.js` | Canvas wallpaper |
| `ui/main.js` | Registry plus session assembly; keep app implementations out |

## Native boundary

JavaScript requests narrow methods through `window.__bitosNative`. The launcher and broker validate and perform allowed operations. Apps must not receive a raw shell, raw D-Bus, or unrestricted filesystem paths. See [Native API](NATIVE_API.md).

## Adding code

- New program: use `scripts/new-app.sh <id>`, edit `apps/<id>/`, add its script before `bootstrap.js`, then run `make ui-check`.
- New desktop-wide behavior: add a focused module under `ui/shell/`, load it before `main.js`, and keep startup in `bootstrap.js`.
- New native capability: update the contract, broker, launcher bridge if needed, scoped UI adapter, and tests together.
- New installed asset tree: update `post-build.sh` and launcher path policy together.
