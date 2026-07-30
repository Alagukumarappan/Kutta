#!/usr/bin/env node
// Validates sample-content/quiz/questions.json against the same rules
// src/quiz/loadQuestions.ts enforces, plus checks referenced images exist
// in sample-content/quiz/images/. Run after generate-sample-quiz-content.js.

const fs = require('fs');
const path = require('path');

function isBilingualText(v) {
  return typeof v === 'object' && v !== null && typeof v.en === 'string' && typeof v.de === 'string';
}

function isValidOption(v) {
  if (typeof v !== 'object' || v === null) return 'not an object';
  if (typeof v.id !== 'string') return 'missing id';
  if (v.text !== undefined && !isBilingualText(v.text)) return 'bad text';
  if (v.image !== undefined && typeof v.image !== 'string') return 'bad image';
  if (v.text === undefined && v.image === undefined) return 'no text/image';
  return null;
}

function isValidQuestion(q) {
  const errors = [];
  if (typeof q.id !== 'string') errors.push('missing id');
  if (q.category !== 'image' && q.category !== 'text') errors.push('bad category');
  if (typeof q.minAge !== 'number' || typeof q.maxAge !== 'number') errors.push('bad age range');
  if (q.minAge > q.maxAge) errors.push('minAge > maxAge');

  const hasQText = q.question?.text !== undefined;
  const hasQImage = q.question?.image !== undefined;
  if (!hasQText && !hasQImage) errors.push('question has no text/image');
  if (hasQText && !isBilingualText(q.question.text)) errors.push('question text not bilingual');
  if (hasQImage && typeof q.question.image !== 'string') errors.push('question image not a string');

  if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`expected 4 options, got ${q.options?.length}`);
  else {
    const ids = new Set();
    for (const o of q.options) {
      const err = isValidOption(o);
      if (err) errors.push(`option error: ${err} (${JSON.stringify(o)})`);
      if (ids.has(o.id)) errors.push(`duplicate option id: ${o.id}`);
      ids.add(o.id);
    }
  }

  if (typeof q.correctOptionId !== 'string') errors.push('missing correctOptionId');
  else if (Array.isArray(q.options) && !q.options.some((o) => o.id === q.correctOptionId)) {
    errors.push('correctOptionId matches no option');
  }

  return errors;
}

function main() {
  const contentDir = path.join(__dirname, '..', 'sample-content', 'quiz');
  const file = path.join(contentDir, 'questions.json');
  const imagesDir = path.join(contentDir, 'images');

  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.questions)) {
    console.error('FAIL: "questions" is not an array');
    process.exit(1);
  }

  let failCount = 0;
  const ids = new Set();
  const perAgeCount = {};

  for (const q of parsed.questions) {
    const errors = isValidQuestion(q);
    if (ids.has(q.id)) {
      errors.push('duplicate question id');
    }
    ids.add(q.id);
    perAgeCount[q.minAge] = (perAgeCount[q.minAge] || 0) + 1;

    // Check referenced images actually exist on disk.
    const imagesToCheck = [];
    if (q.question?.image) imagesToCheck.push(q.question.image);
    for (const o of q.options || []) if (o.image) imagesToCheck.push(o.image);
    for (const imgRelPath of imagesToCheck) {
      const basename = path.basename(imgRelPath);
      const fullPath = path.join(imagesDir, basename);
      if (!fs.existsSync(fullPath)) errors.push(`referenced image missing on disk: ${imgRelPath}`);
    }

    if (errors.length > 0) {
      failCount++;
      console.error(`FAIL ${q.id}: ${errors.join('; ')}`);
    }
  }

  console.log(`\nChecked ${parsed.questions.length} questions.`);
  console.log('Per age (minAge):', perAgeCount);
  console.log(`Unique ids: ${ids.size} / ${parsed.questions.length}`);

  if (failCount > 0) {
    console.error(`\n${failCount} question(s) FAILED validation.`);
    process.exit(1);
  }
  console.log('\nAll questions passed validation.');
}

main();
