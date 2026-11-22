# คู่มือไฟล์ทั้งโปรเจกต์ Car Care

ไว้อ่านก่อนพรีเซ้นต์ เผื่ออาจารย์ถามว่า "โค้ดส่วนนี้อยู่ไหน เขียนยังไง"
(ไม่นับรูป เสียง และโมเดล 3D)

---

## 0. ภาพรวม 1 นาที

```
Car-care/
├─ frontend/   React 19 + Vite  → หน้าเว็บ (deploy บน Vercel)
├─ backend/    Node.js + Express 5 → API (port 5000)
├─ database/   schema.sql + migrations → MySQL 8.4 บน Railway
├─ docs/       เอกสารอ้างอิง (ราคา, คู่มือนี้)
└─ README.md   เอกสารหลักของโปรเจกต์
```

**เส้นทางของ 1 request (ตอบบ่อยที่สุด)**

```
หน้าเว็บ (fetch ผ่าน frontend/src/Admin/api/client.js แนบ JWT)
  → backend/app.js  (cors, express.json, auditTrail, เลือก router ตาม path)
  → routes/*.js      (กำหนด URL + ใส่ middleware)
  → authMiddleware   (ตรวจ token / role)
  → validators/*.js  (ตรวจข้อมูลที่ส่งมา ถ้าผิด → 400)
  → controllers/*.js (รับ req ส่ง res, แปลง error เป็น status code)
  → services/*.js    (logic จริง + SQL ผ่าน pool.execute พร้อม ? กัน SQL injection)
  → MySQL
```

ทุกโมดูลใน backend แยกไฟล์ 4 ชั้นแบบนี้เหมือนกันหมด: **routes → validators → controllers → services**

---

## 1. Backend (`backend/`)

### 1.1 ไฟล์หลัก

| ไฟล์ | คืออะไร |
|---|---|
| `server.js` | จุดเริ่มรัน: โหลด `.env`, เปิด port 5000, ตั้ง job ทุกนาทีให้ยกเลิกการจองที่ไม่จ่ายใน 15 นาที และส่งแจ้งเตือนก่อนวันนัด 1 วัน |
| `app.js` | สร้าง Express app: ปิด `X-Powered-By`, `TRUST_PROXY`, cors, json, audit log, ผูกทุก router กับ URL, 404 JSON, ตัวจัดการ error กลาง (ไม่มี stack trace) |
| `package.json` | dependency: express, mysql2, jsonwebtoken, bcryptjs, cors, dotenv, nodemon |
| `.env.example` | ตัวอย่างตัวแปร: DB, `JWT_SECRET` (≥32 ตัว), `JWT_EXPIRES_IN`, `TRUST_PROXY` (ไฟล์ `.env` จริงไม่อยู่ใน git) |
| `API_DOCUMENTATION.md` | เอกสารทุก endpoint: body, query, status code |

### 1.2 `shared/` — ของที่ทุกโมดูลใช้ร่วมกัน

| ไฟล์ | คืออะไร | ถ้าโดนถาม |
|---|---|---|
| `config/db.js` | connection pool ของ mysql2 อ่านค่าจาก `.env`; ให้คอลัมน์ DATE ออกมาเป็น `"YYYY-MM-DD"` กันวันเลื่อนเพราะ timezone | "ต่อฐานข้อมูลยังไง" |
| `middleware/auditTrail.js` | บันทึกทุกการแก้ไขสำคัญของ Admin/Staff ลง `audit_logs` (ใคร ทำอะไร ค่าก่อน/หลัง) ไม่เก็บรหัสผ่าน | "ตรวจย้อนหลังได้ไหมว่าใครแก้อะไร" |
| `middleware/rateLimit.js` | จำกัดล็อกอินผิด 5 ครั้ง/15 นาที, 20 ครั้งต่อ IP, สมัคร 5 ครั้ง/ชม. → 429 | "กัน brute force ยังไง" |
| `routes/notificationRoutes.js` | `GET /api/notifications`, `POST /read` ของกระดิ่ง | |
| `services/notificationService.js` | สร้างแจ้งเตือนใน transaction เดียวกับงานหลัก, job เตือนก่อนวันนัด | |
| `services/bookingPaymentHold.js` | การจองที่รอจ่ายกันคิวไว้ 15 นาที เกินแล้วยกเลิกอัตโนมัติ | "ถ้าจองแล้วไม่จ่ายล่ะ" |
| `services/couponPricing.js` | กติกาคูปองทั้งหมด (วันหมดอายุ, ยอดขั้นต่ำ, จำนวนสิทธิ์รวม, สิทธิ์ต่อคน) คิดเงินเป็นสตางค์ด้วย BigInt กันทศนิยมเพี้ยน | "คิดส่วนลดยังไง" |
| `services/shopTime.js` | DB เป็น UTC แต่ร้านอยู่ UTC+7 → มี `SHOP_NOW_SQL`, `SHOP_TODAY_SQL` ใช้แทน `NOW()` | "เรื่องเวลา/timezone" |
| `services/slotPlanner.js` | บริการที่นานเกิน 1 ช่องเวลาจะจองช่องถัดไปที่ติดกันต่อให้ และเช็กว่าช่องไม่เต็ม | "เช็กคิวเต็มยังไง" |
| `services/verifiedPaymentSql.js` | เงื่อนไข SQL "การจ่ายที่ยืนยันแล้ว" ใช้ร่วมกันในรายงาน/แดชบอร์ด | |

### 1.3 `Auth/` — ล็อกอิน สมัคร และตรวจสิทธิ์

| ไฟล์ | คืออะไร |
|---|---|
| `routes/loginRoutes.js` | `POST /api/auth/login` (ผ่าน rate limit ก่อน) |
| `routes/authRoutes.js` | `/api/admin/auth/*` (me, logout ของ Admin; login ใช้ตัวเดียวกัน) |
| `routes/customerAuthRoutes.js` | `POST /api/customer/auth/register` |
| `routes/sessionRoutes.js` | `GET /api/auth/me`, `POST /api/auth/logout` |
| `validators/authValidator.js` | ตรวจ email/password ตอนล็อกอิน |
| `validators/customerRegistrationValidator.js` | ตรวจตอนสมัคร: ชื่อ, อีเมล, รหัส **8–1024 ตัว**, เบอร์ 10 หลัก, ห้ามส่ง role มาเอง |
| `controllers/authController.js` | ส่ง 200 / 401 "Invalid email or password." |
| `controllers/customerRegistrationController.js` | ส่ง 201 / 409 อีเมลซ้ำ |
| `controllers/sessionController.js` | ตอบข้อมูลผู้ใช้ปัจจุบัน |
| `services/authService.js` | **`bcrypt.compare` เทียบรหัส** แล้ว **`jwt.sign` ออก token** (บรรทัด ~42–47); บัญชี INACTIVE ล็อกอินไม่ได้ |
| `services/customerRegistrationService.js` | เช็กอีเมลซ้ำ แล้ว **`bcrypt.hash` 12 รอบ** ก่อนบันทึก role CUSTOMER |
| `services/sessionService.js` | โหลดข้อมูลผู้ใช้จาก DB ตาม token |
| `middleware/authMiddleware.js` | `authenticateToken` (ตรวจลายเซ็น+วันหมดอายุ JWT), `requireAdmin`/`requireCurrentStaff`/`requireCurrentStaffOrAdmin` (**เช็ก role ล่าสุดจาก DB**), `requireCustomer`, `requireCustomerOrAdmin` |

### 1.4 `Admin/` — ฝั่งผู้ดูแลร้าน (ขอบเขตของเชษฐกิตติ์)

แต่ละเรื่องมีไฟล์ครบ 4 ชั้น (`routes/` `validators/` `controllers/` `services/`) ชื่อเดียวกัน

| เรื่อง | ชื่อไฟล์ | ทำอะไร |
|---|---|---|
| แดชบอร์ด | `dashboard*` | ตัวเลขสรุปวันนี้/เดือนนี้ (นับตามเวลาไทย) |
| รายงาน | `report*` | รายงานรายได้และบริการ ตามช่วงวันที่ |
| ประเภทรถ / ยี่ห้อ / รุ่น | `vehicleType*`, `vehicleBrand*`, `vehicleModel*` | เพิ่ม แก้ เปิด/ปิด |
| บริการ | `service*` | บริการ + ราคาตามประเภทรถ (`PUT /:id/prices`) |
| ตารางเวลา | `schedule*` | ดูช่องเวลา, ปรับจำนวนคิวต่อช่อง |
| ผู้ใช้ | `user*` | รายชื่อ, สร้างพนักงาน (รหัส ≥ 8), เปลี่ยน role/สถานะ (เปลี่ยนของตัวเองไม่ได้) |
| คูปอง | `coupon*` | สร้าง/แก้คูปอง, จำกัดสิทธิ์ต่อคน (`per_user_limit`) |
| การจอง | `booking*` | ดูรายการจองทั้งหมด + รายละเอียด |
| ชำระเงิน | `payment*` | สร้างการจ่าย, จ่ายจำลอง, จ่ายด้วยกระเป๋าเงิน, พนักงาน/แอดมินยืนยันรับเงิน (`/verify`) — ใช้ **transaction + `FOR UPDATE`** กันจ่ายซ้ำ |
| ยกเลิก/คืนเงิน | `cancellation*` | ยกเลิกก่อนจ่ายฟรี, หลังจ่ายคืน 80% เข้ากระเป๋าเงิน |
| กระเป๋าเงิน | `wallet*` | ยอดคงเหลือและประวัติธุรกรรม |
| ค้นหาการชำระเงิน | `routes/paymentLookupRoutes.js` | ค้นด้วยเลขการจ่าย/เลขอ้างอิง/ชื่อ/อีเมล/เบอร์/ทะเบียน (escape `%` `_`) |
| ประวัติการแก้ไข | `routes/auditLogRoutes.js` | อ่าน `audit_logs` เฉพาะ Admin, แก้/ลบไม่ได้ |

### 1.5 `Customer/` — ฝั่งลูกค้า (ขอบเขตของภูริภัทร + ณัฐนันท์)

| เรื่อง | ชื่อไฟล์ | ทำอะไร |
|---|---|---|
| โปรไฟล์ | `profile*` | ดู/แก้ชื่อและเบอร์ (แก้ได้แค่ 2 ช่องนี้) |
| รถของฉัน | `vehicle*` | เพิ่ม แก้ ลบรถของตัวเองเท่านั้น |
| แคตตาล็อกรถ | `catalog*` | รายการประเภท/ยี่ห้อ/รุ่นให้เลือกตอนเพิ่มรถ |
| บริการ | `serviceCatalog*` | รายการบริการและราคา |
| ช่องเวลาว่าง | `schedule*` | ช่องเวลาที่จองได้ของวันนั้น |
| จอง | `booking*` | **สร้างการจอง**: เช็กรถเป็นของลูกค้า, หาช่องเวลาด้วย `slotPlanner`, คิดคูปอง, ทั้งหมดใน transaction ล็อกแถวกันจองชน |
| ประวัติการจอง | `bookingHistory*` | รายการจองของตัวเอง + รายละเอียด |
| คูปอง | `routes/couponRoutes.js` | `/available` คูปองที่ใช้ได้, `/preview` คำนวณส่วนลดก่อนจอง |

### 1.6 `Staff/` — ฝั่งพนักงาน (ขอบเขตของเมธัส)

| ไฟล์ | ทำอะไร |
|---|---|
| `routes/staffBookingRoutes.js` | คิวงานรายวัน, รายละเอียด, รับรถ (check-in), เปลี่ยนสถานะงาน, No-show, เพิ่มหมายเหตุ |
| `validators/` `controllers/` `services/staffBooking*` | ตรวจลำดับสถานะ (เช่น เช็กอินได้เฉพาะ CONFIRMED), No-show ริบเงิน 100% |

### 1.7 `Public/` — ไม่ต้องล็อกอิน

| ไฟล์ | ทำอะไร |
|---|---|
| `routes/serviceCatalogRoutes.js` | รายการบริการบนหน้าแรก |
| `routes/availabilityRoutes.js` | ปฏิทินว่าง/เต็มรายสัปดาห์ (ไม่เปิดเผยข้อมูลการจอง, ปิดวันอาทิตย์) |

### 1.8 `scripts/`

| ไฟล์ | ทำอะไร |
|---|---|
| `generate-schedules.js` | สร้างช่องเวลาล่วงหน้า 30 วัน (09:00–18:00 ช่องละ 1.5 ชม. ช่องละ 2 คิว) |
| `demo-seed.js` | ใส่ข้อมูลเดโม่สมจริง: ประวัติ 4 สัปดาห์, คิววันนี้, คิวล่วงหน้า 3 สัปดาห์ |
| `demo-data.js` | ข้อมูลสมมติที่ seed ใช้ (บัญชี `@carcare.test` ทั้งหมด) |
| `demo-clear.js` | ลบข้อมูลเดโม่ทั้งหมด (หาจากโดเมน `@carcare.test`) |

### 1.9 `test/` — 25 ไฟล์, 200 เทสต์ (`node --test test/*.test.js`)

เทสต์จำลอง `pool.execute` จึงไม่แตะฐานข้อมูลจริง ชื่อไฟล์ตรงกับสิ่งที่ทดสอบ เช่น
`authService`, `customerBookingRoutes`, `paymentWalletRoutes`, `staffBookingRoutes`,
`auditTrail`, `couponPerUserLimit`, `securityHardening` (ตารางเต็มอยู่ใน README หัวข้อ Testing)

---

## 2. Database (`database/`)

| ไฟล์ | คืออะไร |
|---|---|
| `schema.sql` | โครงสร้าง 23 ตาราง ล่าสุด (users, vehicles, bookings, payments, coupons, wallets, audit_logs, notifications ...) |
| `migrations/2026-11-15_staff_service.sql` | ตาราง `vehicle_check_ins`, `booking_notes` |
| `migrations/2026-11-15_payment_verifications.sql` | ตาราง `payment_verifications` |
| `migrations/2026-11-16_pay_before_confirm.sql` | สถานะ `PENDING_PAYMENT` (ต้องจ่ายก่อนถึงยืนยันคิว) |
| `migrations/2026-11-21_notifications.sql` | ตาราง `notifications` |
| `migrations/2026-11-22_coupon_per_user_limit.sql` | คอลัมน์ `coupons.per_user_limit` |
| `test-data/dashboard-test-data.sql` | ข้อมูลทดสอบแดชบอร์ดชุดเก่า |

---

## 3. Frontend (`frontend/`)

### 3.1 ไฟล์หลัก

| ไฟล์ | คืออะไร |
|---|---|
| `index.html` | หน้า HTML เดียวของเว็บ |
| `src/main.jsx` | จุดเริ่ม React: render `<App />` ลงใน `#root` |
| `src/App.jsx` | ห่อแอปด้วย LanguageProvider + AuthProvider และเป็น **ตัวเลือกหน้า (router เขียนเอง)** ดู `window.location.pathname` แล้วเลือกหน้า: `/` `/services` `/about` `/login` `/register` `/customer/*` `/admin/*` `/staff/*` และพาไปหน้าตาม role |
| `src/index.css`, `src/App.css` | สไตล์พื้นฐาน |
| `vite.config.js` | ตั้งค่า Vite |
| `vercel.json` | ให้ทุก path ส่งไป `index.html` (เพราะเป็น SPA) |
| `eslint.config.js` | กฎตรวจโค้ด |
| `public/models/`, `public/sounds/`, `public/team/` | โมเดล Urus (glb), เสียงท่อ, รูปทีม |
| `test/customerFormatters.test.js` | เทสต์ฟังก์ชันจัดรูปแบบเงิน/วันที่ (6 เทสต์) |

### 3.2 `src/auth/` — หน้า Login/Register ธีมโรงรถ

| ไฟล์ | คืออะไร |
|---|---|
| `AuthGaragePage.jsx` | หน้าโรงรถ: กดรถเพื่อสตาร์ท, ควันท่อ, ไฟหน้าส่องฟอร์ม, รถดับเมื่อผิด, ขับออกเมื่อสำเร็จ |
| `UrusScene3D.jsx` | ฉาก 3D (three.js / React Three Fiber): กล้อง แสง ไฟหน้า เงา |
| `CarModel.jsx` | โหลดและแสดงโมเดล Urus สีเหลือง |
| `useCarModel3d.js` | เช็กว่าโมเดล 3D โหลดได้ไหม ถ้าไม่ได้ใช้รูป SVG แทน |
| `SuperSuv.jsx` | รูปรถ SVG สำรอง |
| `engineSound.js` | เสียงสตาร์ท/เดินเบา/เร่ง ด้วย Web Audio จากไฟล์ mp3, ปุ่มปิดเสียง |
| `LoginForm.jsx` | ฟอร์มล็อกอิน + ข้อความ "ลองใหม่ใน xx นาที" เมื่อโดน 429 |
| `RegisterForm.jsx` | ฟอร์มสมัคร ตรวจรหัส ≥ 8 ตัวก่อนส่ง |
| `PasswordField.jsx` | ช่องรหัสผ่านพร้อมปุ่มแสดง/ซ่อน และข้อความใบ้ |
| `AuthContext.jsx`, `authContext.js`, `useAuth.js` | เก็บสถานะล็อกอิน: token ใน sessionStorage, `login()`, `logout()`, ตรวจ session หมดอายุ |
| `auth.css` | สไตล์หน้าโรงรถ |

### 3.3 `src/Admin/` — หน้าผู้ดูแล

| ไฟล์ | คืออะไร |
|---|---|
| `AdminApp.jsx` | โครงหน้า Admin + เลือกหน้าตาม `/admin/...` |
| `api/client.js` | **`apiRequest()` ตัวเรียก API กลางของทั้งเว็บ** แนบ `Authorization: Bearer`, แปลง error เป็น `ApiError(message, status, payload)` |
| `hooks/useApi.js` | ผูก `apiRequest` กับ token ปัจจุบัน |
| `hooks/useRemoteData.js` | โหลดข้อมูล + loading/error/refresh |
| `hooks/usePagedRows.js` | แบ่งหน้าตาราง |
| `components/AdminLayout.jsx`, `AdminHeader.jsx`, `AdminSidebar.jsx`, `AdminAccountMenu.jsx` | โครงหน้า, แถบบน, เมนูซ้าย, เมนูบัญชี |
| `components/AdminPageState.jsx` | ชิ้นส่วนใช้ซ้ำ: หัวหน้า, ตาราง, แบ่งหน้า, สถานะโหลด/ว่าง/ผิดพลาด |
| `components/AdminModal.jsx`, `AdminIcon.jsx` | กล่อง popup, ไอคอน |
| `components/DashboardCharts.jsx` | กราฟ SVG ในแดชบอร์ด |
| `pages/DashboardPage.jsx` | แดชบอร์ด |
| `pages/BookingsPage.jsx` | รายการจอง |
| `pages/SchedulesPage.jsx` | ตารางเวลา/จำนวนคิว |
| `pages/ServicesPage.jsx` | บริการและราคา |
| `pages/VehicleTypesPage.jsx` | ประเภท/ยี่ห้อ/รุ่นรถ |
| `pages/CustomersPage.jsx`, `StaffPage.jsx` | ลูกค้า, พนักงาน |
| `pages/CouponsPage.jsx` | คูปอง |
| `pages/PaymentsPage.jsx` | ค้นหาการชำระเงิน + ข้อมูลลูกค้า/รถ/นัด, ยืนยันรับเงิน |
| `pages/WalletPage.jsx` | กระเป๋าเงินลูกค้า |
| `pages/ReportsPage.jsx` | รายงาน |
| `pages/AuditLogPage.jsx` | ประวัติการแก้ไข |
| `pages/ModulePlaceholder.jsx` | หน้าว่างสำหรับเมนูที่ยังไม่มี |
| `utils/formatDate.js`, `formatMoney.js`, `formatStatusLabel.js`, `pageSize.js` | จัดรูปแบบวันที่, เงิน ("1,500.00 ฿"), ชื่อสถานะ, จำนวนแถวต่อหน้า |
| `styles/admin.css` | สไตล์ฝั่ง Admin |

### 3.4 `src/Customer/` — หน้าลูกค้าและหน้าสาธารณะ

| ไฟล์ | คืออะไร |
|---|---|
| `CustomerLanding.jsx` | หน้าแรก (`/`): hero, ขั้นตอนการจอง, บริการเด่น |
| `ServicesPage.jsx` | หน้าบริการ (`/services`) + ราคาตามประเภทรถ |
| `AvailabilityCalendar.jsx` | ปฏิทินคิวว่างรายสัปดาห์บนหน้าบริการ |
| `AboutPage.jsx`, `aboutData.js` | หน้าทีม (`/about`), ชื่อ TH/EN, เครดิตไลบรารี |
| `CustomerDashboardPage.jsx` | หน้าหลักหลังล็อกอิน (`/customer`) |
| `CustomerBookingPage.jsx` | **หน้าจอง** (`/customer/booking`): เลือกรถ บริการ วัน เวลา คูปอง |
| `CustomerPaymentPage.jsx` | หน้าจ่ายเงิน (`/customer/payment/:id`) นับถอยหลัง 15 นาที |
| `MyBookingsPage.jsx` | การจองของฉัน + ยกเลิก |
| `MyVehiclesPage.jsx` | รถของฉัน |
| `CustomerProfilePage.jsx` | โปรไฟล์ |
| `CustomerWalletPage.jsx` | กระเป๋าเงิน (เงินคืน) |
| `CustomerHeader.jsx`, `CustomerFooter.jsx`, `CustomerNotFoundPage.jsx` | แถบบน, ท้ายเว็บ, หน้า 404 |
| `VehicleTypePicker.jsx`, `AnimatedPrice.jsx`, `ServiceIcon.jsx` | ปุ่มเลือกประเภทรถ, ตัวเลขราคาแบบเลื่อน, ไอคอนบริการ |
| `vehicleTypePrices.js`, `customerFormatters.js`, `serviceAssets.js`, `shopInfo.js`, `useLandingMotion.js` | ราคาตามประเภทรถ, จัดรูปแบบ, รูปบริการ, ข้อมูลร้าน, เอฟเฟกต์เลื่อนแล้วค่อยๆ โผล่ |
| `*.css` | สไตล์แต่ละหน้า |

### 3.5 `src/Staff/` — หน้าพนักงาน

| ไฟล์ | คืออะไร |
|---|---|
| `StaffApp.jsx` | โครงหน้าพนักงาน `/staff/*` |
| `pages/StaffQueuePage.jsx` | คิวงานวันนี้ + ปฏิทิน |
| `pages/StaffBookingDetailPage.jsx` | รายละเอียดงาน: รับรถ, เปลี่ยนสถานะ, No-show, หมายเหตุ |
| `pages/StaffHistoryPage.jsx` | ประวัติงาน |
| `components/StaffCalendar.jsx`, `StaffUi.jsx` | ปฏิทินรายเดือน, ชิ้นส่วน UI |
| `api/staffBookingApi.js` | เรียก `/api/staff/bookings` |
| `api/staffMockApi.js` | ข้อมูลจำลอง (เปิดด้วย `VITE_STAFF_MOCK=true`) |
| `hooks/useStaffRequest.js`, `utils/staffFormat.js`, `styles/staff.css` | โหลดข้อมูล, จัดรูปแบบ, สไตล์ |

### 3.6 อื่นๆ

| ไฟล์ | คืออะไร |
|---|---|
| `src/i18n/messages.js` | **ข้อความทุกหน้าทั้งไทยและอังกฤษ** (`'key': { TH, EN }`) |
| `src/i18n/LanguageContext.jsx` | ฟังก์ชัน `t('key', {params})` + จำภาษาที่เลือก |
| `src/i18n/LanguageToggle.jsx` | ปุ่ม TH / EN |
| `src/notifications/NotificationBell.jsx` | กระดิ่งแจ้งเตือน (ดึงใหม่ทุก 20 วินาทีตอนเปิดหน้าอยู่, กดอ่านแล้ว) |

---

## 4. คำถามที่น่าจะโดน → เปิดไฟล์ไหน

| คำถาม | ไฟล์ |
|---|---|
| เก็บรหัสผ่านยังไง | `backend/Auth/services/customerRegistrationService.js` (bcrypt.hash 12 รอบ) |
| ล็อกอินทำงานยังไง / JWT | `backend/Auth/services/authService.js` |
| กันคนไม่มีสิทธิ์เข้า Admin | `backend/Auth/middleware/authMiddleware.js` (`requireAdmin` เช็ก DB ทุกครั้ง) |
| กัน SQL injection | ทุก `services/*.js` ใช้ `pool.execute(sql, [ค่า])` แบบมี `?` |
| ลูกค้าดูข้อมูลคนอื่นได้ไหม (IDOR) | service ฝั่งลูกค้าใส่ `WHERE user_id = ?` จาก token ทุก query |
| กันจองชน / คิวเต็ม | `backend/Customer/services/bookingService.js` + `shared/services/slotPlanner.js` (transaction + `FOR UPDATE`) |
| จองแล้วไม่จ่าย | `shared/services/bookingPaymentHold.js` + job ใน `server.js` |
| จ่ายเงิน / ยืนยันรับเงิน | `backend/Admin/services/paymentService.js` |
| ยกเลิกแล้วคืนเงินเท่าไหร่ | `backend/Admin/services/cancellationService.js` (ก่อนจ่ายฟรี, หลังจ่ายหักค่าธรรมเนียม 20% คืน 80% เข้ากระเป๋าเงิน — บรรทัด ~39) |
| คิดคูปอง / จำกัดสิทธิ์ต่อคน | `shared/services/couponPricing.js` |
| เรื่องเวลาไทย | `shared/services/shopTime.js` |
| ใครแก้อะไรเมื่อไหร่ | `shared/middleware/auditTrail.js` + หน้า `AuditLogPage.jsx` |
| กัน brute force | `shared/middleware/rateLimit.js` |
| error ไม่หลุดรายละเอียด | ท้ายไฟล์ `backend/app.js` |
| หน้าเว็บเปลี่ยนหน้ายังไง | `frontend/src/App.jsx` |
| เรียก API จากหน้าเว็บยังไง | `frontend/src/Admin/api/client.js` |
| สองภาษาทำยังไง | `frontend/src/i18n/messages.js` + `LanguageContext.jsx` |
| ฉากรถ 3D | `frontend/src/auth/UrusScene3D.jsx`, `CarModel.jsx` |
