// Shared list/pagination query sanitization — never pass raw client strings into ORDER BY.

const sanitizeListQuery = (query = {}, {
  allowedSort = ['logged_at', 'created_at', 'id'],
  defaultSort = 'logged_at',
  defaultLimit = 20,
  maxLimit = 100,
} = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10);
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : defaultLimit));
  const sortCandidate = String(query.sort_by || defaultSort);
  const sort_by = allowedSort.includes(sortCandidate) ? sortCandidate : defaultSort;
  const sort_order = String(query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return {
    page,
    limit,
    sort_by,
    sort_order,
    offset: (page - 1) * limit,
  };
};

module.exports = { sanitizeListQuery };
