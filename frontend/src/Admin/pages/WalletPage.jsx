import { useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { DataTable, PageHeading, Pagination, RequestState, StatusBadge } from '../components/AdminPageState.jsx'
import useApi from '../hooks/useApi.js'
import useRemoteData from '../hooks/useRemoteData.js'
import { formatDateTime } from '../utils/formatDate.js'
import formatStatusLabel from '../utils/formatStatusLabel.js'
import formatMoney from '../utils/formatMoney.js'

const MATCH_LIMIT = 8

function messageText(message, t) {
  return message?.key ? t(message.key, message.params) : message
}

function isValidUserId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
}

function WalletPage() {
  const { language, t } = useLanguage()
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
    initialUserId && !initiallyValid ? { key: 'admin.wallet.validation.lookup' } : '',
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
      setLookupError({ key: 'admin.wallet.validation.lookup' })
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
      <PageHeading description={t('admin.wallet.description')} eyebrow={t('admin.wallet.eyebrow')} title={t('admin.wallet.title')} action={appliedUserId && <button className="admin-secondary-button admin-refresh-button" onClick={refresh} type="button">{t('admin.wallet.refresh')}</button>} />
      <form className="admin-filter-bar" onSubmit={lookup}>
        <label className="admin-lookup-field admin-wallet-lookup" htmlFor="wallet-lookup">
          {t('admin.wallet.lookup.label')}
          <input
            aria-describedby="wallet-lookup-hint"
            autoComplete="off"
            id="wallet-lookup"
            maxLength="100"
            onChange={(event) => { setLookupText(event.target.value); setLookupError('') }}
            placeholder={t('admin.wallet.lookup.placeholder')}
            type="search"
            value={lookupText}
          />
          <small id="wallet-lookup-hint">{t('admin.wallet.lookup.hint')}</small>
        </label>
        <button className="admin-primary-button" disabled={searching} type="submit">{searching ? t('admin.wallet.lookup.searching') : t('admin.wallet.lookup.submit')}</button>
      </form>
      {lookupError && <div className="admin-alert admin-alert-error" role="alert">{messageText(lookupError, t)}</div>}
      {matches && (
        <section aria-label={t('admin.wallet.matches.ariaLabel')} className="admin-panel admin-wallet-matches">
          {matches.items.length ? (
            <>
              <p className="admin-wallet-matches-note">
                {matches.total > matches.items.length
                  ? t('admin.wallet.matches.showing', { count: matches.items.length, total: matches.total })
                  : t('admin.wallet.matches.choose', { count: matches.items.length })}
              </p>
              <ul>
                {matches.items.map((member) => (
                  <li key={member.user_id}>
                    <button onClick={() => selectMember(member)} type="button">
                      <strong>{member.full_name || '—'}</strong>
                      <span>{[member.email, member.phone].filter(Boolean).join(' · ')}</span>
                      <small>#{member.user_id}{member.role !== 'CUSTOMER' ? ` · ${member.role.toLowerCase()}` : ''}{member.status !== 'ACTIVE' ? ` · ${t('admin.status.inactive')}` : ''}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <RequestState empty emptyDescription={t('admin.wallet.matches.emptyDescription')} emptyTitle={t('admin.wallet.matches.emptyTitle')} />
          )}
        </section>
      )}
      {appliedUserId && (
        <p className="admin-wallet-selected-customer" role="status">
          {t('admin.wallet.selectedCustomer', {
            customer: selectedMember?.full_name ? `${selectedMember.full_name} (User #${appliedUserId})` : `User #${appliedUserId}`,
          })}
        </p>
      )}
      {appliedUserId && (
        <>
          <div aria-label={t('admin.wallet.view.ariaLabel')} className="admin-tabs">
            {[
              { id: 'balance', label: 'admin.wallet.view.balance' },
              { id: 'transactions', label: 'admin.wallet.view.transactions' },
              { id: 'refunds', label: 'admin.wallet.view.refunds' },
            ].map(({ id, label }) => (
              <button aria-pressed={section === id} className={section === id ? 'is-selected' : ''} key={id} onClick={() => { setSection(id); setPage(1) }} type="button">{t(label)}</button>
            ))}
          </div>
          <section className="admin-panel admin-data-panel">
            <RequestState error={error} loading={loading} onRetry={refresh} />
            {!loading && !error && section === 'balance' && (
              data?.balance !== undefined
                ? <div className="admin-wallet-balance"><span>{t('admin.wallet.balance.label', { id: appliedUserId })}</span><strong>{formatMoney(data.balance, language)}</strong></div>
                : <RequestState empty emptyDescription={t('admin.wallet.balance.emptyDescription')} emptyTitle={t('admin.wallet.balance.emptyTitle')} />
            )}
            {!loading && !error && section === 'transactions' && (
              <>
                <div className="admin-panel-heading">
                  <div><h3>{t('admin.wallet.transactions.title')}</h3><p>{t('admin.wallet.transactions.order')}</p></div>
                  <select aria-label={t('admin.wallet.transactions.typeLabel')} onChange={(event) => { setType(event.target.value); setPage(1) }} value={type}><option value="">{t('admin.wallet.transactions.typeAll')}</option>{['CREDIT', 'DEBIT'].map((value) => <option key={value} value={value}>{formatStatusLabel(value, language)}</option>)}</select>
                </div>
                <RequestState
                  empty={!dataRows.length}
                  emptyDescription={t('admin.wallet.transactions.emptyDescription')}
                  emptyTitle={t('admin.wallet.transactions.emptyTitle')}
                />
                {!!dataRows.length && <>
                  <DataTable columns={[
                    { key: 'wallet_transaction_id', label: t('admin.wallet.transactions.table.transaction') },
                    { key: 'transaction_type', label: t('admin.wallet.transactions.table.type'), render: (row) => <StatusBadge value={row.transaction_type} /> },
                    { key: 'amount', label: t('admin.wallet.transactions.table.amount'), render: (row) => formatMoney(row.amount, language) },
                    { key: 'description', label: t('admin.wallet.transactions.table.description'), wrap: true },
                    { key: 'refund_id', label: t('admin.wallet.transactions.table.refundId') },
                    { key: 'booking_id', label: t('admin.wallet.transactions.table.bookingId') },
                    { key: 'created_at', label: t('admin.wallet.transactions.table.date'), render: (row) => formatDateTime(row.created_at, language) },
                  ]} rows={dataRows} />
                  <Pagination onPageChange={setPage} pagination={data?.pagination} />
                </>}
              </>
            )}
            {!loading && !error && section === 'refunds' && (
              <>
                <RequestState
                  empty={!dataRows.length}
                  emptyDescription={t('admin.wallet.refunds.emptyDescription')}
                  emptyTitle={t('admin.wallet.refunds.emptyTitle')}
                />
                {!!dataRows.length && <>
                  <DataTable columns={[
                    { key: 'refund_id', label: t('admin.wallet.refunds.table.refund') },
                    { key: 'booking_id', label: t('admin.wallet.refunds.table.booking') },
                    { key: 'payment_id', label: t('admin.wallet.refunds.table.payment') },
                    { key: 'refund_amount', label: t('admin.wallet.refunds.table.amount'), render: (row) => formatMoney(row.refund_amount, language) },
                    { key: 'cancellation_fee', label: t('admin.wallet.refunds.table.fee'), render: (row) => formatMoney(row.cancellation_fee, language) },
                    { key: 'refund_reason', label: t('admin.wallet.refunds.table.reason'), render: (row) => row.refund_reason || '—', wrap: true },
                    { key: 'refund_status', label: t('admin.wallet.refunds.table.status'), render: (row) => <StatusBadge value={row.refund_status} /> },
                    { key: 'processed_at', label: t('admin.wallet.refunds.table.processed'), render: (row) => formatDateTime(row.processed_at, language) },
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
          <strong>{t('admin.wallet.initial.title')}</strong>
          <span>{t('admin.wallet.initial.description')}</span>
        </div>
      )}
    </div>
  )
}

export default WalletPage
