function ModulePlaceholder({ title }) {
  return (
    <section className="admin-module-placeholder">
      <p className="admin-eyebrow">ADMIN WORKSPACE</p>
      <h2>{title}</h2>
      <p>
        This section is ready for its Admin page. Its data and actions can be
        connected when the module is implemented.
      </p>
      <span className="admin-coming-soon">Page scaffold</span>
    </section>
  )
}

export default ModulePlaceholder
