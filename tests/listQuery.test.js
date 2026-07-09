const { sanitizeListQuery } = require('../server/utils/listQuery');

describe('sanitizeListQuery', () => {
  test('defaults page/limit/sort', () => {
    expect(sanitizeListQuery({})).toMatchObject({
      page: 1,
      limit: 20,
      sort_by: 'logged_at',
      sort_order: 'DESC',
      offset: 0,
    });
  });

  test('rejects SQL-looking sort_by (falls back to default)', () => {
    const q = sanitizeListQuery({
      sort_by: 'id; DROP TABLE users--',
      sort_order: 'ASC; DELETE',
      limit: '99999',
      page: '0',
    });
    expect(q.sort_by).toBe('logged_at');
    expect(q.sort_order).toBe('DESC'); // invalid order → DESC
    expect(q.limit).toBe(100); // capped
    expect(q.page).toBe(1); // min 1
  });

  test('allows only ASC/DESC and allowlisted columns', () => {
    const q = sanitizeListQuery(
      { sort_by: 'amount', sort_order: 'asc', limit: '50', page: '2' },
      { allowedSort: ['logged_at', 'amount', 'id'] },
    );
    expect(q).toMatchObject({ sort_by: 'amount', sort_order: 'ASC', limit: 50, page: 2, offset: 50 });
  });
});
