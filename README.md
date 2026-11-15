# Car Care Web Service 

**สมาชิก**
- 67150490 เชษฐกิตติ์ สืบสุขสันติ ( Leader Dev & Project Manage )  
- 67115191 ณัฐนันท์  แสงทอง  (  Sorftware Developer & Qa Tester )
- 67159844 ภูริภัทร ทองมวน ( Software developer & Ui Designer )
- -67112963 เมธัส เชยชม  ( Software developer & Ui Designer )

---

# การนำเสนอความคืบหน้า (CSI400)

ระบบจองบริการดูแลรถยนต์ออนไลน์ ใช้งานได้ 3 บทบาท
- **ลูกค้า (CUSTOMER):** จองบริการ ชำระเงิน ยกเลิก และดูประวัติ
- **ผู้ดูแลระบบ (ADMIN):** จัดการข้อมูลหลัก ผู้ใช้ คูปอง การจอง และรายงาน
- **พนักงาน (STAFF):** จัดการคิวงานในร้านและติดตามสถานะรถแต่ละคัน

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | React 19, Vite 8, lucide-react |
| Backend | Node.js, Express 5, mysql2, jsonwebtoken, bcryptjs, cors, dotenv |
| Database | MySQL 8.4 บน Railway |
| Testing | `node:test` (เทสต์ในตัวของ Node.js), ESLint |

ข้อมูลทุกตัวเลขในเอกสารนี้ตรวจจากโค้ดและฐานข้อมูลจริง ณ วันที่ 15 พ.ย. 2569

---

## 1. Architecture: หน้าที่ของแต่ละบริการและเส้นทางข้อมูล

```mermaid
flowchart LR
  subgraph FE["Frontend · React + Vite (:5173)"]
    AUTH["auth/<br/>Login · Register · AuthContext"]
    CUS["Customer/<br/>หน้าลูกค้า"]
    ADM["Admin/<br/>หน้าผู้ดูแล"]
    STF["Staff/<br/>หน้าพนักงาน"]
    CLI["Admin/api/client.js<br/>useApi (แนบ JWT)"]
  end
  subgraph BE["Backend · Node.js + Express (:5000)"]
    APP["app.js<br/>จุดรับ request /api/*"]
    MW["Auth middleware<br/>ตรวจ JWT + role"]
    MOD["Routes → Validators →<br/>Controllers → Services"]
  end
  DB[("MySQL 8.4<br/>Railway · 21 ตาราง")]
  AUTH & CUS & ADM & STF --> CLI -->|"HTTP JSON + Bearer token"| APP --> MW --> MOD -->|"SQL (mysql2 pool)"| DB
```

### Frontend (`frontend/src`)
| โฟลเดอร์ | หน้าที่ |
|---|---|
| `App.jsx` | ตัวเลือกหน้าตาม URL และพาผู้ใช้ไปพื้นที่ของ role ตัวเอง (`/customer`, `/admin`, `/staff`) |
| `auth/` | หน้า Login และ Register, `AuthContext` เก็บ JWT ใน sessionStorage และตรวจ session ด้วย `GET /api/auth/me` |
| `Customer/` | หน้าแรก, บริการ, แดชบอร์ด, รถของฉัน, จองบริการ, การจองของฉัน, ชำระเงิน, กระเป๋าเงิน |
| `Admin/` | แดชบอร์ด, การจอง, ลูกค้า, พนักงาน, บริการและราคา, คูปอง, การชำระเงิน, กระเป๋าเงิน, รายงาน |
| `Staff/` | คิวงานรายวันพร้อมปฏิทิน, รายละเอียดการจอง (รับรถ/เปลี่ยนสถานะ/หมายเหตุ/No-show), ประวัติการให้บริการ |
| `Admin/api/client.js` | ตัวเรียก API กลาง ใช้ร่วมกันทุกส่วน ใส่ `Authorization: Bearer <token>` และอ่าน `VITE_API_BASE_URL` |

### Backend (`backend/`)
ทุกโมดูลแบ่งชั้นเหมือนกัน: **routes** (กำหนด path + middleware) → **validators** (ตรวจข้อมูลเข้า) → **controllers** (แปลงผลเป็น HTTP status) → **services** (SQL และกติกาธุรกิจ)

| โมดูล | หน้าที่ |
|---|---|
| `Auth/` | ล็อกอิน, ตรวจ session, ออกจากระบบ, สมัครสมาชิกลูกค้า และ middleware ตรวจ JWT/role |
| `Public/` | แคตตาล็อกบริการที่ไม่ต้องล็อกอิน (หน้าแรก) |
| `Customer/` | โปรไฟล์, รถของลูกค้า, แคตตาล็อกรถ/บริการ/ราคา, ตารางเวลาว่าง, สร้างการจอง, ประวัติ |
| `Admin/` | ข้อมูลหลัก (ประเภท/ยี่ห้อ/รุ่นรถ, บริการ, ราคา), ผู้ใช้และสิทธิ์, คูปอง, การจอง, รายงาน, แดชบอร์ด และบริการกลางเรื่องชำระเงิน/ยกเลิก/กระเป๋าเงิน |
| `Staff/` | คิวงาน, รับรถ, เปลี่ยนสถานะ, No-show, หมายเหตุ |
| `shared/config/db.js` | connection pool ของ MySQL อ่านค่าจาก `backend/.env` |
| `scripts/generate-schedules.js` | สร้างช่วงเวลาให้บริการล่วงหน้า 30 วัน (จันทร์–เสาร์ วันละ 6 รอบ รอบละ 90 นาที รับได้ 2 คัน) |

> **เรื่อง API Gateway:** ตอนนี้ยังไม่มี API Gateway แยกเป็นบริการ `backend/app.js` ทำหน้าที่เป็นจุดรับ request เดียวของทุก `/api/*` แล้วส่งต่อไปยัง router ของแต่ละโมดูล พร้อมตั้ง CORS และแปลง JSON ให้ทุก request

### เส้นทางข้อมูลหลักของระบบ (วงจรการจอง)

```mermaid
stateDiagram-v2
  [*] --> CONFIRMED: ลูกค้าจอง (เลือกรถ บริการ ช่วงเวลา)
  CONFIRMED --> CHECKED_IN: พนักงานรับรถ
  CHECKED_IN --> IN_SERVICE: พนักงานเริ่มบริการ
  IN_SERVICE --> COMPLETED: พนักงานปิดงาน
  CONFIRMED --> NO_SHOW: พนักงานบันทึกลูกค้าไม่มา
  CONFIRMED --> CANCELLED: ลูกค้ายกเลิก (คืนเงินเข้ากระเป๋า หัก 20%)
```

---

## 2. API implementation: Endpoint และ HTTP Methods

ทั้งระบบมี **78 endpoint** นับจาก route ที่เปิดใช้ใน `backend/app.js`

| กลุ่ม | จำนวน | สิทธิ์ที่ต้องมี |
|---|---|---|
| Admin | 42 | ADMIN (รวม `/api/admin/auth/*` 3 ตัว) |
| Customer | 16 | CUSTOMER (ยกเว้น `register` ที่ไม่ต้องล็อกอิน) |
| Shared: payments / cancellations / wallet | 8 | CUSTOMER (เฉพาะของตัวเอง) หรือ ADMIN |
| Staff | 6 | STAFF |
| Auth (ล็อกอินกลาง) | 3 | `login` ไม่ต้องล็อกอิน, `me`/`logout` ต้องมี token |
| Public | 1 | ไม่ต้องล็อกอิน |
| System (`/`, `/api/health/db`) | 2 | ไม่ต้องล็อกอิน |

| HTTP Method | จำนวน | ตัวอย่าง |
|---|---|---|
| `GET` | 41 | `GET /api/customer/bookings`, `GET /api/admin/reports/revenue`, `GET /api/staff/bookings?date=` |
| `POST` | 19 | `POST /api/auth/login`, `POST /api/customer/bookings`, `POST /api/payments/:bookingId` |
| `PATCH` | 16 | `PATCH /api/admin/users/:id/role`, `PATCH /api/customer/profile`, `PATCH /api/staff/bookings/:id/status` |
| `PUT` | 1 | `PUT /api/admin/services/:id/prices` (แทนที่ตารางราคาของบริการทั้งชุด) |
| `DELETE` | 1 | `DELETE /api/customer/vehicles/:vehicleId` |

ระบบเลือกใช้ `PATCH` เป็นหลักแทน `PUT` เพราะส่วนใหญ่แก้แค่บางฟิลด์ ส่วน "ลบ" ข้อมูลหลักใช้การเปลี่ยน `status` เป็น `INACTIVE` (เช่น `PATCH .../:id/status`) เพื่อไม่ให้ข้อมูลเก่าที่อ้างอิงอยู่เสีย

### Endpoint สำคัญของแต่ละส่วน
| Method | Endpoint | ใช้ทำอะไร |
|---|---|---|
| `POST` | `/api/auth/login` | ล็อกอินทุก role ได้ JWT กลับมา |
| `POST` | `/api/customer/auth/register` | สมัครสมาชิก (ได้ role CUSTOMER เสมอ) |
| `GET` | `/api/customer/schedules/availability` | ดูช่วงเวลาที่ยังว่าง |
| `POST` | `/api/customer/bookings` | สร้างการจอง |
| `POST` | `/api/payments/:bookingId/wallet` | จ่ายเงินด้วยกระเป๋าเงิน |
| `POST` | `/api/cancellations/:bookingId` | ลูกค้ายกเลิกและคืนเงินเข้ากระเป๋า |
| `GET` | `/api/admin/dashboard/summary` | ตัวเลขสรุปบนแดชบอร์ด Admin |
| `PUT` | `/api/admin/services/:id/prices` | ตั้งราคาบริการตามประเภทรถ |
| `PATCH` | `/api/admin/users/:id/role` | เปลี่ยนสิทธิ์ผู้ใช้ เช่น ตั้งเป็น STAFF |
| `POST` | `/api/staff/bookings/:id/check-in` | พนักงานรับรถ |
| `PATCH` | `/api/staff/bookings/:id/status` | พนักงานเปลี่ยนสถานะพร้อมเหตุผล |

ทุก response ใช้รูปแบบเดียวกัน: สำเร็จ `{ "status": "success", "data": ... }` และผิดพลาด `{ "status": "error", "message": "..." }`

รายละเอียดครบทุก endpoint (body, query, error) อยู่ที่ [`backend/API_DOCUMENTATION.md`](backend/API_DOCUMENTATION.md)

---

## 3. Database: โครงสร้างข้อมูลและผลการบันทึกข้อมูลจริง

MySQL 8.4 บน Railway (database `railway`) มี **21 ตาราง**

```mermaid
erDiagram
  users ||--o{ vehicles : "เป็นเจ้าของ"
  users ||--o{ bookings : "จอง"
  users ||--o| wallets : "มีกระเป๋าเงิน"
  vehicle_brands ||--o{ vehicle_models : ""
  vehicle_types ||--o{ vehicle_models : ""
  vehicle_models ||--o{ vehicles : ""
  services ||--o{ service_prices : "ราคาตาม"
  vehicle_types ||--o{ service_prices : "ประเภทรถ"
  schedules ||--o{ bookings : "ช่วงเวลา"
  vehicles ||--o{ bookings : ""
  coupons ||--o{ bookings : "ส่วนลด"
  bookings ||--|{ booking_services : "บริการที่จอง"
  services ||--o{ booking_services : ""
  bookings ||--o| payments : "ชำระเงิน"
  payments ||--o{ refunds : "คืนเงิน"
  wallets ||--o{ wallet_transactions : "เข้า/ออก"
  bookings ||--o{ booking_status_history : "ประวัติสถานะ"
  bookings ||--o| vehicle_check_ins : "รับรถ"
  bookings ||--o{ booking_notes : "หมายเหตุพนักงาน"
  coupons ||--o{ coupon_usages : "การใช้คูปอง"
```

| กลุ่ม | ตาราง | จำนวนแถวจริง |
|---|---|---|
| ผู้ใช้ | `users` (role: ADMIN / CUSTOMER / STAFF) | 7 |
| รถ | `vehicle_types` · `vehicle_brands` · `vehicle_models` · `vehicles` | 7 · 14 · 25 · 5 |
| บริการและราคา | `services` · `service_prices` (ราคาแยกตามประเภทรถ) | 7 · 36 |
| เวลาให้บริการ | `business_hours` · `schedules` | 7 · 160 |
| การจอง | `bookings` · `booking_services` · `booking_status_history` | 7 · 9 · 4 |
| พนักงาน | `vehicle_check_ins` · `booking_notes` | 1 · 1 |
| คูปอง | `coupons` · `coupon_usages` | 1 · 0 |
| การเงิน | `payments` · `refunds` · `wallets` · `wallet_transactions` | 7 · 1 · 1 · 2 |
| ตรวจสอบย้อนหลัง | `audit_logs` | 0 |

**จุดออกแบบที่สำคัญ**
- **สถานะการจอง** เป็น ENUM 6 ค่า: `CONFIRMED`, `CHECKED_IN`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`, `NO_SHOW` และทุกครั้งที่เปลี่ยนจะบันทึกลง `booking_status_history` พร้อมผู้เปลี่ยนและเหตุผล
- **ชื่อและราคาบริการ** ถูกคัดลอกลง `booking_services` ตอนจอง ถ้าแก้ราคาในภายหลัง ราคาของการจองเก่าจะไม่เปลี่ยน
- **การจองหนึ่งรายการชำระเงินได้ครั้งเดียว** เพราะ `payments.booking_id` เป็น UNIQUE
- **การรับรถ** บันทึกได้ครั้งเดียวต่อการจอง เพราะ `vehicle_check_ins.booking_id` เป็น UNIQUE
- **ลบข้อมูลหลักแบบ soft delete** ด้วยคอลัมน์ `status` (`ACTIVE` / `INACTIVE`)

**หลักฐานการบันทึกข้อมูลจริง:** ตัวเลขจำนวนแถวในตารางด้านบนนับจาก Railway จริง และมีข้อมูลจากการใช้งานผ่านหน้าเว็บแล้ว เช่น การจอง 7 รายการ การชำระเงิน 7 รายการ การคืนเงิน 1 รายการ และการรับรถกับหมายเหตุของพนักงานอย่างละ 1 รายการ

SQL สำหรับเปิดโชว์ตอนนำเสนอ:

```sql
-- การจองล่าสุด พร้อมลูกค้า รถ และการชำระเงิน
SELECT b.booking_id, u.full_name, v.license_plate, b.booking_date, b.start_time,
       b.booking_status, b.final_amount, p.payment_method, p.payment_status
FROM bookings b
JOIN users u ON u.user_id = b.user_id
JOIN vehicles v ON v.vehicle_id = b.vehicle_id
LEFT JOIN payments p ON p.booking_id = b.booking_id
ORDER BY b.created_at DESC LIMIT 10;

-- ประวัติการเปลี่ยนสถานะ (ใครเปลี่ยน เมื่อไร เพราะอะไร)
SELECT h.booking_id, h.old_status, h.new_status, h.reason, u.full_name AS changed_by, h.created_at
FROM booking_status_history h LEFT JOIN users u ON u.user_id = h.changed_by
ORDER BY h.created_at DESC LIMIT 10;

-- กระเป๋าเงินและการคืนเงิน
SELECT w.user_id, w.balance, t.transaction_type, t.amount, t.description, t.created_at
FROM wallets w JOIN wallet_transactions t ON t.wallet_id = w.wallet_id
ORDER BY t.created_at DESC;
```

ตารางที่ส่วนพนักงานเพิ่ม (`vehicle_check_ins`, `booking_notes`) สร้างจาก [`database/migrations/2026-11-15_staff_service.sql`](database/migrations/2026-11-15_staff_service.sql)

---

## 4. Integration: Frontend → (จุดรับ API) → Backend → Database

**ตัวอย่าง 1: ลูกค้าจองบริการ**
1. `CustomerBookingPage.jsx` ดึงรถของลูกค้า (`GET /api/customer/vehicles`), บริการและราคา (`GET /api/customer/catalog/services`) และช่วงเวลาว่าง (`GET /api/customer/schedules/availability`)
2. ลูกค้ากดยืนยัน หน้าเว็บส่ง `POST /api/customer/bookings` ผ่าน `client.js` ซึ่งแนบ JWT ให้
3. `app.js` → `authenticateToken` → `requireCustomer` → validator → service
4. Service เปิด transaction ล็อกช่วงเวลา (`SELECT ... FOR UPDATE`) ตรวจจำนวนที่ว่าง คำนวณราคาตามประเภทรถ แล้วบันทึก `bookings` + `booking_services`
5. หน้าเว็บพาไปหน้าชำระเงิน `POST /api/payments/:bookingId` หรือจ่ายด้วยกระเป๋าเงิน `POST /api/payments/:bookingId/wallet`

**ตัวอย่าง 2: พนักงานรับรถและปิดงาน**
1. `StaffQueuePage.jsx` เรียก `GET /api/staff/bookings?date=` แสดงคิวของวัน และปฏิทินเรียก `?date_from=&date_to=` เพื่อแสดงจุดบอกวันที่มีการจอง
2. กด "รับรถเข้าร้าน" → `POST /api/staff/bookings/:id/check-in`
3. `authenticateToken` → `requireCurrentStaff` → `validateCheckIn` → service ใช้ transaction และ `SELECT ... FOR UPDATE` บันทึก `vehicle_check_ins` แล้วเปลี่ยนสถานะเป็น `CHECKED_IN` และเขียน `booking_status_history`
4. หน้าเว็บได้ข้อมูลใหม่กลับมาทันที จากนั้นใช้ `PATCH /status` เปลี่ยนเป็น `IN_SERVICE` และ `COMPLETED`

**ตัวอย่าง 3: Admin ตั้งพนักงาน**: หน้า "พนักงาน" ของ Admin เรียก `PATCH /api/admin/users/:id/role` เปลี่ยน role เป็น `STAFF` เมื่อผู้ใช้คนนั้นล็อกอินครั้งต่อไป ระบบจะพาไปหน้า `/staff`

**วิธีรันเพื่อสาธิต**

```bash
cd backend && npm install && npm start      # http://localhost:5000
cd frontend && npm install && npm run dev   # http://localhost:5173
```

ต้องมีไฟล์ `backend/.env` ตาม `backend/.env.example` (ค่าเชื่อมต่อ Railway, `JWT_SECRET` ยาวอย่างน้อย 32 ตัวอักษร และ `JWT_EXPIRES_IN`) ตรวจการเชื่อมต่อได้ที่ `GET http://localhost:5000/api/health/db`

---

## 5. Security: การตรวจสอบ JWT และการจัดการสิทธิ์

**การล็อกอิน**
- รหัสผ่านเก็บเป็น hash ด้วย **bcryptjs** และไม่ส่ง hash กลับในทุก response
- ล็อกอินสำเร็จได้ JWT ที่เซ็นด้วย `JWT_SECRET` (ต้องยาว ≥ 32 ตัวอักษร) และมีอายุตาม `JWT_EXPIRES_IN`
- บัญชีที่ `status = INACTIVE` ล็อกอินไม่ได้
- สมัครสมาชิกได้แค่ role CUSTOMER เท่านั้น ถ้าส่ง `role` หรือ `status` มาเองจะถูกปฏิเสธ

**Middleware ตรวจสิทธิ์** (`backend/Auth/middleware/authMiddleware.js`)
| Middleware | ตรวจอะไร | ใช้กับ |
|---|---|---|
| `authenticateToken` | header `Authorization: Bearer <token>`, ลายเซ็น และวันหมดอายุของ JWT | ทุก route ที่ต้องล็อกอิน |
| `requireAdmin` / `requireCurrentAdmin` | อ่าน role และ status **ล่าสุดจากตาราง users** ต้องเป็น ADMIN | โมดูล Admin ทั้งหมด |
| `requireCurrentStaff` | แบบเดียวกัน แต่ต้องเป็น STAFF | โมดูล Staff |
| `requireCustomer` | role ใน token ต้องเป็น CUSTOMER | โมดูล Customer |
| `requireCustomerOrAdmin` | CUSTOMER หรือ ADMIN, และลูกค้าเข้าถึงได้เฉพาะการจอง/กระเป๋าเงินของตัวเอง | payments, cancellations, wallet |
| `requireSupportedSessionRole` | role ต้องเป็น ADMIN / STAFF / CUSTOMER | `/api/auth/me`, `/api/auth/logout` |

Admin และ Staff ตรวจ role จากฐานข้อมูลทุก request ถ้า Admin ปิดบัญชีหรือเปลี่ยน role ของใคร สิทธิ์เดิมจะใช้ไม่ได้ทันที แม้ token ยังไม่หมดอายุ

**ป้องกันอื่น ๆ**
- ทุกคำสั่ง SQL ใช้ parameterized query (`?`) ป้องกัน SQL injection
- Validator รับเฉพาะฟิลด์ที่กำหนด และตรวจชนิด ความยาว และค่าที่อนุญาต
- งานที่แก้หลายตารางพร้อมกัน (จอง, ชำระเงิน, ยกเลิก, คืนเงิน, รับรถ) ใช้ transaction กันข้อมูลค้างครึ่งทาง
- กติกาสิทธิ์ทางธุรกิจ: พนักงานยกเลิกการจองแทนลูกค้าไม่ได้ (`403`) และลูกค้าดูหรือจ่ายการจองของคนอื่นไม่ได้

**ฝั่งหน้าเว็บ:** `App.jsx` พาผู้ใช้ไปเฉพาะพื้นที่ของ role ตัวเอง แต่การป้องกันจริงอยู่ที่ backend ถ้ายิง API ข้ามสิทธิ์เองจะได้ `401`/`403`

---

## 6. Testing: ผลทดสอบ API และกรณี Error

```bash
cd backend && node --test test/*.test.js
cd frontend && npx eslint . && npm run build && node --test test/*.test.js
```

**ผลล่าสุด (15 พ.ย. 2569)**
| ส่วน | ผล |
|---|---|
| Backend: 17 ไฟล์เทสต์ | `tests 139 · pass 139 · fail 0` |
| Frontend: ESLint ทั้งโปรเจกต์ | ไม่มี error |
| Frontend: build | สำเร็จ |
| Frontend: unit test | `pass 2 · fail 0` |

| ไฟล์เทสต์ | ครอบคลุม |
|---|---|
| `authService`, `sessionRoutes` | ล็อกอิน, role ที่อนุญาต, ตรวจ session |
| `customerRegistrationService`, `customerRegistrationValidator` | สมัครสมาชิก, อีเมลซ้ำ, ข้อมูลไม่ถูกต้อง |
| `customerProfileRoutes`, `customerVehicleRoutes` | โปรไฟล์และรถของลูกค้า |
| `customerCatalogRoutes`, `customerServiceCatalogRoutes` | แคตตาล็อกรถ บริการ และราคา |
| `customerScheduleAvailabilityRoutes`, `scheduleGeneration` | ช่วงเวลาว่างและการสร้างตารางเวลา |
| `customerBookingRoutes`, `customerBookingValidator`, `customerBookingHistoryRoutes` | สร้างการจองและประวัติการจอง |
| `paymentWalletRoutes` | ชำระเงิน, กระเป๋าเงิน, ยกเลิก, คืนเงิน |
| `adminUserManagementRoutes`, `dashboardService` | จัดการผู้ใช้/สิทธิ์ และแดชบอร์ด Admin |
| `staffBookingRoutes` | สิทธิ์พนักงาน, ห้ามยกเลิก, บังคับเหตุผล, กติกาสถานะ, No-show |

### ตัวอย่าง Error ที่ระบบตอบกลับ

| สถานการณ์ | HTTP | `message` |
|---|---|---|
| เรียก API ที่ต้องล็อกอินโดยไม่มี token | 401 | `Authentication required.` |
| token ปลอมหรือหมดอายุ | 401 | `Invalid or expired token.` |
| ลูกค้าเรียก API ของ Admin | 403 | `Administrator access required.` |
| ลูกค้าเรียก API ของพนักงาน | 403 | `Staff access required.` |
| พนักงานเรียก API ของลูกค้า | 403 | `Customer access required.` |
| พนักงานพยายามยกเลิกการจอง | 403 | `Staff cannot cancel bookings on behalf of customers.` |
| ข้อมูลที่ส่งมาไม่ถูกต้อง เช่น วันที่ผิดรูปแบบ | 400 | เช่น `date_from must not be after date_to.` |
| ไม่พบข้อมูล | 404 | เช่น `Booking not found.` |
| สมัครด้วยอีเมลที่มีอยู่แล้ว | 409 | `An account with this email already exists.` |
| ชำระเงินซ้ำ / เปลี่ยนสถานะผิดลำดับ | 409 | เช่น `Only CONFIRMED bookings can be checked in.` |
| `.env` ไม่ครบ (เช่นไม่มี `JWT_EXPIRES_IN`) | 500 | ล็อกอินไม่สำเร็จ (ข้อความ error ทั่วไป ไม่เปิดเผยรายละเอียด) |

---

## 7. Project status

### ✅ เสร็จแล้ว
- **Auth:** ล็อกอินรวมทุก role, สมัครสมาชิกลูกค้า, ตรวจ session, ออกจากระบบ
- **ลูกค้า:** หน้าแรกและหน้าบริการ, โปรไฟล์, จัดการรถ, ดูราคาตามประเภทรถ, ดูเวลาว่าง, จอง, ชำระเงิน (เงินสด/โอน/กระเป๋าเงิน/จำลอง), ยกเลิกพร้อมคืนเงินเข้ากระเป๋า, ประวัติการจอง
- **Admin:** แดชบอร์ด, จัดการประเภท/ยี่ห้อ/รุ่นรถ, บริการและราคา, ผู้ใช้และสิทธิ์ (รวมตั้ง STAFF), คูปอง, ดูการจองพร้อมประวัติ, รายงานการจองและรายได้, การชำระเงินและกระเป๋าเงิน
- **พนักงาน:** คิวงานรายวันพร้อมปฏิทิน, รายละเอียดลูกค้า/รถ/บริการ, รับรถ, เปลี่ยนสถานะพร้อมเหตุผล, หมายเหตุ, No-show, ประวัติการให้บริการ
- **ระบบ:** ฐานข้อมูล 21 ตารางบน Railway, สคริปต์สร้างตารางเวลา, API 78 endpoint, เทสต์ backend ผ่าน 139/139, เอกสาร API

### 🔄 กำลังดำเนินการ
- รวมงานของแต่ละ branch เข้า `main` ผ่าน Pull Request (เช่น `feat/staff-service`)
- ทดสอบวงจรเต็มกับข้อมูลจริง: ลูกค้าจอง → ชำระเงิน → พนักงานรับรถ → ปิดงาน → Admin ดูรายงาน

### ⚠️ ปัญหาที่พบ
- **ยังไม่มี API Gateway แยก:** ตอนนี้ใช้ `app.js` เป็นจุดรับ request เดียว
- **`database/schema.sql` ยังว่าง:** สมาชิกตั้งฐานข้อมูลในเครื่องตัวเองไม่ได้ ทุกคนต้องใช้ Railway ร่วมกัน และไม่มีฐานข้อมูลแยกสำหรับทดสอบ
- **การเปลี่ยนโครงสร้างฐานข้อมูลต้องรันเอง:** ยังไม่มีระบบ migration อัตโนมัติ
- **การชำระเงินเป็นแบบจำลอง:** ยังไม่เชื่อมผู้ให้บริการชำระเงินจริง และคืนเงินอัตโนมัติได้เฉพาะการจองที่จ่ายด้วยกระเป๋าเงิน
- **ยังไม่มีเทสต์การจองพร้อมกันกับ MySQL จริง:** เทสต์การจองใช้ฐานข้อมูลจำลอง จึงยังพิสูจน์ไม่ได้ว่าล็อกช่วงเวลาถูกต้องเมื่อมีคนจองพร้อมกัน
- **ยังไม่มีปุ่มลืมรหัสผ่านและการต่ออายุ token:** ผู้ใช้ต้องล็อกอินใหม่เมื่อ token หมดอายุ
- **ตาราง `audit_logs` มีแล้วแต่ยังไม่ได้ใช้บันทึก**
- **คูปองยังใช้ตอนจองไม่ได้:** Admin สร้างและจัดการคูปองได้แล้ว แต่ขั้นตอนจองของลูกค้ายังไม่รับคูปอง (`coupon_usages` จึงยังว่าง)

### 📌 แผนงานถัดไป
1. Merge ทุก branch เข้า `main` และทดสอบรวมทั้งระบบ
2. Export โครงสร้างฐานข้อมูลลง `database/schema.sql` พร้อมข้อมูลตัวอย่าง (seed)
3. เพิ่ม API Gateway หรือ reverse proxy หน้า backend
4. เพิ่มเทสต์ integration กับ MySQL จริง โดยเฉพาะการจองช่วงเวลาเดียวกันพร้อมกัน
5. ให้ลูกค้าใส่คูปองตอนจอง และบันทึกลง `coupon_usages`
6. บันทึกการกระทำสำคัญของ Admin/Staff ลง `audit_logs`
7. เพิ่มลืมรหัสผ่านและการต่ออายุ token
