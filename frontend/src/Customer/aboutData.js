// Content for the About page (/about): the team, the tools we built on, and
// credits. Names stay in Thai in both languages; roles are job titles.
//
// HOW TO EDIT (any team member, then commit + push):
//   photo  : put the image in frontend/public/team/ (square, e.g. 400x400)
//            and write its path, e.g. photo: '/team/67150490.jpg'.
//            Leave it out and the card shows the initial letter instead.
//   photoCrop (optional): for a photo where the face is small, e.g. a
//            half-body portrait: { x: 61, y: 30, zoom: 1.8 } = face centre at
//            61% across / 30% down the photo, zoomed in 1.8 times.
//   github : your GitHub username or profile link — 'chetakit' and
//            'https://github.com/chetakit' both work. Leave it '' to hide it.
//   UNIVERSITY / FACULTY : leave as '' to hide them.

import {
  Atom,
  Cable,
  Database,
  Feather,
  Hexagon,
  KeyRound,
  LockKeyhole,
  Route,
  TrainFront,
  Triangle,
  Zap,
} from 'lucide-react'

export const COURSE_CODE = 'CSI400'
export const UNIVERSITY = 'Sripatum University - SPU'
export const FACULTY = 'Information Technology'

// Course instructor, shown above the team. Name stays in English.
export const INSTRUCTOR = {
  name: 'Thinnaphat Borirak',
  initial: 'T',
  department: 'Department of Computer Science and Software Development Innovation',
  email: 'thinnaphat.bo@spu.ac.th',
  photo: '/team/instructor.webp',
  // Half-body portrait: zoom in on the face.
  photoCrop: { x: 55, y: 30, zoom: 1.4 },
}

export const TEAM = [
  {
    id: '67150490',
    name: 'เชษฐกิตติ์ สืบสุขสันติ',
    initial: 'ช',
    role: 'Leader Developer & Project Manager',
    module: 'Admin & Payment Management',
    tags: ['Admin', 'Coupons', 'Reports', 'Payment', 'Wallet'],
    lead: true,
    // Half-body portrait: zoom in on the face (x/y = face centre, % of photo).
    photoCrop: { x: 58, y: 38, zoom: 1.3 },
    photo: '/team/67150490.jpg',
    github: 'https://github.com/chetakit',
  },
  {
    id: '67115191',
    name: 'ณัฐนันท์ แสงทอง',
    initial: 'ณ',
    role: 'Software Developer & QA Tester',
    module: 'Booking & Queue Management',
    tags: ['Booking', 'Schedules', 'Queue'],
    photo: '/team/67115191.jpg',
    github: 'https://github.com/Oshi1287',
  },
  {
    id: '67159844',
    name: 'ภูริภัทร ทองมวน',
    initial: 'ภ',
    role: 'Software Developer & UI Designer',
    module: 'Customer & Vehicle Management',
    tags: ['Sign-up', 'Profile', 'Vehicles'],
    photo: '/team/67159844.jpg',
    github: 'https://github.com/nagamura999',
  },
  {
    id: '67112963',
    name: 'เมธัส เชยชม',
    initial: 'ม',
    role: 'Software Developer & UI Designer',
    module: 'Staff & Service Management',
    tags: ['Staff', 'Check-in', 'Job status', 'Services'],
    photo: '/team/67112963.png',
    github: 'https://github.com/Fvkami',
  },
]

// Open-source software the site is built with, its licence, and the icon +
// brand colour its card uses.
export const STACK = [
  { name: 'React 19', icon: Atom, color: '#087ea4', part: 'Frontend', license: 'MIT', href: 'https://react.dev' },
  { name: 'Vite 8', icon: Zap, color: '#646cff', part: 'Frontend', license: 'MIT', href: 'https://vite.dev' },
  { name: 'Lucide', icon: Feather, color: '#f56565', part: 'Icons', license: 'ISC', href: 'https://lucide.dev' },
  { name: 'Node.js', icon: Hexagon, color: '#5fa04e', part: 'Backend', license: 'MIT', href: 'https://nodejs.org' },
  { name: 'Express 5', icon: Route, color: '#353535', part: 'Backend', license: 'MIT', href: 'https://expressjs.com' },
  { name: 'mysql2', icon: Cable, color: '#e48e00', part: 'Backend', license: 'MIT', href: 'https://github.com/sidorares/node-mysql2' },
  { name: 'jsonwebtoken', icon: KeyRound, color: '#c026d3', part: 'Security', license: 'MIT', href: 'https://github.com/auth0/node-jsonwebtoken' },
  { name: 'bcryptjs', icon: LockKeyhole, color: '#0f766e', part: 'Security', license: 'BSD-3-Clause', href: 'https://github.com/dcodeIO/bcrypt.js' },
  { name: 'MySQL 8.4', icon: Database, color: '#4479a1', part: 'Database', license: 'GPL-2.0', href: 'https://www.mysql.com' },
  { name: 'Railway', icon: TrainFront, color: '#7c3aed', part: 'Hosting (DB)', license: 'Service', href: 'https://railway.com' },
  { name: 'Vercel', icon: Triangle, color: '#111111', part: 'Hosting (Web)', license: 'Service', href: 'https://vercel.com' },
]
