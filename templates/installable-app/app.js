'use strict';

let count = 0;
const output = document.getElementById('count');

function change(amount) {
  count += amount;
  output.value = String(count);
  output.textContent = String(count);
}

document.getElementById('decrease').addEventListener('click', () => change(-1));
document.getElementById('increase').addEventListener('click', () => change(1));
