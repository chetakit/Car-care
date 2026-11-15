# Car Care Backend API

Frontend reference for the routes currently mounted by `backend/app.js`.

## Conventions

- Default local base URL: `http://localhost:5000` (`PORT` can override it).
- JSON request bodies use `Content-Type: application/json`.
- Protected routes require `Authorization: Bearer <accessToken>`.
- Success responses use `{"status":"success","data":...}` unless noted. Errors use `{"status":"error","message":"..."}`.
- Common errors: `400` invalid input, `401` missing/invalid/expired token, `403` insufficient role, `404` resource unavailable, `409` duplicate/conflicting operation, `500` internal error.
- Standard paginated Admin lists default to `page=1&limit=20`, with `limit` capped at 100. Their response is `data: { items, pagination: { page, limit, total, totalPages } }`.
- Customer catalog and vehicle lists return `data: { items }`; Customer booking history also includes `pagination`.
- The server uses configured JWT expiry. Logout removes the token on the client; it does not revoke the token server-side.

## Schedule generation

The schedule generator uses the `Asia/Bangkok` timezone and covers the current Bangkok date plus the next 29 calendar days. Monday through Saturday are business days; Sundays are skipped. It creates six 90-minute slots per business day, each with capacity 2:

| Start | End |
|---|---|
| 09:00 | 10:30 |
| 10:30 | 12:00 |
| 12:00 | 13:30 |
| 13:30 | 15:00 |
| 15:00 | 16:30 |
| 16:30 | 18:00 |

Past dates and same-day slots whose start time has arrived are skipped. Existing slots are preserved; the generator only inserts missing date/start-time slots and serializes generator runs with a MySQL advisory lock. It inspects the configured `schedules` table before proceeding and refuses to write if its required columns or ID generation are incompatible. Apply mode also requires an exact unique index on `(schedule_date, start_time)`; the index may use either column order, but cannot include additional columns or use prefixes. Dry-run reports a warning if this index is absent.

Run from the `backend` directory. Dry-run is the default and reads the configured database to inspect the schema and existing slots; it does not insert rows:

```powershell
node .\scripts\generate-schedules.js
```

Review the listed dates, slots, and existing-slot skip count before using apply mode:

```powershell
node .\scripts\generate-schedules.js --apply
```

**Warning:** `--apply` writes new schedule rows to the database configured for the backend, which may be Railway MySQL. Use it only after reviewing the dry-run output and confirming the configured target. The generator is not run automatically at backend startup.

## Authentication

| Method and URL | Access | Request | Success and notable errors |
|---|---|---|---|
| `POST /api/auth/login` | Public; ACTIVE ADMIN and CUSTOMER accounts | `{ "email": "name@example.com", "password": "..." }`. Email is trimmed/lowercased; password is required. | `200`, `data: { accessToken, tokenType, expiresIn, user: { user_id, full_name, email, role } }`; `400` invalid input, `401` invalid credentials, `500` server/configuration error. |
| `GET /api/auth/me` | ADMIN or CUSTOMER | No body | `200`, `data: { user: { user_id, full_name, email, phone, role } }`; `401` token/account invalid or inactive; `500` verification error. |
| `POST /api/auth/logout` | ADMIN or CUSTOMER | No body | `200`, `{ status, message }`. Client must discard the JWT; it remains valid until expiry. |
| `POST /api/admin/auth/login` | Public compatibility alias; same login behavior as shared login | Same as `/api/auth/login` | Same as shared login. It can issue either an ADMIN or CUSTOMER token. |
| `GET /api/admin/auth/me` | ADMIN | No body | `200`, `data: { user: { user_id, role } }` from token claims; `401`/`403`. Unlike shared `/api/auth/me`, this legacy route does not reload the profile from the database. |
| `POST /api/admin/auth/logout` | ADMIN | No body | `200`, `{ status, message }`; logout is stateless. |
| `POST /api/customer/auth/register` | Public; creates CUSTOMER only | `{ "full_name": "A. Customer", "email": "name@example.com", "password": "any-non-empty-password", "phone": "0812345678" }`. Name is 1–100 characters; password is 1–1024 characters with no composition requirements; `phone` is optional or `null`, and if provided must contain exactly 10 ASCII digits; extra fields (including role/status/user_id) are rejected. | `201`, `data: { user: { user_id, full_name, email, phone, role, status } }`; `400` invalid input, `409` duplicate email, `500` server error. The server assigns `CUSTOMER` and `ACTIVE`. |

Login accepts email up to 254 characters and a password up to 1024 characters; registration accepts email up to 150 characters and a password of 1–1024 characters. Password hashes are not returned.

## Customer APIs

All routes below require a CUSTOMER token. Customer IDs are taken from the token; they are not request parameters.

### Profile

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/customer/profile` | No body | `200`, `data: { user: { user_id, full_name, email, phone, role, status, created_at } }` | `401`, `403`, `404` profile unavailable, `500`. |
| `PATCH /api/customer/profile` | At least one of `{ "full_name": "A. Customer", "phone": null }`. Only `full_name` and `phone` are accepted. | `200`, same user structure as GET | `400` invalid/unsupported fields, `401`, `403`, `404`, `500`. |

### Vehicles

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/customer/vehicles` | No defined query parameters | `200`, `data: { items: Vehicle[] }` | `401`, `403`, `500`. |
| `POST /api/customer/vehicles` | `{ "model_id": 7, "license_plate": "ABC-123", "production_year": 2020, "province": "Bangkok", "color": "Blue" }`. `model_id` and `license_plate` required; remaining fields optional and may be `null`. `production_year` must be 1901–2155. | `201`, `data: { vehicle: Vehicle }` | `400` invalid input or model not active, `401`, `403`, `409` duplicate plate, `500`. |
| `PATCH /api/customer/vehicles/:vehicleId` | At least one allowed field from the create body; `user_id` is not accepted. | `200`, `data: { vehicle: Vehicle }` | `400`, `401`, `403`, `404` not owned/not found, `409` duplicate plate, `500`. |
| `DELETE /api/customer/vehicles/:vehicleId` | No body | `200`, `{ status, message }` | `400` invalid ID, `401`, `403`, `404`, `409` vehicle has bookings, `500`. |

`Vehicle` fields: `vehicle_id`, `model_id`, `license_plate`, `production_year`, `province`, `color`, `status`, `model_name`, `brand_name`, `type_name`. Both `/api/customer/vehicles` and its trailing-slash form are routed.

### Vehicle catalog

All catalog endpoints return active records in `data.items`.

| Method and URL | Query parameters | Item fields | Errors |
|---|---|---|---|
| `GET /api/customer/catalog/vehicle-types` | None accepted | `vehicle_type_id`, `type_name`, `description`, `status`, `created_at`, `updated_at` | `400` query supplied, `401`, `403`, `500`. |
| `GET /api/customer/catalog/vehicle-brands` | None accepted | `brand_id`, `brand_name`, `status`, `created_at`, `updated_at` | `400`, `401`, `403`, `500`. |
| `GET /api/customer/catalog/vehicle-models` | Optional positive integer `brand_id`, `vehicle_type_id` | `model_id`, `brand_id`, `brand_name`, `vehicle_type_id`, `type_name`, `model_name`, `model_year_start`, `model_year_end`, `status`, `created_at`, `updated_at` | `400` invalid/unsupported filter, `401`, `403`, `500`. |

### Service catalog and prices

| Method and URL | Query parameters | Success | Errors |
|---|---|---|---|
| `GET /api/public/catalog/services` | None accepted; public read-only catalog access | `200`, `data: { items: PublicService[] }`; items include `service_id`, `service_name`, `description`, `duration_minutes`. Active services only. | `400` query supplied, `500`. |
| `GET /api/customer/catalog/services` | None accepted | `200`, `data: { items: Service[] }`; items include `service_id`, `service_name`, `description`, `duration_minutes`, `status`, `created_at`, `updated_at`. Active services only. | `400` query supplied, `401`, `403`, `500`. |
| `GET /api/customer/catalog/services/:serviceId/prices` | Required `vehicle_type_id` (positive integer); no other query parameter accepted | `200`, `data: { items: Price[] }`; each item includes `service_price_id`, `service_id`, `vehicle_type_id`, `type_name`, `price`, `created_at`, `updated_at`. | `400` invalid/missing ID or filter, `401`, `403`, `404` service missing/inactive, `500`. A valid service/type with no price returns an empty `items` array. |

The service collection accepts a trailing slash as well.

### Booking history

| Method and URL | Query parameters | Success | Errors |
|---|---|---|---|
| `GET /api/customer/schedules/availability` | Required inclusive date range: `from=YYYY-MM-DD&to=YYYY-MM-DD`; `from` must not be after `to`. | `200`, `data: { items: ScheduleAvailability[] }`; each item has `schedule_id`, `schedule_date`, `start_time`, `end_time`, `capacity`, `booked_count`, and `remaining_capacity`. Only future `AVAILABLE` schedules with capacity remaining are returned; on the current database date, the start time must be later than the database session time. | `400` invalid/missing dates or unsupported query, `401`, `403`, `500`. Availability is informational; booking creation rechecks that the schedule has not started, its status, and capacity using database session date/time. |
| `POST /api/customer/bookings` | JSON body: `vehicle_id`, `schedule_id`, non-empty unique `service_ids`. Customer token required; `user_id` is derived from the token. Amounts, times, status, and payment fields are server-controlled. | `201`, `data: Booking` using the history item fields; `payment` is `null`. | `400` invalid body, service duration exceeds the schedule, or final amount is zero, `401`, `403`, `404` vehicle/schedule/service not found, `409` inactive resources, unavailable/full schedule, or missing vehicle-type price, `500`. |
| `GET /api/customer/bookings` | `page`, `limit`, `booking_status`, `sort` (`newest` or `oldest`). Defaults: 1, 20, no status, newest; limit max 100. Status: `CONFIRMED`, `CHECKED_IN`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`, `NO_SHOW`. | `200`, `data: { items: Booking[], pagination }` | `400` invalid/unsupported query, `401`, `403`, `500`. No matches returns an empty list. |
| `GET /api/customer/vehicles/:vehicleId/bookings` | Same filters; vehicle must belong to the authenticated customer. | Same as above | `400`, `401`, `403`, `404` vehicle missing/not owned, `500`. |

The create request accepts exactly `vehicle_id`, `schedule_id`, and `service_ids`; client-supplied identity, dates, times, status, prices, durations, totals, coupons, notes, and payment data are rejected. Only `AVAILABLE` schedules with capacity remaining are accepted. Capacity counts bookings except `CANCELLED`. Booking date and times are copied from the selected schedule; the sum of active service durations must fit its time interval. Prices and service snapshots are read from the database, and creation is transactional. The database default sets the initial status to `CONFIRMED`. Payment is created separately through the shared payment APIs.

Each booking contains `booking_id`, `booking_date`, `start_time`, `end_time`, `booking_status`, `total_amount`, `discount_amount`, `final_amount`, `vehicle`, `services`, and `payment`. `vehicle` is `null` or contains `vehicle_id`, `license_plate`, `production_year`, `province`, `color`, `model_name`, `brand_name`, and `type_name`. Each service contains `booking_service_id`, `service_id`, `service_name`, `unit_price`, and `duration_minutes`. Payment is `null` when unavailable and otherwise contains `payment_id`, `amount`, `payment_method`, `payment_status`, `paid_at`. The Customer response does not include payment transaction references.

## Admin APIs

All `/api/admin/...` business routes require an ADMIN token. Collection lists return the standard paginated response described above. Detail and mutation responses use `data: <entity>`; creates return `201`, other successful reads/updates return `200`.

### Dashboard

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/admin/dashboard/summary` | No parameters | `200`, `data` contains `totalCustomers`, `totalVehicles`, `todayBookings`, `bookingStatusSummary`, `todayGrossRevenue`, `todayRefunds`, `todayRevenue`, `monthlyGrossRevenue`, `monthlyRefunds`, `monthlyRevenue`, `recentBookings` | `401`, `403`, `500`. |

### Vehicle types, brands, and models

| Resource and URL | Methods | Query/body |
|---|---|---|
| `/api/admin/vehicle-types` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/status` | List query: `page`, `limit`, `search` (up to 50 chars), `status` (`ACTIVE`/`INACTIVE`). Create/update fields: `type_name` (required on create, 1–50 chars), optional `description` (string or null, up to 255 chars). Status body: `{ "status": "ACTIVE" }`. |
| `/api/admin/vehicle-brands` | Same methods as vehicle types | List query: `page`, `limit`, `search` (up to 100 chars), `status`. Create/update body: `{ "brand_name": "Example" }`. Status body as above. |
| `/api/admin/vehicle-models` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/status` | List query: `page`, `limit`, `search`, `brand_id`, `vehicle_type_id`, `status`. Create/update fields: `brand_id`, `vehicle_type_id`, `model_name`, `model_year_start`, `model_year_end`; create requires the first three. Years may be null or 1901–2155. Status body as above. |

Response fields:

- Vehicle type: `vehicle_type_id`, `type_name`, `description`, `status`, `created_at`, `updated_at`.
- Vehicle brand: `brand_id`, `brand_name`, `status`, `created_at`, `updated_at`.
- Vehicle model: `model_id`, `brand_id`, `brand_name`, `vehicle_type_id`, `type_name`, `model_name`, `model_year_start`, `model_year_end`, `status`, `created_at`, `updated_at`.

Common errors: `400` validation, `401`/`403`, `404` missing record/parent, `409` duplicate name or model in use, `500`.

### Services and pricing

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/admin/services` | Query: `page`, `limit`, `search` (up to 100 chars), `status` (`ACTIVE`/`INACTIVE`) | Paginated `Service[]` | `400`, `401`, `403`, `500`. |
| `GET /api/admin/services/:id` | None | `data: Service` | `400` invalid ID, `401`, `403`, `404`, `500`. |
| `POST /api/admin/services` | `{ "service_name": "Oil change", "description": "Optional text", "duration_minutes": 45 }`; name and duration required | `201`, `data: Service` | `400`, `401`, `403`, `409` duplicate name, `500`. |
| `PATCH /api/admin/services/:id` | One or more of `service_name`, `description` (string/null), `duration_minutes` (positive integer) | `200`, `data: Service` | `400`, `401`, `403`, `404`, `409`, `500`. |
| `PATCH /api/admin/services/:id/status` | `{ "status": "ACTIVE" }` or `INACTIVE` | `200`, `data: Service` | `400`, `401`, `403`, `404`, `500`. |
| `GET /api/admin/services/:id/prices` | None | `200`, `data: Price[]` | `400`, `401`, `403`, `404` service missing, `500`. |
| `PUT /api/admin/services/:id/prices` | `{ "prices": [{ "vehicle_type_id": 1, "price": "1200.00" }] }`; non-empty array, unique type IDs, non-negative amounts with at most 2 decimals | `200`, `data: Price[]` | `400` invalid input or inactive type, `401`, `403`, `404` service/type missing, `500`. |

`Service` fields are `service_id`, `service_name`, `description`, `duration_minutes`, `status`, and timestamps. Price items include the service/type IDs, `type_name`, `price`, and timestamps.

### Users

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/admin/users` | Query: `page`, `limit`, `search` (up to 100 chars), `role` (`ADMIN`/`CUSTOMER`/`STAFF`), `status` (`ACTIVE`/`INACTIVE`) | Paginated users (`user_id`, `full_name`, `email`, `phone`, `role`, `status`, timestamps); no password hash | `400`, `401`, `403`, `500`. |
| `GET /api/admin/users/:id` | None | `data: User` | `400`, `401`, `403`, `404`, `500`. |
| `PATCH /api/admin/users/:id` | One or more of `full_name`, `email`, `phone` | `200`, `data: User` | `400`, `401`, `403`, `404`, `409` duplicate email, `500`. |
| `PATCH /api/admin/users/:id/role` | `{ "role": "CUSTOMER" }`; allowed roles are ADMIN, CUSTOMER, STAFF | `200`, `data: User` | `400` invalid role or self-role change, `401`, `403`, `404`, `500`. |
| `PATCH /api/admin/users/:id/status` | `{ "status": "ACTIVE" }` or `INACTIVE` | `200`, `data: User` | `400` invalid status or self-deactivation, `401`, `403`, `404`, `500`. |

### Coupons

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/admin/coupons` | Query: `page`, `limit`, `search` (up to 100 chars), `status` (`ACTIVE`/`INACTIVE`), `discount_type` (`PERCENT`/`FIXED`) | Paginated coupons | `400`, `401`, `403`, `500`. |
| `GET /api/admin/coupons/:id` | None | `data: Coupon` | `400`, `401`, `403`, `404`, `500`. |
| `GET /api/admin/coupons/:id/usages` | Query: `page`, `limit` | Paginated usage records, including booking and customer summary fields | `400`, `401`, `403`, `404`, `500`. |
| `POST /api/admin/coupons` | Required: `coupon_code`, `discount_type`, `discount_value`, `start_date`, `end_date`. Optional: `description`, `max_discount`, `min_order_amount`, `usage_limit`, `status`. | `201`, `data: Coupon` | `400` invalid amount/type/date/fields, `401`, `403`, `409` duplicate code, `500`. |
| `PATCH /api/admin/coupons/:id` | One or more create fields except `status` | `200`, `data: Coupon` | `400`, `401`, `403`, `404`, `409`, `500`. |
| `PATCH /api/admin/coupons/:id/status` | `{ "status": "ACTIVE" }` or `INACTIVE` | `200`, `data: Coupon` | `400`, `401`, `403`, `404`, `500`. |

`discount_type` is `PERCENT` or `FIXED`; percentage `discount_value` cannot exceed 100. Dates accept `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, or the datetime form with `T` in place of the space; start must precede end.

Coupon fields returned: `coupon_id`, `coupon_code`, `description`, `discount_type`, `discount_value`, `max_discount`, `min_order_amount`, `usage_limit`, `used_count`, `start_date`, `end_date`, `status`, `created_at`, `updated_at`. Usage items include `coupon_usage_id`, `coupon_id`, `booking_id`, `user_id`, `discount_amount`, `used_at`, booking date/status/amounts, and customer `full_name`/`email`.

### Bookings and reports

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/admin/bookings` | Query: `page`, `limit`, `search` (up to 100 chars), `booking_status`, `payment_status`, `date_from`, `date_to`, `sort` (`newest`/`oldest`, default `newest`) | Paginated booking rows | `400`, `401`, `403`, `500`. |
| `GET /api/admin/bookings/:id` | None | `data: { booking, customer, vehicle, schedule, services, payment, coupon }` | `400`, `401`, `403`, `404`, `500`. |
| `GET /api/admin/bookings/:id/history` | None | `200`, `data: BookingStatusHistory[]` | `400`, `401`, `403`, `404`, `500`. |
| `GET /api/admin/reports/bookings` | Query: optional `date_from`, `date_to` (`YYYY-MM-DD`), `group_by` (`day`/`month`, default `day`) | `data: { totalBookings, bookingCountsByStatus, bookingCountsByPeriod }` | `400`, `401`, `403`, `500`. |
| `GET /api/admin/reports/revenue` | Same query as bookings report | `data: { totalRevenue, successfulPayments, revenueByPeriod }` | `400`, `401`, `403`, `500`. |

Booking list statuses: `CONFIRMED`, `CHECKED_IN`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`, `NO_SHOW`. Payment filter statuses: `PENDING`, `PAID`, `FAILED`. `date_from` must not be after `date_to`.

Admin booking-list items include `booking_id`, `user_id`, customer name/email/phone, vehicle ID/plate/year/model/brand/type, booking date/times/status, `payment_status`, and total/discount/final amounts. Booking detail groups are `booking` (dates, times, status, notes, totals, timestamps), `customer` (`user_id`, name, email, phone), `vehicle` (vehicle fields and model/brand/type), `schedule` (schedule ID/date/times/capacity/status), `services`, `payment`, and `coupon`. History items contain `history_id`, old/new status, `changed_by`, `changed_by_name`, `reason`, and `created_at`.

## Shared payment, cancellation, and wallet APIs

These routes allow CUSTOMER or ADMIN tokens. Customers are limited to their own bookings/wallet; Admin may target other users where noted.

| Method and URL | Request | Success | Errors |
|---|---|---|---|
| `GET /api/payments/:bookingId` | None | `200`, `data: Payment` | `400` invalid ID, `401`, `403`, `404` booking/payment unavailable to caller, `500`. |
| `POST /api/payments/:bookingId` | `{ "payment_method": "SIMULATED" }`; allowed: `CASH`, `BANK_TRANSFER`, `WALLET`, `SIMULATED`. Amount is derived from the booking. | `201`, `data: Payment` | `400`, `401`, `403`, `404`, `409` existing payment, `500`. |
| `POST /api/payments/:bookingId/simulate` | `{ "payment_status": "PAID" }` or `FAILED`; only simulated payments can use this route | `200`, `data: Payment` | `400`, `401`, `403`, `404`, `409` payment state conflict, `500`. |
| `POST /api/payments/:bookingId/wallet` | No body or `{}` | `200`, `data: { payment: Payment, wallet: { wallet_id, balance } }` | `400` invalid/insufficient balance or booking state, `401`, `403`, `404`, `409`, `500`. |
| `POST /api/cancellations/:bookingId` | Optional `{ "reason": "..." }`; no refund amount is accepted. Only a `CONFIRMED` booking with a `PAID` Wallet payment and a matching debit from the booking owner's wallet can be cancelled. Other payment methods are not eligible for wallet refunds. | `200`, `data: { booking_id, booking_status, refund, wallet }` | `400` validation/payment requirement, `401`, `403`, `404`, `409` status/refund conflict, `500`. |
| `GET /api/wallet` | Admin must provide `user_id`; Customer may omit it or provide only their own ID | `200`, `data: { wallet_id, user_id, balance, created_at, updated_at }`. Missing wallet is represented with `wallet_id: null` and balance `"0.00"`. | `400` missing/invalid Admin target, `401`, `403`, `500`. |
| `GET /api/wallet/transactions` | `page` (default 1), `limit` (default 20, max 100), optional `transaction_type` (`CREDIT`/`DEBIT`); same `user_id` rules | Paginated transaction items | `400`, `401`, `403`, `500`. |
| `GET /api/wallet/refunds` | `page` (default 1), `limit` (default 20, max 100); same `user_id` rules | Paginated refund items | `400`, `401`, `403`, `500`. |

Payment responses include `payment_id`, `booking_id`, `amount`, `payment_method`, `payment_status`, `transaction_ref`, `paid_at`, `created_at`, and `updated_at`. Simulation is an implemented test/simulation path, not a payment-provider confirmation. On `/api/wallet/refunds`, `transaction_type` is accepted by the shared validator but is not applied as a filter.

Cancellation credits the original wallet with the paid amount less a 20% fee. A `PAID` status alone is not proof of settlement: simulated, cash, and bank-transfer payments cannot currently be refunded through this endpoint.

Wallet transaction items contain `wallet_transaction_id`, `amount`, `transaction_type`, `description`, `refund_id`, `booking_id`, and `created_at`. Refund items contain `refund_id`, `booking_id`, `payment_id`, `refund_amount`, `cancellation_fee`, `refund_status`, `processed_at`, and `created_at`. Cancellation returns a refund with those refund fields plus `refund_reason`; its wallet object contains `wallet_id` and `balance`.

## Examples

Login:

```http
POST /api/auth/login
Content-Type: application/json

{"email":"customer@example.com","password":"example-password"}
```

```json
{
  "status": "success",
  "data": {
    "accessToken": "<JWT>",
    "tokenType": "Bearer",
    "expiresIn": "<configured expiry>",
    "user": {
      "user_id": 42,
      "full_name": "A. Customer",
      "email": "customer@example.com",
      "role": "CUSTOMER"
    }
  }
}
```

List the customer's bookings:

```http
GET /api/customer/bookings?page=1&limit=20&booking_status=CONFIRMED
Authorization: Bearer <accessToken>
```

```json
{
  "status": "success",
  "data": {
    "items": [{
      "booking_id": 101,
      "booking_date": "2026-11-20",
      "start_time": "09:00:00",
      "end_time": "10:00:00",
      "booking_status": "CONFIRMED",
      "total_amount": 1500,
      "discount_amount": 0,
      "final_amount": 1500,
      "vehicle": { "vehicle_id": 70, "license_plate": "ABC-123" },
      "services": [],
      "payment": null
    }],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

Validation error:

```json
{ "status": "error", "message": "Invalid pagination parameters." }
```

Admin price update:

```http
PUT /api/admin/services/12/prices
Authorization: Bearer <adminAccessToken>
Content-Type: application/json

{"prices":[{"vehicle_type_id":1,"price":"1200.00"}]}
```

```json
{
  "status": "success",
  "data": [{
    "service_price_id": 45,
    "service_id": 12,
    "vehicle_type_id": 1,
    "type_name": "Sedan",
    "price": "1200.00"
  }]
}
```

## Operational routes

These are mounted but are not Admin/Customer business APIs:

- `GET /` is public and returns `{ "message": "Car Care Backend API is running!" }`.
- `GET /api/health/db` is public. On success it returns `status`, `message`, and the configured database name; on failure it returns `500` with a generic error.

## Not implemented / limits

- There is no individual Customer booking-detail endpoint or Admin booking mutation endpoint. Booking history is available through the Customer read endpoints; cancellation is the separate shared endpoint above.
- [STAFF] Shared login accepts ADMIN, CUSTOMER and STAFF. Staff APIs are documented under "Staff APIs".
- There are no Admin user create/delete routes, and no password-reset or token-refresh HTTP endpoints.
- Customer catalog routes are read-only. Customer service listing does not expose pagination or search filters; price lookup requires one `vehicle_type_id`.
- The documented database-backed behavior reflects source code only; endpoint responses can still depend on the configured database schema/data.
- The Customer booking route tests use a mocked connection and cannot prove concurrent InnoDB schedule-locking behavior; that requires an isolated MySQL concurrency test.

## Staff APIs  <!-- [STAFF] Staff & Service Management -->

All routes require a `Bearer` token whose current database role is `STAFF` (`requireCurrentStaff`). Requires the tables from `database/migrations/2026-11-15_staff_service.sql`.

| Endpoint | Body / Query | Notes |
|---|---|---|
| `GET /api/staff/bookings` | `date` (one day) or `date_from`/`date_to`, `booking_status`, `search`, `vehicle_id`, `page`, `limit` (max 200) | Daily queue sorted by start time when `date` is given; otherwise newest first. Items include `service_names`. |
| `GET /api/staff/bookings/:id` | – | `booking`, `customer`, `vehicle`, `services`, `payment`, `check_in`, `status_history`, `notes`, `allowed_next_statuses`. |
| `POST /api/staff/bookings/:id/check-in` | `{ mileage, fuel_level, condition_note?, note? }` | `CONFIRMED → CHECKED_IN`; writes `vehicle_check_ins`. `fuel_level`: `EMPTY`, `QUARTER`, `HALF`, `THREE_QUARTER`, `FULL`. |
| `PATCH /api/staff/bookings/:id/status` | `{ status, reason }` (reason required) | Allowed: `CHECKED_IN → IN_SERVICE`, `IN_SERVICE → COMPLETED`. `CANCELLED` returns `403` (staff cannot cancel). |
| `POST /api/staff/bookings/:id/no-show` | `{ reason }` | `CONFIRMED → NO_SHOW`, only after the appointment start time. |
| `POST /api/staff/bookings/:id/notes` | `{ note }` | Adds a note without changing status; writes `booking_notes`. |

Mutations return the updated booking detail. Errors: `400` invalid body, `403` role/cancel, `404` not found, `409` status not allowed.
