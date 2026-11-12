// Startcheck vor dem Ausrollen (12.11.2026): findet Namen, die benutzt, aber nirgends definiert sind
// (Anlass: „berger is not defined“ nach 697e8b0, das Spiel startete nicht). Nur diese eine Regel, kein Stil.
import globals from 'globals';
export default [
  { ignores: ['vendor/**', 'tools/**', 'node_modules/**'] },
  { files: ['*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } }, rules: { 'no-undef': 'error' } },
  { files: ['touch.js'], languageOptions: { sourceType: 'script' } },
  { files: ['sw.js'], languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } } },
];
