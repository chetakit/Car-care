import { useState } from 'react'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import formatMoney from '../utils/formatMoney.js'

const MATCH_LIMIT = 8

function isValidUserId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
}

function WalletPage() {
  const initialUserId = new URLSearchParams(window.location.search).get('user_id') ?? ''
  const initiallyValid = isValidUserId(initialUserId)
  const [lookupText, setLookupText] = useState(initialUserId)
  const [appliedUserId, setAppliedUserId] = useState(initiallyValid ? initialUserId : '')
  const [selectedMember, setSelectedMember] = useState(null)
  const [matches, setMatches] = useState(null)
  const [searching, setSearching] = useState(false)
  const [page, setPage] = useState(1)
  const [section, setSection] = useState('balance')
  const [type, setType] = useState('')
  const [lookupError, setLookupError] = useState(
    initialUserId && !initiallyValid ? 'Enter a name, email, phone number, or User ID.' : '',
  )
  const api = useApi()
  const query = new URLSearchParams({ user_id: appliedUserId, page: String(page), limit: '20' })
  if (type && section === 'transactions') query.set('transaction_type', type)
  const suffix = section === 'transactions' ? `/transactions?${query}` : section === 'refunds' ? `/refunds?${query}` : `?user_id=${encodeURIComponent(appliedUserId)}`
  const path = appliedUserId ? `/api/wallet${suffix}` : ''
  const { data, loading, error, refresh } = useRemoteData(path, Boolean(appliedUserId))

  function selectMember(member) {
    setSelectedMember(member)
    setAppliedUserId(String(member.user_id))
    setMatches(null)
    setLookupError('')
    setPage(1)
  }

  async function lookup(event) {
    event.preventDefault()
    const text = lookupText.trim()
    if (!text) {
      setLookupError('Enter a name, email, phone number, or User ID.')
      return
    }
    setLookupError('')
    const idText = text.replace(/^#/, '')
    if (isValidUserId(idText)) {
      setSelectedMember(null)
      setMatches(null)
      setAppliedUserId(idText)
      setPage(1)
      return
    }
    setSearching(true)
    try {
      // All roles: a customer later made Staff still has their Wallet and bookings.
      const params = new URLSearchParams({ search: text, page: '1', limit: String(MATCH_LIMIT) })
      const response = await api(`/api/admin/users?${params}`)
      const items = response.data?.items ?? []
      if (items.length === 1) {
        selectMember(items[0])
      } else {
        setMatches({ items, total: response.data?.pagination?.total ?? items.length })
      }
    } catch (requestError) {
      setLookupError(requestError.message)
    } finally {
      setSearching(false)
    }
  }

  const dataRows = data?.items ?? []
  return (
    <div>
      <PageHeading description="Find a customer by name, email, phone number, or User ID to review their Wallet balance, transactions, and refund history." eyebrow="FINANCE" title="Wallet" action={appliedUserId && <button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">Refresh</button>} />
      <form className="admin-filter-bar" onSubmit={lookup}>
        <label className="admin-lookup-field admin-wallet-lookup" htmlFor="wallet-lookup">
          Customer
          <input
            aria-describedby="wallet-lookup-hint"
            autoComplete="off"
            id="wallet-lookup"
            maxLength="100"
            onChange={(event) => { setLookupText(event.target.value); setLookupError('') }}
            placeholder="Name, email, phone or User ID"
            type="search"
            value={lookupText}
          />
          <small id="wallet-lookup-hint">A number is treated as a User ID.</small>
        </label>
        <button className="admin-primary-button" disabled={searching} type="submit">{searching ? 'Searching…' : 'Find wallet'}</button>
      </form>
      {lookupError && <div className="admin-alert admin-alert-error" role="alert">{lookupError}</div>}
      {matches && (
        <section aria-label="Matching customers" className="admin-panel admin-wallet-matches">
          {matches.items.length ? (
            <>
              <p className="admin-wallet-matches-note">
                {matches.total > matches.items.length
                  ? `Showing ${matches.items.length} of ${matches.total} matches. Refine the search to narrow it down.`
                  : `${matches.items.length} people match. Choose one.`}
              </p>
              <ul>
                {matches.items.map((member) => (
                  <li key={member.user_id}>
                    <button onClick={() => selectMember(member)} type="button">
                      <strong>{member.full_name || '—'}</strong>
                      <span>{[member.email, member.phone].filter(Boolean).join(' · ')}</span>
                      <small>#{member.user_id}{member.role !== 'CUSTOMER' ? ` · ${member.role.toLowerCase()}` : ''}{member.status !== 'ACTIVE' ? ' · inactive' : ''}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <RequestState empty emptyDescription="Try another name, email, or phone number." emptyTitle="No customers match" />
          )}
        </section>
      )}
      {appliedUserId && (
        <p className="admin-wallet-selected-customer" role="status">
          Viewing wallet for {selectedMember?.full_name ? `${selectedMember.full_name} (User #${appliedUserId})` : `User #${appliedUserId}`}.
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
                    { key: 'description', label: 'Description', wrap: true },
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
                    { key: 'refund_reason', label: 'Reason', render: (row) => row.refund_reason || '—', wrap: true },
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
      {!appliedUserId && !lookupError && !matches && (
        <div className="admin-request-state">
          <strong>Look up a customer wallet</strong>
          <span>Search by name, email, phone number, or User ID to review a balance, transactions, or refunds.</span>
        </div>
      )}
    </div>
  )
}

export default WalletPage
