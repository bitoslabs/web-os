# Screenshots

Captures the screen with `getDisplayMedia`, takes frames from a live preview, and
saves them as PNG.

State: shots live in the window for the session; **download** writes a PNG and
nothing is uploaded. Capture needs a secure context (https or localhost).

Native requirements: on the booted OS, capture must go through a permissioned
screenshot portal and saved shots belong in the user Pictures folder.
