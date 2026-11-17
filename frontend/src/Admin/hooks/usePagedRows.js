import { useState } from 'react'

// Splits a list that is already loaded into pages for the shared <Pagination />.
// `resetKey` should change when the list itself changes (new filters, new data),
// so the view returns to page 1 instead of pointing past the end.
export default function usePagedRows(rows, pageSize = 20, resetKey = '') {
  const [state, setState] = useState({ key: resetKey, page: 1 })
  const items = Array.isArray(rows) ? rows : []
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const requestedPage = state.key === resetKey ? state.page : 1
  const page = Math.min(Math.max(1, requestedPage), totalPages)

  return {
    pageRows: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, totalPages, total: items.length, limit: pageSize },
    setPage: (nextPage) => setState({ key: resetKey, page: nextPage }),
  }
}
