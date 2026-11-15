import { useCallback, useEffect, useMemo, useState } from 'react'
import { createApiClient } from '../Admin/api/client.js'
import formatMoney from '../Admin/utils/formatMoney.js'
import useAuth from '../auth/useAuth.js'
import CustomerFooter from './CustomerFooter.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import { formatCustomerTimestamp } from './customerFormatters.js'
import './customer.css'
import './customer-wallet.css'

const PAGE_SIZE = 10

function isMoney(value) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value ?? ''))
}

function displayMoney(value) {
  return isMoney(value) ? formatMoney(value) : '—'
}

function validateBalance(data) {
  if (!data || !isMoney(data.balance)) {
    throw new Error('The wallet balance response is incomplete.')
  }
  return data
}

function validateHistory(data) {
  const { page, total, totalPages } = data?.pagination ?? {}
  if (
    !Array.isArray(data?.items) ||
    !Number.isInteger(page) || page < 1 ||
    !Number.isInteger(total) || total < 0 ||
    !Number.isInteger(totalPages) || totalPages < 0
  ) {
    throw new Error('The wallet history response is incomplete.')
  }
  return { items: data.items, pagination: { page, total, totalPages } }
}

function useWalletResource(api, path, validate) {
  const [result, setResult] = useState({ status: 'loading', data: null, error: '' })
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => {
    setResult({ status: 'loading', data: null, error: '' })
    setReload((value) => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    api(path, { signal: controller.signal })
      .then((response) => {
        setResult({ status: 'ready', data: validate(response?.data), error: '' })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setResult({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : 'Please try again.',
          })
        }
      })
    return () => controller.abort()
  }, [api, path, reload, validate])

  return { ...result, refresh }
}

function WalletState({ resource, loadingText }) {
  if (resource.status === 'loading') {
    return <p aria-live="polite" className="wallet-state">{loadingText}</p>
  }
  if (resource.status === 'error') {
    return (
      <div className="wallet-state wallet-state-error" role="alert">
        <p>{resource.error}</p>
        <button onClick={resource.refresh} type="button">Try again</button>
      </div>
    )
  }
  return null
}

function Pagination({ label, pagination, onPageChange }) {
  if (pagination.totalPages <= 1 && pagination.page <= 1) return null
  return (
    <nav aria-label={`${label} pages`} className="wallet-pagination">
      <button disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} type="button">
        Previous
      </button>
      <span>
        Page {pagination.page}
        {pagination.page <= pagination.totalPages && ` of ${pagination.totalPages}`}
      </span>
      <button disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)} type="button">
        Next
      </button>
    </nav>
  )
}

function TransactionItem({ transaction }) {
  const type = String(transaction.transaction_type ?? '').toUpperCase()
  const amount = displayMoney(transaction.amount)
  const prefix = amount === '—' ? '' : type === 'CREDIT' ? '+' : type === 'DEBIT' ? '−' : ''
  return (
    <li className="wallet-history-item">
      <div className="wallet-item-copy">
        <span className={`wallet-type${type === 'CREDIT' ? ' wallet-type-credit' : ''}`}>
          {type === 'CREDIT' ? 'Credit' : type === 'DEBIT' ? 'Debit' : 'Transaction'}
        </span>
        <strong>{transaction.description || 'No description provided'}</strong>
        <span>{formatCustomerTimestamp(transaction.created_at)}</span>
        {transaction.booking_id != null && <span>Booking #{transaction.booking_id}</span>}
        {transaction.refund_id != null && <span>Refund #{transaction.refund_id}</span>}
      </div>
      <strong className="wallet-item-amount">{prefix}{amount}</strong>
    </li>
  )
}

function RefundItem({ refund }) {
  const status = String(refund.refund_status ?? '').replace(/_/g, ' ')
  return (
    <li className="wallet-history-item">
      <div className="wallet-item-copy">
        <span className="wallet-type">Refund #{refund.refund_id}</span>
        <strong>{status || 'Status unavailable'}</strong>
        <span>{formatCustomerTimestamp(refund.processed_at || refund.created_at)}</span>
        {refund.booking_id != null && <span>Booking #{refund.booking_id}</span>}
        {refund.cancellation_fee != null && <span>Cancellation fee: {displayMoney(refund.cancellation_fee)}</span>}
      </div>
      <strong className="wallet-item-amount">{displayMoney(refund.refund_amount)}</strong>
    </li>
  )
}

function CustomerWalletPage({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const api = useMemo(
    () => createApiClient(token, handleUnauthorized),
    [handleUnauthorized, token],
  )
  const [transactionPage, setTransactionPage] = useState(1)
  const [refundPage, setRefundPage] = useState(1)
  const balance = useWalletResource(api, '/api/wallet', validateBalance)
  const transactions = useWalletResource(
    api,
    `/api/wallet/transactions?page=${transactionPage}&limit=${PAGE_SIZE}`,
    validateHistory,
  )
  const refunds = useWalletResource(
    api,
    `/api/wallet/refunds?page=${refundPage}&limit=${PAGE_SIZE}`,
    validateHistory,
  )
  const refreshBalance = balance.refresh
  const refreshTransactions = transactions.refresh
  const refreshRefunds = refunds.refresh
  const refreshAll = useCallback(() => {
    refreshBalance()
    refreshTransactions()
    refreshRefunds()
  }, [refreshBalance, refreshTransactions, refreshRefunds])

  useEffect(() => {
    function refreshVisible() {
      if (document.visibilityState === 'visible') refreshAll()
    }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refreshAll])

  function changeTransactionPage(page) {
    transactions.refresh()
    setTransactionPage(page)
  }

  function changeRefundPage(page) {
    refunds.refresh()
    setRefundPage(page)
  }

  return (
    <div className="customer-home customer-wallet">
      <CustomerHeader onLogout={onLogout} user={user} />
      <main className="wallet-main">
        <div className="customer-container">
          <nav aria-label="Breadcrumb" className="wallet-breadcrumb">
            <a href="/customer">My Account</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">My Wallet</span>
          </nav>
          <header className="wallet-heading">
            <div>
              <span className="customer-eyebrow">YOUR CAR CARE</span>
              <h1>My Wallet</h1>
              <p>Keep track of your wallet balance, payments and refunds.</p>
            </div>
            <button className="wallet-refresh" onClick={refreshAll} type="button">Refresh wallet</button>
          </header>

          <section aria-labelledby="wallet-balance-heading" className="wallet-balance">
            <div>
              <span id="wallet-balance-heading">Available balance</span>
              {balance.status === 'ready' && <strong>{displayMoney(balance.data.balance)}</strong>}
              <WalletState resource={balance} loadingText="Loading balance…" />
            </div>
            <a href="/customer/bookings">View my bookings <span aria-hidden="true">→</span></a>
          </section>

          <div className="wallet-sections">
            <section aria-labelledby="wallet-transactions-heading" className="wallet-panel">
              <header className="wallet-panel-heading">
                <div>
                  <span className="customer-eyebrow">WALLET ACTIVITY</span>
                  <h2 id="wallet-transactions-heading">Transactions</h2>
                </div>
                <span>Newest first</span>
              </header>
              <WalletState resource={transactions} loadingText="Loading transactions…" />
              {transactions.status === 'ready' && (
                <>
                  {transactions.data.items.length ? (
                    <ul className="wallet-history-list">
                      {transactions.data.items.map((item) => <TransactionItem key={item.wallet_transaction_id} transaction={item} />)}
                    </ul>
                  ) : <p className="wallet-empty">{transactions.data.pagination.page > 1 ? 'No transactions on this page.' : 'No wallet transactions yet.'}</p>}
                  <Pagination label="Transactions" pagination={transactions.data.pagination} onPageChange={changeTransactionPage} />
                </>
              )}
            </section>

            <section aria-labelledby="wallet-refunds-heading" className="wallet-panel">
              <header className="wallet-panel-heading">
                <div>
                  <span className="customer-eyebrow">YOUR REFUNDS</span>
                  <h2 id="wallet-refunds-heading">Refund history</h2>
                </div>
                <span>Newest first</span>
              </header>
              <WalletState resource={refunds} loadingText="Loading refunds…" />
              {refunds.status === 'ready' && (
                <>
                  {refunds.data.items.length ? (
                    <ul className="wallet-history-list">
                      {refunds.data.items.map((item) => <RefundItem key={item.refund_id} refund={item} />)}
                    </ul>
                  ) : <p className="wallet-empty">{refunds.data.pagination.page > 1 ? 'No refunds on this page.' : 'No refunds yet.'}</p>}
                  <Pagination label="Refunds" pagination={refunds.data.pagination} onPageChange={changeRefundPage} />
                </>
              )}
            </section>
          </div>
        </div>
      </main>
      <CustomerFooter />
    </div>
  )
}

export default CustomerWalletPage
