// tests/memoryRoutes.test.js
// ============================================
// Memory control-plane wiring + validation (auth + service mocked → no DB).
// IDOR at the query level is pinned in memoryService.test.js; here we pin
// that "not yours / not found" maps to 404, never a leak.
// ============================================

jest.mock('../server/middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 1 }; next(); },
}));

jest.mock('../server/services/ai/memoryService', () => ({
  listMemories: jest.fn(),
  updateMemory: jest.fn(),
  deleteMemory: jest.fn(),
  clearMemories: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const memoryRoutes = require('../server/routes/memoryRoutes');
const svc = require('../server/services/ai/memoryService');

const app = express();
app.use(express.json());
app.use('/api/memory', memoryRoutes);

beforeEach(() => jest.clearAllMocks());

test('GET / lists the authenticated user memories', async () => {
  svc.listMemories.mockResolvedValue([{ id: 3, mem_key: 'name', category: 'profile', value: 'Osama', source: 'chat' }]);
  const res = await request(app).get('/api/memory');
  expect(res.status).toBe(200);
  expect(res.body.data.count).toBe(1);
  expect(res.body.data.memories[0].value).toBe('Osama');
  expect(svc.listMemories).toHaveBeenCalledWith(1); // req.user.id, never client input
});

test('PUT /:id validates the body', async () => {
  const res = await request(app).put('/api/memory/3').send({ value: '' });
  expect(res.status).toBe(400);
  expect(svc.updateMemory).not.toHaveBeenCalled();
});

test('PUT /:id rejects a non-numeric id', async () => {
  const res = await request(app).put('/api/memory/abc').send({ value: 'x' });
  expect(res.status).toBe(400);
});

test('PUT /:id updates and returns the corrected row', async () => {
  svc.updateMemory.mockResolvedValue({ id: 3, value: 'Sam', source: 'user', confidence: 1 });
  const res = await request(app).put('/api/memory/3').send({ value: 'Sam' });
  expect(res.status).toBe(200);
  expect(res.body.data.memory).toMatchObject({ source: 'user', value: 'Sam' });
  expect(svc.updateMemory).toHaveBeenCalledWith(1, '3', 'Sam');
});

test('PUT /:id → 404 when the row is not owned or missing (IDOR surface)', async () => {
  svc.updateMemory.mockResolvedValue(null);
  const res = await request(app).put('/api/memory/999').send({ value: 'Sam' });
  expect(res.status).toBe(404);
});

test('DELETE /:id forgets one fact; 404 when not owned', async () => {
  svc.deleteMemory.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await request(app).delete('/api/memory/3')).status).toBe(200);
  const miss = await request(app).delete('/api/memory/999');
  expect(miss.status).toBe(404);
  expect(svc.deleteMemory).toHaveBeenCalledWith(1, '3');
});

test('DELETE / wipes everything for the authenticated user only', async () => {
  svc.clearMemories.mockResolvedValue(7);
  const res = await request(app).delete('/api/memory');
  expect(res.status).toBe(200);
  expect(res.body.data.deleted).toBe(7);
  expect(svc.clearMemories).toHaveBeenCalledWith(1);
});
