// responseHelper + errorHandler production leak contract
const { success, error, paginated } = require('../server/utils/responseHelper');
const { errorHandler, AppError } = require('../server/middleware/errorHandler');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('responseHelper', () => {
  test('success shape is consistent', () => {
    const res = mockRes();
    success(res, { a: 1 }, 'ok', 200);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'ok', data: { a: 1 } });
  });

  test('error shape does not include stack', () => {
    const res = mockRes();
    error(res, 'bad', 400, 'BAD');
    expect(res.json.mock.calls[0][0]).toEqual({
      success: false,
      error: 'bad',
      code: 'BAD',
    });
    expect(res.json.mock.calls[0][0].stack).toBeUndefined();
  });

  test('paginated includes pagination object', () => {
    const res = mockRes();
    paginated(res, [1], { page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(res.json.mock.calls[0][0].pagination.total).toBe(1);
  });
});

describe('errorHandler production leak', () => {
  const saved = process.env.NODE_ENV;

  afterEach(() => { process.env.NODE_ENV = saved; });

  test('production 500 non-operational errors hide internal message + stack', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    const err = new Error('ECONNREFUSED 127.0.0.1:3306 secret host');
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('Internal server error');
    expect(body.error).not.toMatch(/ECONNREFUSED|3306/);
    expect(body.stack).toBeUndefined();
  });

  test('operational AppError messages still reach the client', () => {
    process.env.NODE_ENV = 'production';
    const res = mockRes();
    errorHandler(new AppError('Email already registered', 409, 'DUP'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error).toBe('Email already registered');
  });
});
