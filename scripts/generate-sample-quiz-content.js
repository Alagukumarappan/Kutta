#!/usr/bin/env node
// Generates sample-content/quiz/questions.json: 120 starter quiz questions
// (20 per authored age band, ages 2-7) for the Kutta app. Ages 2-4 are
// image-only "match the picture" questions using bundled Twemoji icons
// (CC-BY 4.0). Ages 5-7 are bilingual (en/de) text questions: simple math +
// general knowledge, scaled in difficulty by age. This is starter/example
// content — parents can edit, add to, or delete any of it once copied onto
// the device.

const fs = require('fs');
const path = require('path');

// The oldest age src/components/AgePicker.tsx lets a parent choose. Every
// band below is authored for exactly one year (minAge === maxAge === age)
// EXCEPT the topmost one, which has to stay open to the ceiling: without
// that, a parent who picked the app's own maximum age got zero eligible
// questions out of filterQuestionsByAge and the Quiz activity showed the
// "no quiz questions yet" empty state forever, with nothing on screen
// explaining why. scripts/validate-sample-quiz-content.js now asserts every
// selectable age has content so this can't silently come back.
const OLDEST_SUPPORTED_AGE = 8;
const OLDEST_AUTHORED_AGE = 7;

function maxAgeFor(age) {
  return age === OLDEST_AUTHORED_AGE ? OLDEST_SUPPORTED_AGE : age;
}

// Every image question/option combines the picture with its bilingual name —
// this doubles as early word-recognition (pairing the shape of a word with
// the picture it names) even before a child can read it outright, per parent
// feedback. A user writing their own content can still choose image-only if
// they prefer; this is a content-authoring choice, not a schema requirement.
const IMAGE_CONCEPTS = [
  { key: 'cat', en: 'Cat', de: 'Katze' },
  { key: 'dog', en: 'Dog', de: 'Hund' },
  { key: 'cow', en: 'Cow', de: 'Kuh' },
  { key: 'elephant', en: 'Elephant', de: 'Elefant' },
  { key: 'lion', en: 'Lion', de: 'Löwe' },
  { key: 'monkey', en: 'Monkey', de: 'Affe' },
  { key: 'rabbit', en: 'Rabbit', de: 'Hase' },
  { key: 'duck', en: 'Duck', de: 'Ente' },
  { key: 'horse', en: 'Horse', de: 'Pferd' },
  { key: 'pig', en: 'Pig', de: 'Schwein' },
  { key: 'sheep', en: 'Sheep', de: 'Schaf' },
  { key: 'bear', en: 'Bear', de: 'Bär' },
  { key: 'frog', en: 'Frog', de: 'Frosch' },
  { key: 'mouse', en: 'Mouse', de: 'Maus' },
  { key: 'chicken', en: 'Chicken', de: 'Huhn' },
  { key: 'bird', en: 'Bird', de: 'Vogel' },
  { key: 'fish', en: 'Fish', de: 'Fisch' },
  { key: 'turtle', en: 'Turtle', de: 'Schildkröte' },
  { key: 'bee', en: 'Bee', de: 'Biene' },
  { key: 'butterfly', en: 'Butterfly', de: 'Schmetterling' },
  { key: 'apple', en: 'Apple', de: 'Apfel' },
  { key: 'banana', en: 'Banana', de: 'Banane' },
  { key: 'car', en: 'Car', de: 'Auto' },
  { key: 'ball', en: 'Ball', de: 'Ball' },
  { key: 'star', en: 'Star', de: 'Stern' },
  { key: 'sun', en: 'Sun', de: 'Sonne' },
  { key: 'moon', en: 'Moon', de: 'Mond' },
  { key: 'tree', en: 'Tree', de: 'Baum' },
  { key: 'flower', en: 'Flower', de: 'Blume' },
  { key: 'house', en: 'House', de: 'Haus' },
];

// Simple deterministic PRNG so re-running this script produces the same output.
function makeRng(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function shuffle(items, rng) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function imagePath(conceptKey) {
  return `images/${conceptKey}.png`;
}

function buildImageQuestions(age, rng) {
  const questions = [];
  const optionIds = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 20; i++) {
    const pool = shuffle(IMAGE_CONCEPTS, rng);
    const target = pool[0];
    const distractors = pool.slice(1, 4);
    const choices = shuffle([target, ...distractors], rng);
    const options = choices.map((concept, idx) => ({
      id: optionIds[idx],
      image: imagePath(concept.key),
      text: { en: concept.en, de: concept.de },
    }));
    const correctOptionId = options[choices.indexOf(target)].id;
    questions.push({
      id: `age${age}-img-${String(i + 1).padStart(2, '0')}`,
      category: 'image',
      minAge: age,
      maxAge: maxAgeFor(age),
      question: {
        image: imagePath(target.key),
        text: { en: `What is this?`, de: `Was ist das?` },
      },
      options,
      correctOptionId,
    });
  }
  return questions;
}

function bt(en, de) {
  return { en, de };
}

function textQuestion(idPrefix, index, age, questionText, options, correctIndex) {
  const optionIds = ['a', 'b', 'c', 'd'];
  return {
    id: `${idPrefix}-${String(index).padStart(2, '0')}`,
    category: 'text',
    minAge: age,
    maxAge: maxAgeFor(age),
    question: { text: questionText },
    options: options.map((text, i) => ({ id: optionIds[i], text })),
    correctOptionId: optionIds[correctIndex],
  };
}

function mathOptions(rng, correctValue, spread) {
  const distractors = new Set();
  while (distractors.size < 3) {
    const delta = Math.floor(rng() * spread * 2) - spread;
    const candidate = correctValue + delta;
    if (candidate >= 0 && candidate !== correctValue) distractors.add(candidate);
  }
  const values = shuffle([correctValue, ...distractors], rng);
  return {
    options: values.map((v) => bt(String(v), String(v))),
    correctIndex: values.indexOf(correctValue),
  };
}

function buildMathQuestions(age, rng, count, maxOperand, allowSubtraction, allowMultiplication) {
  const questions = [];
  for (let i = 0; i < count; i++) {
    const a = 1 + Math.floor(rng() * maxOperand);
    const b = 1 + Math.floor(rng() * maxOperand);
    let opText, answer, aVal = a, bVal = b;
    const opRoll = rng();
    if (allowMultiplication && opRoll < 0.25) {
      aVal = 1 + Math.floor(rng() * 5);
      bVal = 1 + Math.floor(rng() * 5);
      answer = aVal * bVal;
      opText = bt(`What is ${aVal} x ${bVal}?`, `Was ist ${aVal} x ${bVal}?`);
    } else if (allowSubtraction && opRoll < 0.6) {
      const hi = Math.max(aVal, bVal);
      const lo = Math.min(aVal, bVal);
      answer = hi - lo;
      opText = bt(`What is ${hi} - ${lo}?`, `Was ist ${hi} - ${lo}?`);
    } else {
      answer = aVal + bVal;
      opText = bt(`What is ${aVal} + ${bVal}?`, `Was ist ${aVal} + ${bVal}?`);
    }
    const { options, correctIndex } = mathOptions(rng, answer, Math.max(3, Math.round(maxOperand / 3)));
    questions.push(textQuestion(`age${age}-math`, i + 1, age, opText, options, correctIndex));
  }
  return questions;
}

const GK_BANK = {
  5: [
    [bt('What color is the sky on a clear day?', 'Welche Farbe hat der Himmel an einem klaren Tag?'),
      [bt('Blue', 'Blau'), bt('Green', 'Grün'), bt('Red', 'Rot'), bt('Black', 'Schwarz')], 0],
    [bt('How many days are in a week?', 'Wie viele Tage hat eine Woche?'),
      [bt('5', '5'), bt('6', '6'), bt('7', '7'), bt('10', '10')], 2],
    [bt('What do you use to brush your teeth?', 'Womit putzt du deine Zähne?'),
      [bt('A comb', 'Ein Kamm'), bt('A toothbrush', 'Eine Zahnbürste'), bt('A spoon', 'Ein Löffel'), bt('A pencil', 'Ein Stift')], 1],
    [bt('Which animal says "moo"?', 'Welches Tier macht "muh"?'),
      [bt('Cat', 'Katze'), bt('Dog', 'Hund'), bt('Cow', 'Kuh'), bt('Duck', 'Ente')], 2],
    [bt('What is the opposite of "big"?', 'Was ist das Gegenteil von "groß"?'),
      [bt('Small', 'Klein'), bt('Tall', 'Hoch'), bt('Fast', 'Schnell'), bt('Loud', 'Laut')], 0],
    [bt('What do bees make?', 'Was stellen Bienen her?'),
      [bt('Milk', 'Milch'), bt('Honey', 'Honig'), bt('Bread', 'Brot'), bt('Juice', 'Saft')], 1],
    [bt('How many legs does a dog have?', 'Wie viele Beine hat ein Hund?'),
      [bt('2', '2'), bt('3', '3'), bt('4', '4'), bt('6', '6')], 2],
    [bt('What do you wear on your feet?', 'Was trägst du an deinen Füßen?'),
      [bt('Gloves', 'Handschuhe'), bt('A hat', 'Eine Mütze'), bt('Shoes', 'Schuhe'), bt('A scarf', 'Ein Schal')], 2],
    [bt('Which season comes after winter?', 'Welche Jahreszeit kommt nach dem Winter?'),
      [bt('Summer', 'Sommer'), bt('Spring', 'Frühling'), bt('Autumn', 'Herbst'), bt('Winter', 'Winter')], 1],
    [bt('What do plants need to grow?', 'Was brauchen Pflanzen zum Wachsen?'),
      [bt('Water and sunlight', 'Wasser und Sonnenlicht'), bt('Sand only', 'Nur Sand'), bt('Ice', 'Eis'), bt('Nothing', 'Nichts')], 0],
  ],
  6: [
    [bt('How many months are in a year?', 'Wie viele Monate hat ein Jahr?'),
      [bt('10', '10'), bt('11', '11'), bt('12', '12'), bt('13', '13')], 2],
    [bt('What is the largest ocean animal?', 'Was ist das größte Tier im Ozean?'),
      [bt('Shark', 'Hai'), bt('Whale', 'Wal'), bt('Dolphin', 'Delfin'), bt('Octopus', 'Krake')], 1],
    [bt('What do you call a baby dog?', 'Wie nennt man ein Hundebaby?'),
      [bt('Kitten', 'Kätzchen'), bt('Puppy', 'Welpe'), bt('Cub', 'Junges'), bt('Calf', 'Kalb')], 1],
    [bt('Which planet do we live on?', 'Auf welchem Planeten leben wir?'),
      [bt('Mars', 'Mars'), bt('Earth', 'Erde'), bt('Moon', 'Mond'), bt('Sun', 'Sonne')], 1],
    [bt('What do we call frozen water?', 'Wie nennt man gefrorenes Wasser?'),
      [bt('Steam', 'Dampf'), bt('Ice', 'Eis'), bt('Cloud', 'Wolke'), bt('Rain', 'Regen')], 1],
    [bt('How many colors are in a rainbow?', 'Wie viele Farben hat ein Regenbogen?'),
      [bt('5', '5'), bt('6', '6'), bt('7', '7'), bt('8', '8')], 2],
    [bt('What do you call your mother\'s mother?', 'Wie nennt man die Mutter deiner Mutter?'),
      [bt('Aunt', 'Tante'), bt('Sister', 'Schwester'), bt('Grandmother', 'Großmutter'), bt('Cousin', 'Cousine')], 2],
    [bt('Which of these is a fruit?', 'Was davon ist eine Frucht?'),
      [bt('Carrot', 'Karotte'), bt('Apple', 'Apfel'), bt('Potato', 'Kartoffel'), bt('Onion', 'Zwiebel')], 1],
    [bt('What do you use an umbrella for?', 'Wofür benutzt man einen Regenschirm?'),
      [bt('Sun', 'Sonne'), bt('Rain', 'Regen'), bt('Wind', 'Wind'), bt('Snow', 'Schnee')], 1],
    [bt('How many sides does a triangle have?', 'Wie viele Seiten hat ein Dreieck?'),
      [bt('2', '2'), bt('3', '3'), bt('4', '4'), bt('5', '5')], 1],
  ],
  7: [
    [bt('What is the capital of Germany?', 'Was ist die Hauptstadt von Deutschland?'),
      [bt('Munich', 'München'), bt('Berlin', 'Berlin'), bt('Hamburg', 'Hamburg'), bt('Cologne', 'Köln')], 1],
    [bt('How many continents are there?', 'Wie viele Kontinente gibt es?'),
      [bt('5', '5'), bt('6', '6'), bt('7', '7'), bt('8', '8')], 2],
    [bt('What gas do humans breathe in to live?', 'Welches Gas atmen Menschen zum Leben ein?'),
      [bt('Carbon dioxide', 'Kohlendioxid'), bt('Oxygen', 'Sauerstoff'), bt('Helium', 'Helium'), bt('Nitrogen', 'Stickstoff')], 1],
    [bt('Which organ pumps blood through your body?', 'Welches Organ pumpt Blut durch deinen Körper?'),
      [bt('Lungs', 'Lunge'), bt('Brain', 'Gehirn'), bt('Heart', 'Herz'), bt('Stomach', 'Magen')], 2],
    [bt('What do caterpillars turn into?', 'Zu was werden Raupen?'),
      [bt('Bees', 'Bienen'), bt('Butterflies', 'Schmetterlinge'), bt('Beetles', 'Käfer'), bt('Spiders', 'Spinnen')], 1],
    [bt('How many hours are in a day?', 'Wie viele Stunden hat ein Tag?'),
      [bt('12', '12'), bt('20', '20'), bt('24', '24'), bt('30', '30')], 2],
    [bt('What is the tallest animal in the world?', 'Was ist das größte Tier der Welt an Höhe?'),
      [bt('Elephant', 'Elefant'), bt('Giraffe', 'Giraffe'), bt('Horse', 'Pferd'), bt('Bear', 'Bär')], 1],
    [bt('Which shape has no corners?', 'Welche Form hat keine Ecken?'),
      [bt('Square', 'Quadrat'), bt('Triangle', 'Dreieck'), bt('Circle', 'Kreis'), bt('Rectangle', 'Rechteck')], 2],
    [bt('What do we call water falling from the sky?', 'Wie nennt man Wasser, das vom Himmel fällt?'),
      [bt('Snow', 'Schnee'), bt('Rain', 'Regen'), bt('Fog', 'Nebel'), bt('Dew', 'Tau')], 1],
    [bt('Which meal do you usually eat in the morning?', 'Welche Mahlzeit isst man normalerweise morgens?'),
      [bt('Dinner', 'Abendessen'), bt('Lunch', 'Mittagessen'), bt('Breakfast', 'Frühstück'), bt('Snack', 'Snack')], 2],
  ],
};

function buildGkQuestions(age, rng) {
  const bank = GK_BANK[age];
  return bank.map(([questionText, options, correctIndex], i) =>
    textQuestion(`age${age}-gk`, i + 1, age, questionText, options, correctIndex)
  );
}

function main() {
  const rng = makeRng(20260731);
  const questions = [];

  for (const age of [2, 3, 4]) {
    questions.push(...buildImageQuestions(age, rng));
  }

  const mathConfig = {
    5: { count: 10, maxOperand: 5, allowSubtraction: false, allowMultiplication: false },
    6: { count: 10, maxOperand: 10, allowSubtraction: true, allowMultiplication: false },
    7: { count: 10, maxOperand: 12, allowSubtraction: true, allowMultiplication: true },
  };

  for (const age of [5, 6, 7]) {
    const cfg = mathConfig[age];
    questions.push(...buildMathQuestions(age, rng, cfg.count, cfg.maxOperand, cfg.allowSubtraction, cfg.allowMultiplication));
    questions.push(...buildGkQuestions(age, rng));
  }

  const outDir = path.join(__dirname, '..', 'sample-content', 'quiz');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'questions.json');
  fs.writeFileSync(outFile, JSON.stringify({ questions }, null, 2) + '\n');

  console.log(`Wrote ${questions.length} questions to ${outFile}`);
  const perAge = {};
  for (const q of questions) perAge[q.minAge] = (perAge[q.minAge] || 0) + 1;
  console.log('Per age:', perAge);
}

main();
