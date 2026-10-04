'use strict';
/* ============================================================================
   BITOS WEB / SAMPLE FILE SYSTEM
   Simulated home files used by the Files app and the terminal preview. In the
   booted OS these come from permission-checked fs.* broker methods.
   ========================================================================== */

export const SAMPLE_FILES = {
  'README': 'bitos — an experimental linux with a web interface\n\nthe ui you are looking at is html+css+js rendered\nby wpe-webkit over wayland. native services expose\nnarrow, permission-checked apis. nothing gets raw\nsystem access.\n\ntry: open nostr · bitfetch · man help',
  'notes.txt': '- pin buildroot + kernel after first boot works\n- keymap test: ~ { } | \\ ; \'\n- ask relaysd for an /etc/relay.d drop-in\n- 21 sats to whoever fixes touchpad suspend',
  '.profile': 'export EDITOR=ed\nexport PROMPT_ALPHA=on\nalias ll="ls -l"\nalias z="nostr status"',
  'bitos.conf': '[ui]\n  theme  = dark\n  accent = zap\n  font   = plex-mono/13\n\n[session]\n  greeter  = firstboot\n  launcher = wpe\n\n[nostr]\n  relays = /etc/relay.d/*',
  'motd': 'welcome to bitos. everything is a file;\nsome files are windows.',
  'hostname': 'bitos',
};
