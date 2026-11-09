const bcrypt = require("bcryptjs");
const pool = require("../shared/config/db");

const ADMIN = {
  fullName: "Car Care Admin",
  email: "admin@carcare.local",
  role: "ADMIN",
  status: "ACTIVE",
};

class UserInputError extends Error {}

function promptHidden(prompt) {
  const stdin = process.stdin;
  const stdout = process.stdout;
  const { StringDecoder } = require("string_decoder");

  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(
      new UserInputError("An interactive terminal is required to enter the password."),
    );
  }

  return new Promise((resolve, reject) => {
    const wasPaused = stdin.isPaused();
    const wasRaw = stdin.isRaw === true;
    const originalEncoding = stdin.readableEncoding;
    const decoder = new StringDecoder(originalEncoding || "utf8");
    let password = "";
    let settled = false;

    const cleanup = () => {
      let cleanupFailed = false;
      try {
        stdin.removeListener("data", onData);
      } catch {
        cleanupFailed = true;
      }
      try {
        stdin.removeListener("error", onError);
      } catch {
        cleanupFailed = true;
      }
      try {
        if (stdin.isRaw !== wasRaw) {
          stdin.setRawMode(wasRaw);
        }
      } catch {
        cleanupFailed = true;
      }
      try {
        if (wasPaused) {
          stdin.pause();
        }
      } catch {
        cleanupFailed = true;
      }
      try {
        stdout.write("\n");
      } catch {
        cleanupFailed = true;
      }
      return cleanupFailed;
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (cleanup() && !error) {
        error = new UserInputError("Could not restore terminal input mode.");
      }
      if (error) {
        reject(error);
      } else {
        resolve(password);
      }
    };

    const onError = () => {
      finish(new UserInputError("Could not read password input."));
    };

    const onData = (input) => {
      try {
        const characters =
          typeof input === "string" ? input : decoder.write(input);
        for (const character of characters) {
          if (character === "\r" || character === "\n") {
            finish();
            return;
          }
          if (character === "\u0003" || character === "\u0004") {
            finish(new UserInputError("Password entry cancelled."));
            return;
          }
          if (character === "\u007f" || character === "\b") {
            const passwordCharacters = Array.from(password);
            passwordCharacters.pop();
            password = passwordCharacters.join("");
            continue;
          }
          if (character >= " ") {
            password += character;
          }
        }
      } catch {
        finish(new UserInputError("Could not read password input."));
      }
    };

    try {
      stdin.setRawMode(true);
      stdin.on("data", onData);
      stdin.on("error", onError);
      stdin.resume();
      stdout.write(prompt);
    } catch {
      finish(new UserInputError("Could not enable hidden password input."));
    }
  });
}

async function main() {
  try {
    const password = await promptHidden("Admin password: ");
    if (Array.from(password).length < 12) {
      throw new UserInputError("Password must contain at least 12 characters.");
    }

    const [existingUsers] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [ADMIN.email],
    );

    if (existingUsers.length > 0) {
      throw new UserInputError("An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await pool.execute(
        "INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)",
        [
          ADMIN.fullName,
          ADMIN.email,
          passwordHash,
          ADMIN.role,
          ADMIN.status,
        ],
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        const [users] = await pool.execute(
          "SELECT user_id FROM users WHERE email = ? LIMIT 1",
          [ADMIN.email],
        );
        if (users.length > 0) {
          throw new UserInputError("An account with this email already exists.");
        }
      }
      throw error;
    }

    console.log("Admin account created successfully.");
  } catch (error) {
    if (error instanceof UserInputError) {
      console.error(error.message);
    } else {
      console.error(
        "Could not create the admin account. Check the database connection and users table.",
      );
    }
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch {
      console.error("Could not close the database connection pool cleanly.");
      process.exitCode = 1;
    }
  }
}

main();
