/* Development-only built-in app: vendored VanJS runtime demonstration. The
 * vendored nomodule build exposes a global `van`; it is loaded before the app
 * modules in index.html. */
import { registerApp } from '../../src/core/index.js';

registerApp('vanjs', {
  title: 'vanjs', icon: 'van', sub: '1.6.1 — hello, reactive', w: 560, h: 400,
  mount(body) {
    const { button, div, pre, h1, p } = van.tags;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const Run = ({ sleepMs }) => {
      const steps = van.state(0);
      (async () => { for (; steps.val < 40; ++steps.val) await sleep(sleepMs); })();
      return pre(() => `${' '.repeat(40 - steps.val)}🚐💨Hello VanJS!${'_'.repeat(steps.val)}`);
    };
    const Hello = () => {
      const dom = div();
      return div({ class: 'vj' },
        h1('Hello VanJS'),
        p({ class: 'vj-sub' }, 'the getting-started example — van.tags · van.state · van.add'),
        div({ class: 'vj-btns' },
          button({ class: 'btn', onclick: () => van.add(dom, Run({ sleepMs: 2000 })) }, 'Hello 🐌'),
          button({ class: 'btn', onclick: () => van.add(dom, Run({ sleepMs: 500 })) }, 'Hello 🐢'),
          button({ class: 'btn', onclick: () => van.add(dom, Run({ sleepMs: 100 })) }, 'Hello 🚶‍♂️'),
          button({ class: 'btn', onclick: () => van.add(dom, Run({ sleepMs: 10 })) }, 'Hello 🏎️'),
          button({ class: 'btn', onclick: () => van.add(dom, Run({ sleepMs: 2 })) }, 'Hello 🚀')),
        dom);
    };
    van.add(body, Hello());
  }
});
