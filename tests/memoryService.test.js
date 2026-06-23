// tests/memoryService.test.js
// Pure extraction tests for the user-memory service (no DB needed).

const { extractMemoryCandidates, summarizeMemories } = require('../server/services/ai/memoryService');

const keys = (cands) => cands.map((c) => c.mem_key);

describe('memoryService.extractMemoryCandidates', () => {
  test('captures the user name', () => {
    const cands = extractMemoryCandidates('Hi, my name is Osama and I love this app.');
    const name = cands.find((c) => c.mem_key === 'name');
    expect(name).toMatchObject({ category: 'profile', value: 'Osama' });
  });

  test('captures having a car as a routine fact', () => {
    const cands = extractMemoryCandidates('I have a car so I drive everywhere.');
    expect(keys(cands)).toContain('vehicle.car');
  });

  test('captures no-car fact', () => {
    const cands = extractMemoryCandidates("I don't have a car, I usually walk.");
    expect(keys(cands)).toContain('vehicle.none');
  });

  test('captures dietary preference', () => {
    const cands = extractMemoryCandidates("I'm a vegetarian.");
    expect(keys(cands)).toContain('diet.vegetarian');
  });

  test('captures monthly budget', () => {
    const cands = extractMemoryCandidates('My monthly budget is $1200.');
    const budget = cands.find((c) => c.mem_key === 'finance.budget');
    expect(budget).toBeTruthy();
    expect(budget.category).toBe('finance');
  });

  test('ignores ordinary messages with no durable facts', () => {
    expect(extractMemoryCandidates('Spent $5 on coffee.')).toEqual([]);
  });

  test('summarizeMemories joins top facts', () => {
    const summary = summarizeMemories([
      { value: 'name is Osama' },
      { value: 'has a car' },
    ]);
    expect(summary).toContain('has a car');
  });
});
