import {
  getPaginatedItems,
  getPaginatedTotalPages,
} from '../client/src/utils/paginatedResponse';

describe('paginatedResponse helpers', () => {
  it('reads the top-level array and pagination shape emitted by responseHelper.paginated', () => {
    const response = {
      success: true,
      message: 'Success',
      data: [
        { id: 1, type: 'steps', value: 3200 },
        { id: 2, type: 'sleep', value: 7.5 },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 3,
      },
    };

    expect(getPaginatedItems(response, 'logs')).toEqual(response.data);
    expect(getPaginatedTotalPages(response)).toBe(3);
  });

  it('keeps working with the legacy nested shape used by the current client', () => {
    const response = {
      success: true,
      message: 'Success',
      data: {
        logs: [{ id: 10, type: 'expense', amount: 42.5 }],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 2,
        },
      },
    };

    expect(getPaginatedItems(response, 'logs')).toEqual(response.data.logs);
    expect(getPaginatedTotalPages(response)).toBe(2);
  });
});
