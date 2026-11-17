function AuthShowcase() {
  return (
    <aside aria-label="Car Care online booking" className="shared-auth-showcase">
      <div className="shared-auth-showcase-copy">
        <span className="shared-auth-eyebrow">
          <span aria-hidden="true" />
          CAR CARE · ONLINE BOOKING
        </span>
        <h2>
          ดูแลรถของคุณ
          <span>ให้ง่ายกว่าที่เคย</span>
        </h2>
        <p>
          เลือกบริการที่เหมาะกับรถ แล้วจองวันเวลาที่สะดวกได้ง่าย ๆ ในที่เดียว
        </p>
        <ul className="shared-auth-benefits">
          <li>เลือกบริการที่ต้องการ</li>
          <li>จองเวลาได้สะดวก</li>
          <li>จัดการข้อมูลได้ในบัญชีเดียว</li>
        </ul>
      </div>
      <div className="shared-auth-showcase-badge">
        <span aria-hidden="true">✓</span>
        <span>
          <strong>Car Care</strong>
          <small>ดูแลรถง่าย ๆ ในทุกขั้นตอน</small>
        </span>
      </div>
    </aside>
  )
}

export default AuthShowcase
