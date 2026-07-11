/**
 * UC matrix regression gate — every use case must keep its automated evidence.
 * Does NOT exercise admin UI journeys or browser mic/STT.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const exists = (rel) => fs.existsSync(path.join(root, rel));

/** UC → required automated evidence files (unit/integration/live harness). */
const UC_EVIDENCE = {
  'UC-01': ['tests/authController.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-02': ['tests/authController.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-03': ['scripts/qa_live_use_cases.mjs', 'tests/qa/ui.spec.ts'],
  'UC-04': ['tests/idorControllers.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-05': ['tests/idorControllers.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-06': ['tests/bertNlpService.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-07': ['tests/bertNlpService.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-08': ['tests/crossDomainEval.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-09': ['tests/chatResponse.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-10': ['tests/dashboardInsightsService.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-11': ['tests/insightEngine.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-12': ['tests/idorControllers.test.js', 'scripts/qa_live_use_cases.mjs'],
  'UC-13': ['tests/uc13_uc14_requirements.test.js', 'tests/reportRoutes.test.js'],
  'UC-14': ['tests/uc13_uc14_requirements.test.js', 'tests/notificationService.test.js'],
  'UC-15': ['tests/googleFitAdapter.test.js', 'scripts/qa_live_use_cases.mjs'],
  // API least privilege only — admin UI not required evidence
  'UC-16': ['tests/adminRoutes.test.js', 'scripts/qa_live_use_cases.mjs'],
};

describe('UC matrix evidence (regression)', () => {
  test('all 16 use cases are listed', () => {
    expect(Object.keys(UC_EVIDENCE)).toHaveLength(16);
  });

  test.each(Object.entries(UC_EVIDENCE))('%s evidence files exist', (uc, files) => {
    for (const rel of files) {
      expect({ uc, rel, exists: exists(rel) }).toEqual({ uc, rel, exists: true });
    }
  });

  test('live use-case harness encodes UC-01…UC-16 matrix gate', () => {
    const src = fs.readFileSync(path.join(root, 'scripts/qa_live_use_cases.mjs'), 'utf8');
    for (let i = 1; i <= 16; i += 1) {
      const id = `UC-${String(i).padStart(2, '0')}`;
      expect(src).toContain(id);
    }
    expect(src).toMatch(/UC coverage matrix|ucPass|UC_IDS/);
    // Policy: no mic/STT exercise; no admin UI journey requirement
    expect(src).toMatch(/no mic|No mic|capabilities, no mic/i);
    expect(src).toMatch(/least privilege|API only/i);
    expect(src).not.toMatch(/getUserMedia|webkitSpeechRecognition/);
  });

  test('Playwright UI policy: no admin UI deep coverage, no mic STT', () => {
    const src = fs.readFileSync(path.join(root, 'tests/qa/ui.spec.ts'), 'utf8');
    expect(src).toMatch(/no admin UI|no mic\/STT/i);
    expect(src).not.toMatch(/getUserMedia|webkitSpeechRecognition|startListening/);
    // Must not navigate into admin operator UI as a full journey
    expect(src).not.toMatch(/goto\(['"]\/admin['"]\)/);
  });
});
