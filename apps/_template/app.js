'use strict';
/* Template built-in app. Copy this folder, rename it to a lowercase kebab-case
 * app id, then add the id to BUILT_IN_APPS in src/apps.js. Import shared
 * helpers from ../../src/core/index.js and shell services from ../../src/shell/. */
import { registerApp } from '../../src/core/index.js';

registerApp('example', {
  title: 'Example',
  icon: 'doc',
  sub: 'example program',
  w: 520,
  h: 360,
  mount(body, win) {
    body.innerHTML = '<div class="scrolly"><h1>Example</h1><p>Your program is running.</p></div>';
  },
});
