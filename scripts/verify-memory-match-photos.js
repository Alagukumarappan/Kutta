const fs = require('fs');
const path = require('path');

const ANIMALS = [
  'lion', 'elephant', 'giraffe', 'zebra', 'panda', 'koala', 'kangaroo',
  'penguin', 'owl', 'dolphin', 'tiger', 'monkey', 'horse', 'rabbit',
];
const CARS = ['sedan', 'suv', 'pickup-truck', 'sports-car', 'taxi', 'race-car'];
const MAX_BYTES = 500 * 1024;

let failed = false;

function check(category, itemId) {
  const filePath = path.join(__dirname, '..', 'sample-content', 'memory-match', category, `${itemId}.jpg`);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING: ${filePath}`);
    failed = true;
    return;
  }
  const { size } = fs.statSync(filePath);
  if (size === 0) {
    console.error(`EMPTY FILE: ${filePath}`);
    failed = true;
  } else if (size > MAX_BYTES) {
    console.error(`TOO LARGE (${Math.round(size / 1024)}KB > 500KB): ${filePath}`);
    failed = true;
  } else {
    console.log(`OK (${Math.round(size / 1024)}KB): ${filePath}`);
  }
}

ANIMALS.forEach((id) => check('animals', id));
CARS.forEach((id) => check('cars', id));

if (failed) {
  console.error('\nOne or more Memory Match photos are missing, empty, or too large.');
  process.exit(1);
}
console.log('\nAll 20 Memory Match photos present and within size budget.');
