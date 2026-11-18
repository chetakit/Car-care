import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, createApiClient } from '../Admin/api/client.js'
import useAuth from '../auth/useAuth.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'
import CustomerFooter from './CustomerFooter.jsx'
import CustomerHeader from './CustomerHeader.jsx'
import { formatCustomerMoney, formatCustomerTimestamp } from './customerFormatters.js'
import './customer.css'
import './customer-wallet.css'

const PAGE_SIZE = 10
const WALLET_ERROR_KEYS = {
  'The wallet balance response is incomplete.': 'customer.wallet.balanceResponseIncomplete',
  'The wallet history response is incomplete.': 'customer.wallet.historyResponseIncomplete',
}

function isMoney(value) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value ?? ''))
}

function displayMoney(value, language) {
  return isMoney(value) ? formatCustomerMoney(value, language) : '—'
}

function getWalletError(error) {
  if (error instanceof ApiError) return { message: error.message, key: '' }
  if (error instanceof Error) {
    return {
      message: WALLET_ERROR_KEYS[error.message] ? '' : error.message,
      key: WALLET_ERROR_KEYS[error.message] || '',
    }
  }
  return { message: '', key: 'customer.common.unexpectedError' }
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
  const [result, setResult] = useState({
    status: 'loading',
    data: null,
    error: { message: '', key: '' },
  })
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => {
    setResult({ status: 'loading', data: null, error: { message: '', key: '' } })
    setReload((value) => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    api(path, { signal: controller.signal })
      .then((response) => {
        setResult({
          status: 'ready',
          data: validate(response?.data),
          error: { message: '', key: '' },
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setResult({
            status: 'error',
            data: null,
            error: getWalletError(error),
          })
        }
      })
    return () => controller.abort()
  }, [api, path, reload, validate])

  return { ...result, refresh }
}

function WalletState({ resource, loadingText, t }) {
  if (resource.status === 'loading') {
    return <p aria-live="polite" className="wallet-state">{loadingText}</p>
  }
  if (resource.status === 'error') {
    return (
      <div className="wallet-state wallet-state-error" role="alert">
        <p>{resource.error.key ? t(resource.error.key) : resource.error.message}</p>
        <button onClick={resource.refresh} type="button">{t('customer.common.retry')}</button>
      </div>
    )
  }
  return null
}

function Pagination({ label, pagination, onPageChange, t }) {
  if (pagination.totalPages <= 1 && pagination.page <= 1) return null
  return (
    <nav aria-label={t('customer.wallet.paginationLabel', { label })} className="wallet-pagination">
      <button disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} type="button">
        {t('customer.bookings.previous')}
      </button>
      <span>{t('customer.bookings.pageOf', {
        page: pagination.page,
        totalPages: pagination.totalPages,
      })}</span>
      <button disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)} type="button">
        {t('customer.bookings.next')}
      </button>
    </nav>
  )
}

function TransactionItem({ transaction, language, t }) {
  const type = String(transaction.transaction_type ?? '').toUpperCase()
  const amount = displayMoney(transaction.amount, language)
  const prefix = amount === '—' ? '' : type === 'CREDIT' ? '+' : type === 'DEBIT' ? '−' : ''
  return (
    <li className="wallet-history-item">
      <div className="wallet-item-copy">
        <span className={`wallet-type${type === 'CREDIT' ? ' wallet-type-credit' : ''}`}>
          {type === 'CREDIT'
            ? t('customer.wallet.credit')
            : type === 'DEBIT'
              ? t('customer.wallet.debit')
              : t('customer.wallet.transaction')}
        </span>
        <strong>{transaction.description || t('customer.wallet.noDescription')}</strong>
        <span>{formatCustomerTimestamp(transaction.created_at, language)}</span>
        {transaction.booking_id != null && (
          <span>{t('customer.wallet.bookingId', { bookingId: transaction.booking_id })}</span>
        )}
        {transaction.refund_id != null && (
          <span>{t('customer.wallet.refundId', { refundId: transaction.refund_id })}</span>
        )}
      </div>
      <strong className="wallet-item-amount">{prefix}{amount}</strong>
    </li>
  )
}

function RefundItem({ refund, language, t }) {
  const status = String(refund.refund_status ?? '').replace(/_/g, ' ')
  return (
    <li className="wallet-history-item">
      <div className="wallet-item-copy">
        <span className="wallet-type">
          {t('customer.wallet.refundId', { refundId: refund.refund_id })}
        </span>
        <strong>{status || t('customer.wallet.refundStatusUnavailable')}</strong>
        <span>{formatCustomerTimestamp(refund.processed_at || refund.created_at, language)}</span>
        {refund.booking_id != null && (
          <span>{t('customer.wallet.bookingId', { bookingId: refund.booking_id })}</span>
        )}
        {refund.cancellation_fee != null && (
          <span>{t('customer.wallet.cancellationFee', {
            amount: displayMoney(refund.cancellation_fee, language),
          })}</span>
        )}
      </div>
      <strong className="wallet-item-amount">{displayMoney(refund.refund_amount, language)}</strong>
    </li>
  )
}

function CustomerWalletPage({ user, onLogout }) {
  const { token, handleUnauthorized } = useAuth()
  const { language, t } = useLanguage()
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
          <nav aria-label={t('customer.profile.breadcrumbLabel')} className="wallet-breadcrumb">
            <a href="/customer">{t('customer.wallet.breadcrumb')}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{t('customer.wallet.title')}</span>
          </nav>
          <header className="wallet-heading">
            <div>
              <span className="customer-eyebrow">{t('customer.dashboard.eyebrow')}</span>
              <h1>{t('customer.wallet.title')}</h1>
              <p>{t('customer.wallet.description')}</p>
            </div>
            <button className="wallet-refresh" onClick={refreshAll} type="button">
              {t('customer.wallet.refresh')}
            </button>
          </header>

          <section aria-labelledby="wallet-balance-heading" className="wallet-balance">
            <div>
              <span id="wallet-balance-heading">{t('customer.wallet.availableBalance')}</span>
              {balance.status === 'ready' && (
                <strong>{displayMoney(balance.data.balance, language)}</strong>
              )}
              <WalletState resource={balance} loadingText={t('customer.wallet.loadingBalance')} t={t} />
            </div>
            <a href="/customer/bookings">
              {t('customer.wallet.viewBookings')} <span aria-hidden="true">→</span>
            </a>
          </section>

          <div className="wallet-sections">
            <section aria-labelledby="wallet-transactions-heading" className="wallet-panel">
              <header className="wallet-panel-heading">
                <div>
                  <span className="customer-eyebrow">{t('customer.wallet.activity')}</span>
                  <h2 id="wallet-transactions-heading">{t('customer.wallet.transactions')}</h2>
                </div>
                <span>{t('customer.wallet.newestFirst')}</span>
              </header>
              <WalletState
                resource={transactions}
                loadingText={t('customer.wallet.loadingTransactions')}
                t={t}
              />
              {transactions.status === 'ready' && (
                <>
                  {transactions.data.items.length ? (
                    <ul className="wallet-history-list">
                      {transactions.data.items.map((item) => (
                        <TransactionItem
                          key={item.wallet_transaction_id}
                          language={language}
                          t={t}
                          transaction={item}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="wallet-empty">
                      {transactions.data.pagination.page > 1
                        ? t('customer.wallet.noTransactionsOnPage')
                        : t('customer.wallet.noTransactions')}
                    </p>
                  )}
                  <Pagination
                    label={t('customer.wallet.transactions')}
                    pagination={transactions.data.pagination}
                    onPageChange={changeTransactionPage}
                    t={t}
                  />
                </>
              )}
            </section>

            <section aria-labelledby="wallet-refunds-heading" className="wallet-panel">
              <header className="wallet-panel-heading">
                <div>
                  <span className="customer-eyebrow">{t('customer.wallet.refundsEyebrow')}</span>
                  <h2 id="wallet-refunds-heading">{t('customer.wallet.refundHistory')}</h2>
                </div>
                <span>{t('customer.wallet.newestFirst')}</span>
              </header>
              <WalletState resource={refunds} loadingText={t('customer.wallet.loadingRefunds')} t={t} />
              {refunds.status === 'ready' && (
                <>
                  {refunds.data.items.length ? (
                    <ul className="wallet-history-list">
                      {refunds.data.items.map((item) => (
                        <RefundItem
                          key={item.refund_id}
                          language={language}
                          refund={item}
                          t={t}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="wallet-empty">
                      {refunds.data.pagination.page > 1
                        ? t('customer.wallet.noRefundsOnPage')
                        : t('customer.wallet.noRefunds')}
                    </p>
                  )}
                  <Pagination
                    label={t('customer.wallet.refundHistory')}
                    pagination={refunds.data.pagination}
                    onPageChange={changeRefundPage}
                    t={t}
                  />
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
