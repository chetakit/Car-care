import { useState } from 'react'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import formatMoney from '../utils/formatMoney.js'

function WalletPage() {
  const [userId, setUserId] = useState('')
  const [appliedUserId, setAppliedUserId] = useState('')
  const [page, setPage] = useState(1)
  const [section, setSection] = useState('balance')
  const [type, setType] = useState('')
  const query = new URLSearchParams({ user_id: appliedUserId, page: String(page), limit: '20' })
  if (type && section === 'transactions') query.set('transaction_type', type)
  const suffix = section === 'transactions' ? `/transactions?${query}` : section === 'refunds' ? `/refunds?${query}` : `?user_id=${encodeURIComponent(appliedUserId)}`
  const path = appliedUserId ? `/api/wallet${suffix}` : ''
  const { data, loading, error, refresh } = useRemoteData(path, Boolean(appliedUserId))

  function lookup(event) {
    event.preventDefault()
    setAppliedUserId(userId.trim())
    setPage(1)
  }

  const dataRows = data?.items ?? []
  return (
    <div>
      <PageHeading description="Wallet endpoints require user_id for Admin requests. This view does not create wallets." eyebrow="FINANCE" title="Wallet" action={appliedUserId && <button className="admin-secondary-button" onClick={refresh} type="button">Refresh</button>} />
      <form className="admin-filter-bar" onSubmit={lookup}>
        <input aria-label="User ID" min="1" onChange={(event) => setUserId(event.target.value)} placeholder="Enter user ID" required type="number" value={userId} />
        <button className="admin-primary-button" type="submit">Load wallet</button>
      </form>
      {appliedUserId && (
        <>
          <div className="admin-tabs" role="tablist">
            {['balance', 'transactions', 'refunds'].map((name) => (
              <button aria-selected={section === name} className={section === name ? 'is-selected' : ''} key={name} onClick={() => { setSection(name); setPage(1) }} role="tab" type="button">{name === 'balance' ? 'Balance' : name === 'transactions' ? 'Transactions' : 'Refund history'}</button>
            ))}
          </div>
          <section className="admin-panel admin-data-panel">
            <RequestState error={error} loading={loading} onRetry={refresh} />
            {!loading && !error && section === 'balance' && (
              <div className="admin-wallet-balance">
                <span>Wallet balance · user #{appliedUserId}</span>
                <strong>{formatMoney(data?.balance)}</strong>
              </div>
            )}
            {!loading && !error && section === 'transactions' && (
              <>
                <div className="admin-panel-heading">
                  <div><h3>Wallet transactions</h3><p>Newest first</p></div>
                  <select aria-label="Transaction type" onChange={(event) => { setType(event.target.value); setPage(1) }} value={type}><option value="">All types</option><option>CREDIT</option><option>DEBIT</option></select>
                </div>
                <RequestState empty={!dataRows.length} />
                {!!dataRows.length && <>
                  <DataTable columns={[
                    { key: 'wallet_transaction_id', label: 'Transaction' },
                    { key: 'transaction_type', label: 'Type', render: (row) => <StatusBadge value={row.transaction_type} /> },
                    { key: 'amount', label: 'Amount', render: (row) => formatMoney(row.amount) },
                    { key: 'description', label: 'Description' },
                    { key: 'refund_id', label: 'Refund ID' },
                    { key: 'booking_id', label: 'Booking ID' },
                    { key: 'created_at', label: 'Date' },
                  ]} rows={dataRows} />
                  <Pagination onPageChange={setPage} pagination={data?.pagination} />
                </>}
              </>
            )}
            {!loading && !error && section === 'refunds' && (
              <>
                <RequestState empty={!dataRows.length} />
                {!!dataRows.length && <>
                  <DataTable columns={[
                    { key: 'refund_id', label: 'Refund' },
                    { key: 'booking_id', label: 'Booking' },
                    { key: 'payment_id', label: 'Payment' },
                    { key: 'refund_amount', label: 'Refund amount', render: (row) => formatMoney(row.refund_amount) },
                    { key: 'cancellation_fee', label: 'Fee', render: (row) => formatMoney(row.cancellation_fee) },
                    { key: 'refund_status', label: 'Status', render: (row) => <StatusBadge value={row.refund_status} /> },
                    { key: 'processed_at', label: 'Processed' },
                  ]} rows={dataRows} />
                  <Pagination onPageChange={setPage} pagination={data?.pagination} />
                </>}
              </>
            )}
          </section>
        </>
      )}
      {!appliedUserId && <div className="admin-request-state">Enter a user ID to view the Admin wallet endpoints.</div>}
    </div>
  )
}

export default WalletPage
