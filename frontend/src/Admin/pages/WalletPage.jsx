import { useState } from 'react'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import formatMoney from '../utils/formatMoney.js'

function isValidUserId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
}

function WalletPage() {
  const initialUserId = new URLSearchParams(window.location.search).get('user_id') ?? ''
  const initiallyValid = isValidUserId(initialUserId)
  const [userId, setUserId] = useState(initialUserId)
  const [appliedUserId, setAppliedUserId] = useState(initiallyValid ? initialUserId : '')
  const [page, setPage] = useState(1)
  const [section, setSection] = useState('balance')
  const [type, setType] = useState('')
  const [lookupError, setLookupError] = useState(
    initialUserId && !initiallyValid ? 'Enter a positive whole-number User ID.' : '',
  )
  const query = new URLSearchParams({ user_id: appliedUserId, page: String(page), limit: '20' })
  if (type && section === 'transactions') query.set('transaction_type', type)
  const suffix = section === 'transactions' ? `/transactions?${query}` : section === 'refunds' ? `/refunds?${query}` : `?user_id=${encodeURIComponent(appliedUserId)}`
  const path = appliedUserId ? `/api/wallet${suffix}` : ''
  const { data, loading, error, refresh } = useRemoteData(path, Boolean(appliedUserId))

  function lookup(event) {
    event.preventDefault()
    const id = userId.trim()
    if (!isValidUserId(id)) {
      setLookupError('Enter a positive whole-number User ID.')
      setAppliedUserId('')
      return
    }
    setLookupError('')
    setAppliedUserId(id)
    setPage(1)
  }

  const dataRows = data?.items ?? []
  return (
    <div>
      <PageHeading description="Look up a wallet using the customer’s numeric User ID from Customer details. This page does not create wallets or search by name." eyebrow="FINANCE" title="Wallet" action={appliedUserId && <button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">Refresh</button>} />
      <form className="admin-filter-bar" onSubmit={lookup}>
        <label className="admin-lookup-field" htmlFor="wallet-user-id">
          User ID
          <input
            aria-describedby="wallet-user-id-hint"
            autoComplete="off"
            id="wallet-user-id"
            inputMode="numeric"
            onChange={(event) => { setUserId(event.target.value); setLookupError('') }}
            placeholder="e.g. 204"
            required
            type="text"
            value={userId}
          />
          <small id="wallet-user-id-hint">Use the account’s User ID, not a Booking ID.</small>
        </label>
        <button className="admin-primary-button" type="submit">Load wallet</button>
      </form>
      {lookupError && <div className="admin-alert admin-alert-error" role="alert">{lookupError}</div>}
      {appliedUserId && (
        <p className="admin-wallet-selected-customer" role="status">
          Viewing wallet for User #{appliedUserId}.
        </p>
      )}
      {appliedUserId && (
        <>
          <div aria-label="Wallet view" className="admin-tabs">
            {['balance', 'transactions', 'refunds'].map((name) => (
              <button aria-pressed={section === name} className={section === name ? 'is-selected' : ''} key={name} onClick={() => { setSection(name); setPage(1) }} type="button">{name === 'balance' ? 'Balance' : name === 'transactions' ? 'Transactions' : 'Refund history'}</button>
            ))}
          </div>
          <section className="admin-panel admin-data-panel">
            <RequestState error={error} loading={loading} onRetry={refresh} />
            {!loading && !error && section === 'balance' && (
              data?.balance !== undefined
                ? <div className="admin-wallet-balance"><span>Wallet balance · user #{appliedUserId}</span><strong>{formatMoney(data.balance)}</strong></div>
                : <RequestState empty emptyDescription="No wallet balance was returned for this User ID." emptyTitle="Wallet balance unavailable" />
            )}
            {!loading && !error && section === 'transactions' && (
              <>
                <div className="admin-panel-heading">
                  <div><h3>Wallet transactions</h3><p>Newest first</p></div>
                  <select aria-label="Transaction type" onChange={(event) => { setType(event.target.value); setPage(1) }} value={type}><option value="">All types</option>{['CREDIT', 'DEBIT'].map((value) => <option key={value} value={value}>{formatStatusLabel(value)}</option>)}</select>
                </div>
                <RequestState
                  empty={!dataRows.length}
                  emptyDescription="No transactions were returned for this User ID and transaction type."
                  emptyTitle="No wallet transactions"
                />
                {!!dataRows.length && <>
                  <DataTable columns={[
                    { key: 'wallet_transaction_id', label: 'Transaction' },
                    { key: 'transaction_type', label: 'Type', render: (row) => <StatusBadge value={row.transaction_type} /> },
                    { key: 'amount', label: 'Amount', render: (row) => formatMoney(row.amount) },
                    { key: 'description', label: 'Description' },
                    { key: 'refund_id', label: 'Refund ID' },
                    { key: 'booking_id', label: 'Booking ID' },
                    { key: 'created_at', label: 'Date', render: (row) => formatDateTime(row.created_at) },
                  ]} rows={dataRows} />
                  <Pagination onPageChange={setPage} pagination={data?.pagination} />
                </>}
              </>
            )}
            {!loading && !error && section === 'refunds' && (
              <>
                <RequestState
                  empty={!dataRows.length}
                  emptyDescription="No refund records were returned for this User ID."
                  emptyTitle="No wallet refunds"
                />
                {!!dataRows.length && <>
                  <DataTable columns={[
                    { key: 'refund_id', label: 'Refund' },
                    { key: 'booking_id', label: 'Booking' },
                    { key: 'payment_id', label: 'Payment' },
                    { key: 'refund_amount', label: 'Refund amount', render: (row) => formatMoney(row.refund_amount) },
                    { key: 'cancellation_fee', label: 'Fee', render: (row) => formatMoney(row.cancellation_fee) },
                    { key: 'refund_status', label: 'Status', render: (row) => <StatusBadge value={row.refund_status} /> },
                    { key: 'processed_at', label: 'Processed', render: (row) => formatDateTime(row.processed_at) },
                  ]} rows={dataRows} />
                  <Pagination onPageChange={setPage} pagination={data?.pagination} />
                </>}
              </>
            )}
          </section>
        </>
      )}
      {!appliedUserId && !lookupError && (
        <div className="admin-request-state">
          <strong>Look up a customer wallet</strong>
          <span>Enter the customer’s User ID to review its balance, transactions, or refunds.</span>
        </div>
      )}
    </div>
  )
}

export default WalletPage
