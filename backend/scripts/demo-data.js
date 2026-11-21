// Demo data used by demo-seed.js. Everything here is fictional.
//
// Every demo account uses an @carcare.test e-mail address. demo-clear.js
// finds and removes the demo data by that domain, so keep it on every row.
// Phone numbers use the placeholder range 080-000-0xxx.

const DEMO_DOMAIN = "@carcare.test";

// Accounts you can log in with during the presentation (password: the
// DEMO_PASSWORD value in backend/.env).
const DEMO_ACCOUNTS = [
  { key: "customer", email: `demo.customer${DEMO_DOMAIN}`, full_name: "ธนวัฒน์ ศรีประเสริฐ (ลูกค้าเดโม่)", phone: "0800000100", role: "CUSTOMER" },
  { key: "admin", email: `demo.admin${DEMO_DOMAIN}`, full_name: "ผู้ดูแลระบบ (เดโม่)", phone: "0800000101", role: "ADMIN" },
  { key: "staff", email: `demo.staff${DEMO_DOMAIN}`, full_name: "สมศักดิ์ ใจเย็น (พนักงานเดโม่)", phone: "0800000102", role: "STAFF" },
  { key: "staff2", email: `demo.staff2${DEMO_DOMAIN}`, full_name: "วิไลวรรณ ขยันดี (พนักงานเดโม่)", phone: "0800000103", role: "STAFF" },
];

// Regular customers come back more often (weight 3) than one-off customers.
const CUSTOMERS = [
  { handle: "nattaphon.s", full_name: "ณัฐพล ศรีสุข", regular: true },
  { handle: "kamonchanok.w", full_name: "กมลชนก วงศ์ไทย", regular: true },
  { handle: "teerawat.j", full_name: "ธีรวัฒน์ ใจดี" },
  { handle: "pimchanok.k", full_name: "พิมพ์ชนก แก้วมณี", regular: true },
  { handle: "anucha.b", full_name: "อนุชา บุญมา" },
  { handle: "supawadee.t", full_name: "สุภาวดี ทองดี" },
  { handle: "worameth.c", full_name: "วรเมธ จันทร์เพ็ญ", regular: true },
  { handle: "paweena.s", full_name: "ปวีณา สายสุวรรณ" },
  { handle: "supachai.p", full_name: "ศุภชัย พรหมวงศ์" },
  { handle: "chanida.i", full_name: "ชนิดา อินทร์แก้ว" },
  { handle: "kittipong.r", full_name: "กิตติพงษ์ รุ่งเรือง", regular: true },
  { handle: "onuma.s", full_name: "อรอุมา ศรีวงศ์" },
  { handle: "panuwat.s", full_name: "ภาณุวัฒน์ สมบูรณ์" },
  { handle: "napatsorn.m", full_name: "นภัสสร มีสุข" },
  { handle: "thanakrit.w", full_name: "ธนกฤต วัฒนกุล", regular: true },
  { handle: "siriporn.k", full_name: "ศิริพร คำแก้ว" },
  { handle: "jirayu.t", full_name: "จิรายุ ทองคำ" },
  { handle: "mallika.p", full_name: "มัลลิกา พูลสวัสดิ์" },
  { handle: "piyapong.k", full_name: "ปิยะพงษ์ เกษมสุข" },
  { handle: "rattanaporn.c", full_name: "รัตนาภรณ์ ชัยมงคล" },
  { handle: "somchai.s", full_name: "สมชาย แสงทอง" },
  { handle: "wipawee.n", full_name: "วิภาวี นาคประเสริฐ" },
  { handle: "apisit.p", full_name: "อภิสิทธิ์ ประเสริฐศรี" },
  { handle: "nicha.b", full_name: "ณิชา บุญเรือง" },
  { handle: "ekkachai.h", full_name: "เอกชัย หอมจันทร์" },
];

// owner: a CUSTOMERS handle, or "demo" for the demo customer account.
// model must exist in vehicle_models under that brand.
const VEHICLES = [
  { owner: "demo", brand: "Honda", model: "City", year: 2021, plate: "2กร 4519", province: "กรุงเทพมหานคร", color: "ขาว" },
  { owner: "demo", brand: "Yamaha", model: "NMAX", year: 2023, plate: "1กพ 382", province: "ปทุมธานี", color: "ดำ" },
  { owner: "nattaphon.s", brand: "Toyota", model: "Hilux Revo", year: 2019, plate: "3ฒต 7721", province: "ปทุมธานี", color: "เทา" },
  { owner: "nattaphon.s", brand: "Honda", model: "Click 160", year: 2022, plate: "1กษ 905", province: "ปทุมธานี", color: "แดง" },
  { owner: "kamonchanok.w", brand: "Toyota", model: "Yaris Ativ", year: 2022, plate: "1ขค 6610", province: "กรุงเทพมหานคร", color: "เงิน" },
  { owner: "teerawat.j", brand: "Isuzu", model: "D-Max", year: 2018, plate: "บธ 2290", province: "นนทบุรี", color: "ขาว" },
  { owner: "pimchanok.k", brand: "Mazda", model: "CX-5", year: 2020, plate: "5กษ 1184", province: "กรุงเทพมหานคร", color: "แดง" },
  { owner: "pimchanok.k", brand: "Vespa", model: "Sprint", year: 2021, plate: "1กว 77", province: "กรุงเทพมหานคร", color: "ฟ้า" },
  { owner: "anucha.b", brand: "Ford", model: "Ranger", year: 2017, plate: "3ฒค 5052", province: "ปทุมธานี", color: "ส้ม" },
  { owner: "supawadee.t", brand: "Honda", model: "HR-V", year: 2023, plate: "4ขฐ 8813", province: "กรุงเทพมหานคร", color: "เทา" },
  { owner: "worameth.c", brand: "BMW", model: "3 Series", year: 2020, plate: "8กช 9999", province: "กรุงเทพมหานคร", color: "ดำ" },
  { owner: "worameth.c", brand: "Toyota", model: "Fortuner", year: 2021, plate: "9กศ 2468", province: "กรุงเทพมหานคร", color: "ขาว" },
  { owner: "paweena.s", brand: "Suzuki", model: "Swift", year: 2019, plate: "6กล 3375", province: "นนทบุรี", color: "แดง" },
  { owner: "supachai.p", brand: "Mitsubishi", model: "Triton", year: 2016, plate: "บล 6431", province: "ปทุมธานี", color: "เงิน" },
  { owner: "chanida.i", brand: "BYD", model: "Atto 3", year: 2024, plate: "1ขบ 2024", province: "กรุงเทพมหานคร", color: "ฟ้า" },
  { owner: "kittipong.r", brand: "Toyota", model: "Corolla Cross", year: 2022, plate: "2ขจ 7130", province: "ปทุมธานี", color: "เทา" },
  { owner: "kittipong.r", brand: "Honda", model: "Wave 125i", year: 2020, plate: "1กฬ 446", province: "ปทุมธานี", color: "ดำ" },
  { owner: "onuma.s", brand: "Nissan", model: "Almera", year: 2021, plate: "3กณ 5590", province: "กรุงเทพมหานคร", color: "ขาว" },
  { owner: "panuwat.s", brand: "Isuzu", model: "MU-X", year: 2020, plate: "7กท 1203", province: "นนทบุรี", color: "ดำ" },
  { owner: "napatsorn.m", brand: "MG", model: "ZS", year: 2022, plate: "5ขก 6688", province: "ปทุมธานี", color: "ขาว" },
  { owner: "thanakrit.w", brand: "Mercedes-Benz", model: "C-Class", year: 2019, plate: "1กก 8008", province: "กรุงเทพมหานคร", color: "เงิน" },
  { owner: "thanakrit.w", brand: "Toyota", model: "Alphard", year: 2022, plate: "1ขข 5555", province: "กรุงเทพมหานคร", color: "ดำ" },
  { owner: "siriporn.k", brand: "Toyota", model: "Vios", year: 2018, plate: "4กย 9021", province: "นนทบุรี", color: "เทา" },
  { owner: "jirayu.t", brand: "Yamaha", model: "Aerox", year: 2023, plate: "1กอ 731", province: "ปทุมธานี", color: "น้ำเงิน" },
  { owner: "mallika.p", brand: "Mazda", model: "Mazda 2", year: 2020, plate: "6กข 4402", province: "กรุงเทพมหานคร", color: "แดง" },
  { owner: "piyapong.k", brand: "Toyota", model: "Hiace Commuter", year: 2019, plate: "40-1287", province: "ปทุมธานี", color: "ขาว" },
  { owner: "rattanaporn.c", brand: "Honda", model: "Civic", year: 2022, plate: "2กว 3141", province: "กรุงเทพมหานคร", color: "ขาว" },
  { owner: "somchai.s", brand: "Nissan", model: "Navara", year: 2018, plate: "บค 7713", province: "นนทบุรี", color: "เทา" },
  { owner: "wipawee.n", brand: "Mitsubishi", model: "Xpander", year: 2021, plate: "3ขล 6056", province: "ปทุมธานี", color: "เงิน" },
  { owner: "apisit.p", brand: "Honda", model: "CR-V", year: 2019, plate: "8กร 2515", province: "กรุงเทพมหานคร", color: "ดำ" },
  { owner: "apisit.p", brand: "Kawasaki", model: "Z650", year: 2021, plate: "1กร 650", province: "กรุงเทพมหานคร", color: "เขียว" },
  { owner: "nicha.b", brand: "Suzuki", model: "Ertiga", year: 2020, plate: "2กม 8823", province: "นนทบุรี", color: "ขาว" },
  { owner: "ekkachai.h", brand: "อื่นๆ / Other", model: "รุ่นอื่นๆ / Other (SUV)", year: 2021, plate: "9กจ 3030", province: "ปทุมธานี", color: "เทา" },
  { owner: "ekkachai.h", brand: "Honda", model: "PCX 160", year: 2022, plate: "1กษ 160", province: "ปทุมธานี", color: "ขาว" },
];

// How often each service is picked as the main service (weights).
const SERVICE_WEIGHTS = {
  "Basic Wash": 40,
  "Premium Wash": 22,
  "Interior Cleaning": 10,
  Waxing: 7,
  Polishing: 6,
  "Engine Cleaning": 5,
  "Headlight Restoration": 5,
  "Undercarriage Wash": 3,
  "Ozone Treatment": 2,
};
// Add-ons picked in about 30% of bookings.
const ADD_ON_SERVICES = ["Waxing", "Interior Cleaning", "Undercarriage Wash", "Ozone Treatment"];

const CUSTOMER_NOTES = [
  "ขอเน้นทำความสะอาดล้อแม็ก",
  "รถมีคราบยางมะตอยด้านข้าง",
  "ขอรับรถก่อน 17:00 น.",
  "มีคาร์ซีทเด็กเบาะหลัง ฝากระวังด้วยครับ",
  "ฝนตกเมื่อวาน รถเลอะโคลนพอสมควร",
];

const CHECK_IN_NOTES = [
  "มีรอยขีดข่วนเล็กน้อยที่ประตูหลังซ้าย",
  "กันชนหน้ามีรอยถลอกเดิม",
  "ล้อแม็กหน้าซ้ายมีรอยขูด",
  "เบาะหลังมีคราบกาแฟ แจ้งลูกค้าแล้ว",
  "มีของมีค่าในรถ ลูกค้านำออกก่อนเริ่มงาน",
  "ไฟท้ายขวามีรอยร้าวเดิม",
];

const STAFF_NOTES = [
  "ลูกค้าขอเน้นทำความสะอาดล้อ",
  "ใช้น้ำยาสูตรอ่อนตามที่ลูกค้าขอ",
  "แจ้งลูกค้าเรื่องรอยขีดข่วนก่อนเริ่มงานแล้ว",
  "ลูกค้านั่งรอรับรถที่ร้าน",
  "โทรแจ้งลูกค้าเมื่อเสร็จงานแล้ว",
  "คราบน้ำมันห้องเครื่องเยอะ ใช้เวลาเพิ่มเล็กน้อย",
];

const CANCEL_REASONS = [
  "ติดธุระด่วน ขอยกเลิกก่อน",
  "เปลี่ยนแผนเดินทาง",
  "รถต้องเข้าศูนย์บริการก่อน",
  "ขอเลื่อนไปสัปดาห์หน้า",
];

const NO_SHOW_REASON = "ลูกค้าไม่มาตามนัดและติดต่อไม่ได้";

module.exports = {
  DEMO_DOMAIN,
  DEMO_ACCOUNTS,
  CUSTOMERS,
  VEHICLES,
  SERVICE_WEIGHTS,
  ADD_ON_SERVICES,
  CUSTOMER_NOTES,
  CHECK_IN_NOTES,
  STAFF_NOTES,
  CANCEL_REASONS,
  NO_SHOW_REASON,
};
