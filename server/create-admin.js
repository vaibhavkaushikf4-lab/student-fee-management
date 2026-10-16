require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("./db");

async function main() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const phone = process.env.ADMIN_PHONE?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !phone || !password || password.length < 12) {
    throw new Error(
      "Name, email, phone and a password of at least 12 characters are required."
    );
  }

  const [existing] = await db.execute(
    "SELECT admin_id FROM admins WHERE email = ? LIMIT 1",
    [email]
  );

  if (existing.length > 0) {
    throw new Error("This admin email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.execute(
    `INSERT INTO admins (name, phone_no, email, password_hash)
     VALUES (?, ?, ?, ?)`,
    [name, phone, email, passwordHash]
  );

  console.log("Admin account created successfully.");
}

main()
  .catch((error) => {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
