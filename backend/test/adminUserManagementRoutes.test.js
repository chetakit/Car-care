const assert = require("node:assert/strict");
const http = require("node:http");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");
const app = require("../app");
const pool = require("../shared/config/db");

const originalExecute = pool.execute;
const originalJwtSecret = process.env.JWT_SECRET;
const testSecret = "test-only-admin-user-secret-with-at-least-32-bytes";
process.env.JWT_SECRET = testSecret;

const initialUsers = [
  { user_id: 1, full_name: "Primary Admin", email: "primary@example.test", phone: null, role: "ADMIN", status: "ACTIVE" },
  { user_id: 2, full_name: "Staff Member", email: "staff@example.test", phone: null, role: "STAFF", status: "ACTIVE" },
  { user_id: 3, full_name: "Second Admin", email: "second@example.test", phone: null, role: "ADMIN", status: "INACTIVE" },
  { user_id: 4, full_name: "Customer Account", email: "customer@example.test", phone: null, role: "CUSTOMER", status: "ACTIVE" },
];

function createToken(role, userId = 1) {
  return jwt.sign({ user_id: userId, role }, testSecret, { expiresIn: "1h" });
}

function sendRequest(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers["Content-Type"] = "application/json"

    const request = http.request(
      { hostname: "127.0.0.1", port, path, method, headers },
      (response) => {
        let responseBody = ""
        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          responseBody += chunk
        })
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode,
              payload: JSON.parse(responseBody),
            })
          } catch (error) {
            reject(error)
          }
        })
      },
    )
    request.on("error", reject)
    request.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

async function withServer(callback) {
  const server = app.listen(0, "127.0.0.1")
  await new Promise((resolve) => server.once("listening", resolve))
  try {
    return await callback(server.address().port)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

function installUsersMock() {
  const users = initialUsers.map((user) => ({ ...user }))
  const updates = []
  pool.execute = async (sql, values) => {
    if (sql.startsWith("SELECT COUNT(*) AS total FROM users")) {
      const requestedRole = sql.includes("WHERE role = ?") ? values[0] : null
      return [[{
        total: users.filter((user) => !requestedRole || user.role === requestedRole).length,
      }]]
    }
    if (sql.includes("ORDER BY full_name ASC, user_id ASC")) {
      const [role, limit, offset] = values
      const rows = users
        .filter((user) => user.role === role)
        .sort((left, right) => left.full_name.localeCompare(right.full_name))
        .slice(offset, offset + limit)
      return [rows.map((user) => ({ ...user }))]
    }
    if (sql.startsWith("UPDATE users SET role = ? WHERE user_id = ? AND role = ?")) {
      const [role, userId, previousRole] = values
      updates.push({ role, userId })
      const user = users.find((item) => item.user_id === userId)
      if (!user) return [{ affectedRows: 0 }]
      if (user.role !== previousRole) return [{ affectedRows: 0 }]
      user.role = role
      return [{ affectedRows: 1 }]
    }
    if (sql.startsWith("SELECT user_id FROM users WHERE email = ?")) {
      return [users.filter((item) => item.email === values[0]).map(({ user_id }) => ({ user_id }))]
    }
    if (sql.startsWith("INSERT INTO users")) {
      const [full_name, email, phone, password_hash, role] = values
      const user = { user_id: users.length + 1, full_name, email, phone, role, status: "ACTIVE", password_hash }
      users.push(user)
      return [{ insertId: user.user_id, affectedRows: 1 }]
    }
    if (sql.includes("FROM users WHERE user_id = ?")) {
      const user = users.find((item) => item.user_id === values[0])
      if (!user) return [[]]
      // The real query selects only public columns; never the password hash.
      const { password_hash: _passwordHash, ...publicColumns } = user
      return [[publicColumns]]
    }
    throw new Error(`Unexpected users query: ${sql}`)
  }
  return { users, updates }
}

test("Admin user list returns only the requested Admin and Staff roles", async () => {
  installUsersMock()
  await withServer(async (port) => {
    const token = createToken("ADMIN")
    const adminResponse = await sendRequest(
      port,
      "GET",
      "/api/admin/users?role=ADMIN",
      token,
    )
    const staffResponse = await sendRequest(
      port,
      "GET",
      "/api/admin/users?role=STAFF",
      token,
    )

    assert.equal(adminResponse.statusCode, 200)
    assert.deepEqual(adminResponse.payload.data.items.map((user) => user.role), ["ADMIN", "ADMIN"])
    assert.equal(staffResponse.statusCode, 200)
    assert.deepEqual(staffResponse.payload.data.items.map((user) => user.role), ["STAFF"])
    assert.equal(
      [...adminResponse.payload.data.items, ...staffResponse.payload.data.items]
        .some((user) => user.role === "CUSTOMER"),
      false,
    )
  })
})

test("Admin can change another user's role among all supported roles", async () => {
  const { users, updates } = installUsersMock()
  await withServer(async (port) => {
    const token = createToken("ADMIN", 1)
    const formerAdminToken = createToken("ADMIN", 3)
    const formerStaffToken = createToken("STAFF", 2)
    const promote = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/2/role",
      token,
      { role: "ADMIN" },
    )
    const formerStaffRequest = await sendRequest(
      port,
      "GET",
      "/api/admin/users?role=STAFF",
      formerStaffToken,
    )
    const demote = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/3/role",
      token,
      { role: "STAFF" },
    )
    const customerToStaff = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/4/role",
      token,
      { role: "STAFF" },
    )
    const staffToCustomer = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/4/role",
      token,
      { role: "CUSTOMER" },
    )
    const adminToCustomer = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/2/role",
      token,
      { role: "CUSTOMER" },
    )
    const customerToStaffAgain = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/2/role",
      token,
      { role: "STAFF" },
    )
    const customerToAdmin = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/4/role",
      token,
      { role: "ADMIN" },
    )

    assert.equal(promote.statusCode, 200)
    assert.equal(promote.payload.data.role, "ADMIN")
    assert.equal(demote.statusCode, 200)
    assert.equal(demote.payload.data.role, "STAFF")
    assert.equal(customerToStaff.statusCode, 200)
    assert.equal(staffToCustomer.statusCode, 200)
    assert.equal(adminToCustomer.statusCode, 200)
    assert.equal(customerToStaffAgain.statusCode, 200)
    assert.equal(customerToAdmin.statusCode, 200)
    assert.deepEqual(updates, [
      { role: "ADMIN", userId: 2 },
      { role: "STAFF", userId: 3 },
      { role: "STAFF", userId: 4 },
      { role: "CUSTOMER", userId: 4 },
      { role: "CUSTOMER", userId: 2 },
      { role: "STAFF", userId: 2 },
      { role: "ADMIN", userId: 4 },
    ])
    const promotedUser = users.find((user) => user.user_id === 2)
    const demotedUser = users.find((user) => user.user_id === 3)
    const reassignedCustomer = users.find((user) => user.user_id === 4)
    assert.equal(promotedUser.role, "STAFF")
    assert.equal(promotedUser.user_id, 2)
    assert.equal(promotedUser.full_name, "Staff Member")
    assert.equal(promotedUser.email, "staff@example.test")
    assert.equal(demotedUser.role, "STAFF")
    assert.equal(demotedUser.user_id, 3)
    assert.equal(demotedUser.full_name, "Second Admin")
    assert.equal(demotedUser.email, "second@example.test")
    assert.equal(reassignedCustomer.role, "ADMIN")
    assert.equal(reassignedCustomer.user_id, 4)
    assert.equal(reassignedCustomer.full_name, "Customer Account")
    assert.equal(reassignedCustomer.email, "customer@example.test")

    const formerAdminRequest = await sendRequest(
      port,
      "GET",
      "/api/admin/users?role=STAFF",
      formerAdminToken,
    )
    assert.equal(formerAdminRequest.statusCode, 401)
    assert.equal(formerStaffRequest.statusCode, 401)
  })
})

test("Admin cannot change their own role", async () => {
  const { updates } = installUsersMock()
  await withServer(async (port) => {
    const response = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/1/role",
      createToken("ADMIN", 1),
      { role: "STAFF" },
    )

    assert.equal(response.statusCode, 400)
    assert.equal(response.payload.message, "You cannot change your own role.")
    assert.deepEqual(updates, [])
  })
})

test("non-Admin requests cannot access the user management API", async () => {
  installUsersMock()
  await withServer(async (port) => {
    const customer = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/2/role",
      createToken("CUSTOMER", 4),
      { role: "ADMIN" },
    )
    const staff = await sendRequest(
      port,
      "GET",
      "/api/admin/users?role=STAFF",
      createToken("STAFF", 2),
    )
    const staffRoleChange = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/4/role",
      createToken("STAFF", 2),
      { role: "ADMIN" },
    )
    const anonymous = await sendRequest(
      port,
      "GET",
      "/api/admin/users?role=ADMIN",
      null,
    )

    assert.equal(customer.statusCode, 403)
    assert.equal(staff.statusCode, 403)
    assert.equal(staffRoleChange.statusCode, 403)
    assert.equal(anonymous.statusCode, 401)
  })
})

test("role endpoint rejects unchanged and unsupported roles", async () => {
  const { updates } = installUsersMock()
  await withServer(async (port) => {
    const unchangedRole = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/4/role",
      createToken("ADMIN"),
      { role: "CUSTOMER" },
    )
    const unsupportedRole = await sendRequest(
      port,
      "PATCH",
      "/api/admin/users/2/role",
      createToken("ADMIN"),
      { role: "MANAGER" },
    )

    assert.equal(unchangedRole.statusCode, 400)
    assert.equal(unsupportedRole.statusCode, 400)
    assert.deepEqual(updates, [])
  })
})

test("Admin can create a Staff account directly, with a hashed password", async () => {
  const { users } = installUsersMock()
  await withServer(async (port) => {
    const response = await sendRequest(port, "POST", "/api/admin/users", createToken("ADMIN"), {
      full_name: "  New Staff  ",
      email: "New.Staff@Example.test",
      phone: "0812345678",
      password: "temporary-pass",
      role: "STAFF",
    })
    assert.equal(response.statusCode, 201)
    assert.equal(response.payload.data.role, "STAFF")
    assert.equal(response.payload.data.email, "new.staff@example.test")
    assert.equal(response.payload.data.full_name, "New Staff")
    assert.equal(Object.hasOwn(response.payload.data, "password_hash"), false)
    const created = users.find((user) => user.email === "new.staff@example.test")
    assert.match(created.password_hash, /^\$2[aby]\$12\$/)
    assert.notEqual(created.password_hash, "temporary-pass")
  })
})

test("creating a user rejects duplicates, customers, weak passwords, and non-Admins", async () => {
  const { users } = installUsersMock()
  const valid = { full_name: "X", email: "x@example.test", password: "long-enough", role: "STAFF" }
  await withServer(async (port) => {
    const token = createToken("ADMIN")
    const cases = [
      [{ ...valid, email: "staff@example.test" }, 409],
      [{ ...valid, role: "CUSTOMER" }, 400],
      [{ ...valid, password: "short" }, 400],
      [{ ...valid, phone: "12345" }, 400],
      [{ ...valid, email: "not-an-email" }, 400],
      [{ ...valid, status: "INACTIVE" }, 400],
    ]
    for (const [body, statusCode] of cases) {
      const response = await sendRequest(port, "POST", "/api/admin/users", token, body)
      assert.equal(response.statusCode, statusCode, JSON.stringify(body))
    }
    const staff = await sendRequest(port, "POST", "/api/admin/users", createToken("STAFF", 2), valid)
    assert.equal(staff.statusCode, 403)
  })
  assert.equal(users.length, initialUsers.length)
})

after(() => {
  pool.execute = originalExecute
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET
  } else {
    process.env.JWT_SECRET = originalJwtSecret
  }
})
