const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./db");

const app = express();

app.use(
  cors({
    origin: /^http:\/\/localhost:\d+$/,
  })
);
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT VERSION() AS version");

    res.json({
      status: "ok",
      database: "connected",
      mysqlVersion: rows[0].version,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database connection failed" });
  }
});


app.get("/api/students", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        s.student_id AS id,
        s.name,
        s.email,
        s.phone_no AS phone,
        cf.class_name AS className,
        COALESCE(f.total_fee, 0) AS totalFee,
        COALESCE(
          SUM(
            CASE
              WHEN p.status = 'SUCCESS' THEN p.amount
              ELSE 0
            END
          ),
          0
        ) AS paidAmount,
        GREATEST(
          0,
          COALESCE(f.total_fee, 0) -
          COALESCE(
            SUM(
              CASE
                WHEN p.status = 'SUCCESS' THEN p.amount
                ELSE 0
              END
            ),
            0
          )
        ) AS pendingAmount
      FROM students s
      JOIN class_fees cf
        ON s.class_id = cf.class_id
      LEFT JOIN student_fee_accounts f
        ON s.student_id = f.student_id
      LEFT JOIN payments p
        ON s.student_id = p.student_id
        WHERE s.is_active = 1
      GROUP BY
        s.student_id,
        s.name,
        s.email,
        s.phone_no,
        cf.class_name,
        f.total_fee
      ORDER BY s.student_id
    `);

    res.json(rows);
  } catch (error) {
    console.error("Fetch students error:", error);
    res.status(500).json({
      error: "Could not fetch students"
    });
  }
});


app.post("/api/students", async (req, res) => {
  const { name, className, email, phone, totalFee } = req.body;

  if (
    !name?.trim() ||
    !className?.trim() ||
    !email?.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    !/^\d{10}$/.test(phone || "") ||
    !Number.isFinite(Number(totalFee)) ||
    Number(totalFee) <= 0
  ) {
    return res.status(400).json({
      error: "Please provide valid student details and fee."
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [classRows] = await connection.query(
      "SELECT class_id FROM class_fees WHERE class_name = ?",
      [className.trim()]
    );

    if (classRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        error: "This class does not exist in the fee structure."
      });
    }

    const [result] = await connection.query(
      `INSERT INTO students
        (name, phone_no, email, class_id, password_hash)
       VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        phone.trim(),
        email.trim(),
        classRows[0].class_id,
        "DEMO_ONLY_NO_LOGIN"
      ]
    );

    await connection.query(
      `INSERT INTO student_fee_accounts (student_id, total_fee)
       VALUES (?, ?)`,
      [result.insertId, Number(totalFee)]
    );

    await connection.commit();

    res.status(201).json({
      message: "Student added successfully",
      id: result.insertId
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "This email is already registered."
      });
    }

    console.error("Add student error:", error);
    res.status(500).json({
      error: "Could not save student."
    });
  } finally {
    connection.release();
  }
});

app.delete("/api/students/:id", async (req, res) => {
  const studentId = Number(req.params.id);

  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    return res.status(400).json({ error: "Invalid student ID." });
  }

  try {
    const [result] = await db.execute(
      "UPDATE students SET is_active = 0 WHERE student_id = ? AND is_active = 1",
      [studentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "Student not found or already removed."
      });
    }

    res.json({
      message: "Student removed from active list. Fee history preserved."
    });
  } catch (error) {
    console.error("Remove student error:", error.message);
    res.status(500).json({ error: "Could not remove student." });
  }
});


app.get("/api/students/:id/fees", async (req, res) => {
  const studentId = Number(req.params.id);

  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    return res.status(400).json({
      error: "Invalid student ID"
    });
  }

  try {
    const [students] = await db.query(
      `SELECT
         s.student_id AS id,
         s.name,
         s.email,
         cf.class_name AS className
       FROM students s
       JOIN class_fees cf ON cf.class_id = s.class_id
       WHERE s.student_id = ?`,
      [studentId]
    );

    if (students.length === 0) {
      return res.status(404).json({
        error: "Student not found"
      });
    }

    const [charges] = await db.query(
      `SELECT
         c.charge_id AS chargeId,
         c.charge_type AS chargeType,
         DATE_FORMAT(c.fee_month, '%Y-%m-%d') AS feeMonth,
         c.academic_year_start AS academicYearStart,
         DATE_FORMAT(c.due_date, '%Y-%m-%d') AS dueDate,
         c.amount AS feeAmount,
         COALESCE(a.allocatedAmount, 0) AS allocatedAmount,
         GREATEST(
           0,
           c.amount - COALESCE(a.allocatedAmount, 0)
         ) AS remainingAmount,
         CASE
           WHEN c.due_date > CURDATE() THEN 'UPCOMING'
           WHEN c.amount - COALESCE(a.allocatedAmount, 0) <= 0
             THEN 'PAID'
           ELSE 'DUE'
         END AS feeStatus
       FROM student_fee_charges c
       LEFT JOIN (
         SELECT
           charge_id,
           SUM(amount) AS allocatedAmount
         FROM fee_payment_allocations
         GROUP BY charge_id
       ) a ON a.charge_id = c.charge_id
       WHERE c.student_id = ?
       ORDER BY c.due_date, c.charge_id`,
      [studentId]
    );

    const toCents = (value) =>
      Math.round(Number(value) * 100);

    const totalCharges = charges.reduce(
      (sum, charge) => sum + toCents(charge.feeAmount),
      0
    );

    const totalAllocated = charges.reduce(
      (sum, charge) => sum + toCents(charge.allocatedAmount),
      0
    );

    const dueBalance = charges.reduce(
      (sum, charge) =>
        sum +
        (charge.feeStatus !== "UPCOMING"
          ? toCents(charge.remainingAmount)
          : 0),
      0
    );

    const upcomingBalance = charges.reduce(
      (sum, charge) =>
        sum +
        (charge.feeStatus === "UPCOMING"
          ? toCents(charge.remainingAmount)
          : 0),
      0
    );

    res.json({
      student: students[0],
      summary: {
        totalCharges: totalCharges / 100,
        allocatedCredits: totalAllocated / 100,
        remainingBalance: (totalCharges - totalAllocated) / 100,
        dueBalance: dueBalance / 100,
        upcomingBalance: upcomingBalance / 100
      },
      charges
    });
  } catch (error) {
    console.error("Fetch student fees error:", error);

    res.status(500).json({
      error: "Could not fetch student fee details"
    });
  }
});


app.post("/api/students/:id/fees/:chargeId/payments", async (req, res) => {
  const studentId = Number(req.params.id);
  const chargeId = Number(req.params.chargeId);
  const amount = Number(req.body.amount);
  const transactionReference = String(
    req.body.transactionReference || ""
  ).trim();

  const amountCents = Math.round(amount * 100);

  if (
    !Number.isSafeInteger(studentId) ||
    studentId <= 0 ||
    !Number.isSafeInteger(chargeId) ||
    chargeId <= 0
  ) {
    return res.status(400).json({ error: "Invalid student or fee ID." });
  }

  if (
    !Number.isFinite(amount) ||
    amountCents <= 0 ||
    Math.abs(amount * 100 - amountCents) > 0.0001
  ) {
    return res.status(400).json({
      error: "Enter a valid payment amount with up to two decimal places.",
    });
  }

  if (!/^[A-Za-z0-9_-]{8,100}$/.test(transactionReference)) {
    return res.status(400).json({
      error: "A valid transaction reference is required.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Prevent processing the same transaction reference twice.
    const [existingPayments] = await connection.execute(
      `SELECT p.payment_id, p.student_id, p.amount, p.status,
              a.charge_id
       FROM payments p
       LEFT JOIN fee_payment_allocations a
         ON a.payment_id = p.payment_id
       WHERE p.transaction_reference = ?
       LIMIT 1`,
      [transactionReference]
    );

    if (existingPayments.length > 0) {
      const existing = existingPayments[0];

      await connection.rollback();

      const sameRequest =
        Number(existing.student_id) === studentId &&
        Number(existing.charge_id) === chargeId &&
        Math.round(Number(existing.amount) * 100) === amountCents &&
        existing.status === "SUCCESS";

      if (sameRequest) {
        return res.json({
          message: "This payment was already recorded.",
          paymentId: existing.payment_id,
          duplicate: true,
        });
      }

      return res.status(409).json({
        error: "This transaction reference has already been used.",
      });
    }

    // Lock this fee row while validating and recording the payment.
    const [charges] = await connection.execute(
      `SELECT charge_id, student_id, charge_type, fee_month, amount
       FROM student_fee_charges
       WHERE charge_id = ? AND student_id = ?
       FOR UPDATE`,
      [chargeId, studentId]
    );

    if (charges.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Fee charge not found." });
    }

    const charge = charges[0];

    const [allocationRows] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) AS allocated
       FROM fee_payment_allocations
       WHERE charge_id = ?`,
      [chargeId]
    );

    const feeCents = Math.round(Number(charge.amount) * 100);
    const allocatedCents = Math.round(
      Number(allocationRows[0].allocated) * 100
    );
    const remainingCents = Math.max(0, feeCents - allocatedCents);

    if (remainingCents <= 0) {
      await connection.rollback();
      return res.status(409).json({ error: "This fee is already paid." });
    }

    if (amountCents > remainingCents) {
      await connection.rollback();
      return res.status(400).json({
        error: `Payment exceeds the remaining balance of ₹${(
          remainingCents / 100
        ).toFixed(2)}.`,
        remainingAmount: remainingCents / 100,
      });
    }

    const feeMonth =
      charge.charge_type === "ADMISSION" ? null : charge.fee_month;

    // Demo only: this records a simulated successful payment.
    const [paymentResult] = await connection.execute(
      `INSERT INTO payments
         (student_id, amount, fee_type, fee_month, status,
          transaction_reference)
       VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
      [
        studentId,
        amountCents / 100,
        charge.charge_type,
        feeMonth,
        transactionReference,
      ]
    );

    const paymentId = paymentResult.insertId;

    await connection.execute(
      `INSERT INTO fee_payment_allocations
         (payment_id, credit_id, charge_id, amount)
       VALUES (?, NULL, ?, ?)`,
      [paymentId, chargeId, amountCents / 100]
    );

    await connection.commit();

    return res.status(201).json({
      message: "Simulated payment recorded successfully.",
      paymentId,
      transactionReference,
      amount: amountCents / 100,
      chargeId,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error("Record payment error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Duplicate transaction reference. Refresh the fee details.",
      });
    }

    return res.status(500).json({
      error: "Could not record payment. Please refresh and check the payment status.",
    });
  } finally {
    if (connection) connection.release();
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
})