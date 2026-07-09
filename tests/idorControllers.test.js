// tests/idorControllers.test.js
// Object-level auth: every :id lookup must include user_id: req.user.id.
const {
  getHealthLogById, updateHealthLog, deleteHealthLog, getHealthLogs,
} = require('../server/controllers/healthController');
const {
  getFinanceLogById, updateFinanceLog, deleteFinanceLog, getFinanceLogs,
} = require('../server/controllers/financeController');
const HealthLog = require('../server/models/HealthLog');
const FinancialLog = require('../server/models/FinancialLog');

jest.mock('../server/models/HealthLog', () => ({
  findOne: jest.fn(),
  findAndCountAll: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../server/models/FinancialLog', () => ({
  findOne: jest.fn(),
  findAndCountAll: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../server/models/Category', () => ({}));
jest.mock('../server/models/LinkedDomain', () => ({}));

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('IDOR — health/finance scoped by req.user.id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getHealthLogById always queries id + user_id', async () => {
    HealthLog.findOne.mockResolvedValue(null);
    const req = { user: { id: 42 }, params: { id: '99' } };
    const res = mockRes();
    await getHealthLogById(req, res, (e) => { throw e; });
    expect(HealthLog.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '99', user_id: 42 },
    }));
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('updateHealthLog does not find other users rows', async () => {
    HealthLog.findOne.mockResolvedValue(null);
    const req = { user: { id: 1 }, params: { id: '5' }, body: { notes: 'x' } };
    const res = mockRes();
    await updateHealthLog(req, res, (e) => { throw e; });
    expect(HealthLog.findOne.mock.calls[0][0].where).toEqual({ id: '5', user_id: 1 });
  });

  test('deleteFinanceLog scopes destroy candidate by user_id', async () => {
    FinancialLog.findOne.mockResolvedValue(null);
    const req = { user: { id: 7 }, params: { id: '3' } };
    const res = mockRes();
    await deleteFinanceLog(req, res, (e) => { throw e; });
    expect(FinancialLog.findOne).toHaveBeenCalledWith({
      where: { id: '3', user_id: 7 },
    });
  });

  test('getFinanceLogById scopes by user_id', async () => {
    FinancialLog.findOne.mockResolvedValue(null);
    await getFinanceLogById({ user: { id: 9 }, params: { id: '1' } }, mockRes(), () => {});
    expect(FinancialLog.findOne.mock.calls[0][0].where).toEqual({ id: '1', user_id: 9 });
  });

  test('list endpoints force where.user_id and safe sort', async () => {
    HealthLog.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
    FinancialLog.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    await getHealthLogs({
      user: { id: 11 },
      query: { sort_by: 'password;--', sort_order: 'ASC', limit: '5000' },
    }, mockRes(), () => {});

    const hArgs = HealthLog.findAndCountAll.mock.calls[0][0];
    expect(hArgs.where.user_id).toBe(11);
    expect(hArgs.order[0][0]).toBe('logged_at'); // injection rejected
    expect(hArgs.limit).toBe(100);

    await getFinanceLogs({
      user: { id: 12 },
      query: { sort_by: 'amount', sort_order: 'asc', limit: '10' },
    }, mockRes(), () => {});
    const fArgs = FinancialLog.findAndCountAll.mock.calls[0][0];
    expect(fArgs.where.user_id).toBe(12);
    expect(fArgs.order[0]).toEqual(['amount', 'ASC']);
    expect(fArgs.limit).toBe(10);
  });

  test('updateFinanceLog rejects negative amount', async () => {
    const entry = { update: jest.fn(), id: 1 };
    FinancialLog.findOne.mockResolvedValue(entry);
    const res = mockRes();
    await updateFinanceLog({
      user: { id: 1 },
      params: { id: '1' },
      body: { amount: -50 },
    }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(entry.update).not.toHaveBeenCalled();
  });
});

describe('insights markAsRead IDOR', () => {
  test('markAsRead queries by id AND user_id', async () => {
    const AISummary = require('../server/models/AISummary');
    const spy = jest.spyOn(AISummary, 'findOne').mockResolvedValue(null);
    const { markAsRead } = require('../server/services/ai/insightsService');
    await markAsRead(55, 77);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 55, user_id: 77 },
    }));
    spy.mockRestore();
  });
});
