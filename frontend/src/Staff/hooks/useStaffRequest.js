// [STAFF] โหลดข้อมูลแบบ async พร้อม loading / error / reload
// ใช้แนวเดียวกับ src/Admin/hooks/useRemoteData.js
//   key  = string ที่เปลี่ยนเมื่อต้องโหลดใหม่ (เช่น วันที่ / id / filter)
//   load = (signal) => Promise<data>
import { useEffect, useState } from 'react'

export default function useStaffRequest(key, load) {
  const [state, setState] = useState({ key: null, data: null, error: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = `${key}:${refreshKey}`

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then((data) => setState({ key: requestKey, data, error: '' }))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState({ key: requestKey, data: null, error: error.message })
        }
      })
    return () => controller.abort()
    // load เปลี่ยนทุก render — ใช้ requestKey เป็นตัวกำหนดว่าต้องโหลดใหม่
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const isCurrent = state.key === requestKey
  return {
    // แสดงข้อมูลชุดเดิมไว้ระหว่างโหลดใหม่ จะได้ไม่กระพริบ
    data: state.data,
    loading: !isCurrent,
    error: isCurrent ? state.error : '',
    setData: (data) => setState({ key: requestKey, data, error: '' }),
    reload: () => setRefreshKey((n) => n + 1),
  }
}
