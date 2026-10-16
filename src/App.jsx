
import { useEffect,useState } from "react";
import "./App.css";


const initialStudents = [
  {
    id: 1,
    name: "Aman Sharma",
    className: "10",
    email: "aman.sharma@example.com",
    phone: "9000000001",
    totalFee: 5000,
    paidAmount: 3000,
  },
  {
    id: 2,
    name: "Priya Verma",
    className: "9",
    email: "priya.verma@example.com",
    phone: "9000000002",
    totalFee: 4000,
    paidAmount: 4000,
  },
  {
    id: 3,
    name: "Rahul Patel",
    className: "10",
    email: "rahul.patel@example.com",
    phone: "9000000003",
    totalFee: 6000,
    paidAmount: 2500,
  },
  {
    id: 4,
    name: "Neha Singh",
    className: "8",
    email: "neha.singh@example.com",
    phone: "9000000004",
    totalFee: 3000,
    paidAmount: 0,
  },
  {
    id: 5,
    name: "Rohan Das",
    className: "9",
    email: "rohan.das@example.com",
    phone: "9000000005",
    totalFee: 5500,
    paidAmount: 2000,
  },
];


function getPendingAmount(student) {
  return Math.max(0, student.totalFee - student.paidAmount);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function App() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sortByPending, setSortByPending] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: "",
    className: "",
    email: "",
    phone: "",
    totalFee: "",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState(null);
const [feeDetails, setFeeDetails] = useState(null);
const [feeLoading, setFeeLoading] = useState(false);
const [feeError, setFeeError] = useState("");
const [paymentAmounts, setPaymentAmounts] = useState({});
const [payingChargeId, setPayingChargeId] = useState(null);
const [paymentMessage, setPaymentMessage] = useState("");
const [paymentError, setPaymentError] = useState("");
const [paymentReferences, setPaymentReferences] = useState({});
const [sortByClass, setSortByClass] = useState(false);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/students");

        if (!response.ok) {
          throw new Error("Failed to fetch students");
        }

        const data = await response.json();
        setStudents(data);
        setError("");
      } catch (err) {
        console.error("Error fetching students:", err);
        setError("Could not load students. Check whether the backend is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);


  const getPendingAmount = (student) =>
    Number(student.pendingAmount ?? 0);

  const getPaidAmount = (student) =>
    Number(student.paidAmount ?? 0);

  const getTotalFee = (student) =>
    Number(student.totalFee ?? 0);

const totalFees = students.reduce(
  (sum, student) => sum + getTotalFee(student),
  0
);

const totalCollected = students.reduce(
  (sum, student) => sum + getPaidAmount(student),
  0
);

const totalPending = students.reduce(
  (sum, student) => sum + getPendingAmount(student),
  0
);


  const filteredStudents = students
    .filter((student) =>
      student.name.toLowerCase().includes(search.toLowerCase())
    )
    .filter((student) =>
      pendingOnly ? getPendingAmount(student) > 0 : true
    )
    .sort((a, b) => {
      if (sortByClass) {
        return (
          String(a.className).localeCompare(
            String(b.className),
            undefined,
            { numeric: true }
          ) || a.id - b.id
        );
      }

      if (sortByPending) {
        return getPendingAmount(b) - getPendingAmount(a);
      }

      return a.id - b.id;
    });


async function handleRecordPayment(charge) {
  const amount = Number(
    paymentAmounts[charge.chargeId] ?? charge.remainingAmount
  );

  const remaining = Number(charge.remainingAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    setPaymentError("Enter a valid payment amount.");
    setPaymentMessage("");
    return;
  }

  if (amount > remaining) {
    setPaymentError(
      `Amount cannot exceed the remaining balance of ${formatCurrency(remaining)}.`
    );
    setPaymentMessage("");
    return;
  }

  if (payingChargeId !== null) return;

  setPayingChargeId(charge.chargeId);
  setPaymentError("");
  setPaymentMessage("");

  // This is a demo reference, not a real payment-gateway transaction.
  const transactionReference =
  paymentReferences[charge.chargeId] ||
  `DEMO-${crypto.randomUUID()}`;

setPaymentReferences((previous) => ({
  ...previous,
  [charge.chargeId]: transactionReference,
}));

  try {
    const response = await fetch(
      `http://localhost:5000/api/students/${selectedStudentId}/fees/${charge.chargeId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, transactionReference }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Payment could not be recorded.");
    }

    // Reload the ledger from the server; don't guess the new balance.
    const feesResponse = await fetch(
      `http://localhost:5000/api/students/${selectedStudentId}/fees`
    );

    const updatedFees = await feesResponse.json();

    if (!feesResponse.ok) {
      throw new Error(
        "Payment response received, but fee details could not be refreshed. Refresh before retrying."
      );
    }

    setFeeDetails(updatedFees);
    setPaymentReferences((previous) => {
      const updated = { ...previous };
      delete updated[charge.chargeId];
      return updated;
    });
    setPaymentMessage(
      `${formatCurrency(amount)} demo payment recorded. Reference: ${transactionReference}`
    );

    setPaymentAmounts((previous) => ({
      ...previous,
      [charge.chargeId]: "",
    }));
  } catch (error) {
    console.error("Payment request error:", error);
    setPaymentError(
      error.message ||
        "Could not confirm the payment result. Refresh fee details before retrying."
    );
  } finally {
    setPayingChargeId(null);
  }
}

    async function handleViewFees(studentId) {
      setSelectedStudentId(studentId);
      setFeeDetails(null);
      setFeeError("");
      setFeeLoading(true);

      try {
        const response = await fetch(
          `http://localhost:5000/api/students/${studentId}/fees`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load fee details.");
        }

        setFeeDetails(result);
      } catch (err) {
        console.error("Fetch fee details error:", err);
        setFeeError(err.message || "Could not connect to the server.");
      } finally {
        setFeeLoading(false);
      }
    }

async function handleAddStudent(event) {
  event.preventDefault();

  const name = newStudent.name.trim();
  const className = newStudent.className.trim();
  const email = newStudent.email.trim();
  const phone = newStudent.phone.trim();
  const totalFee = Number(newStudent.totalFee);

  if (
    !name ||
    !className ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^\d{10}$/.test(phone) ||
    !Number.isFinite(totalFee) ||
    totalFee <= 0
  ) {
    alert("Please enter valid student details.");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/api/students", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        className,
        email,
        phone,
        totalFee,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not add student.");
    }

    // Fetch the updated list from the database.
    const studentsResponse = await fetch(
      "http://localhost:5000/api/students"
    );

    if (!studentsResponse.ok) {
      throw new Error(
        "Student was saved, but refreshing the list failed. Reload the dashboard."
      );
    }

    const updatedStudents = await studentsResponse.json();
    setStudents(updatedStudents);

    setNewStudent({
      name: "",
      className: "",
      email: "",
      phone: "",
      totalFee: "",
    });

    alert("Student added successfully!");
  } catch (err) {
    console.error("Add student error:", err);
    alert(err.message || "Could not connect to the server.");
  }
}
async function handleRemoveStudent(student) {
  const confirmed = window.confirm(
    `Remove ${student.name} from the active list? Their fee and payment history will be preserved.`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(
      `http://localhost:5000/api/students/${student.id}`,
      { method: "DELETE" }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not remove student.");
    }

    setStudents((previous) =>
      previous.filter((item) => item.id !== student.id)
    );

    if (selectedStudentId === student.id) {
      setSelectedStudentId(null);
      setFeeDetails(null);
      setFeeError("");
    }

    alert("Student removed from the active list.");
  } catch (error) {
    alert(error.message || "Could not connect to the server.");
  }
}
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">₹</div>
          <div>
            <h2>FeeFlow</h2>
            <p>Fee Management</p>
          </div>
        </div>

        <nav className="navigation">
          <div className="nav-item active">▦ Dashboard</div>
          <div className="nav-item">♙ Students</div>
          <div className="nav-item">₹ Payments</div>
          <div className="nav-item">♧ Complaints</div>
          <div className="nav-item">♧ Notifications</div>
        </nav>

        <div className="sidebar-footer">
          <span className="admin-avatar">A</span>
          <div>
            <strong>Administrator</strong>
            <p>Admin account</p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h1>Dashboard</h1>
            <p className="subtitle">Manage student fees in one place.</p>
          </div>
          <div className="admin-badge">
            <span className="online-dot"></span>
            Admin
          </div>
        </header>

        <section className="summary-grid">
          <div className="summary-card">
            <div className="card-top">
              <span>Total Students</span>
              <span className="card-icon blue">♙</span>
            </div>
            <h2>{students.length}</h2>
            <p>Registered students</p>
          </div>

          <div className="summary-card">
            <div className="card-top">
              <span>Total Fees</span>
              <span className="card-icon purple">₹</span>
            </div>
            <h2>{formatCurrency(totalFees)}</h2>
            <p>Fees assigned</p>
          </div>

          <div className="summary-card">
            <div className="card-top">
              <span>Collected</span>
              <span className="card-icon green">↗</span>
            </div>
            <h2>{formatCurrency(totalCollected)}</h2>
            <p>Fees received</p>
          </div>

          <div className="summary-card">
            <div className="card-top">
              <span>Pending</span>
              <span className="card-icon orange">◷</span>
            </div>
            <h2>{formatCurrency(totalPending)}</h2>
            <p>Fees remaining</p>
          </div>
        </section>

<section className="add-student-section">
  <div>
    <h2>Add New Student</h2>
    <p>Register a student and assign their total fee.</p>
  </div>

  <form className="add-student-form" onSubmit={handleAddStudent}>
    <input
      type="text"
      placeholder="Student name"
      aria-label="Student name"
      value={newStudent.name}
      onChange={(event) =>
        setNewStudent({ ...newStudent, name: event.target.value })
      }
      required
    />

    <input
      type="text"
      placeholder="Class (e.g. 10)"
      aria-label="Student class"
      value={newStudent.className}
      onChange={(event) =>
        setNewStudent({ ...newStudent, className: event.target.value })
      }
      required
    />
    <input
  type="email"
  placeholder="Email address"
  aria-label="Email address"
  value={newStudent.email}
  onChange={(event) =>
    setNewStudent({ ...newStudent, email: event.target.value })
  }
  required
/>

<input
  type="tel"
  placeholder="10-digit phone number"
  aria-label="Phone number"
  value={newStudent.phone}
  onChange={(event) =>
    setNewStudent({ ...newStudent, phone: event.target.value })
  }
  pattern="[0-9]{10}"
  maxLength={10}
  required
/>

    <input
      type="number"
      placeholder="Total fee (₹)"
      aria-label="Total fee"
      min="1"
      step="1"
      value={newStudent.totalFee}
      onChange={(event) =>
        setNewStudent({ ...newStudent, totalFee: event.target.value })
      }
      required
    />

    <button type="submit">+ Add Student</button>
  </form>
</section>

{loading && <p>Loading students...</p>}

{error && <p className="error-message">{error}</p>}
        <section className="table-section">
          <div className="section-heading">
            <div>
              <h2>Student Fee Records</h2>
              <p>Track payments and outstanding balances.</p>
            </div>
            <span className="record-count">
              {filteredStudents.length} records
            </span>
          </div>

          <div className="filters">
            <div className="search-box">
              <span>⌕</span>
              <input
                type="text"
                placeholder="Search student by name..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <label className="filter-option">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(event) => setPendingOnly(event.target.checked)}
              />
              Pending only
            </label>

            <button
              className={`sort-button ${sortByPending ? "selected" : ""}`}
              onClick={() => {
                setSortByPending(!sortByPending);
                setSortByClass(false);
              }}
            >
              ↕ Sort by pending
            </button>
            <button
  type="button"
  className={`sort-button ${sortByClass ? "selected" : ""}`}
  onClick={() => {
    setSortByClass(!sortByClass);
    setSortByPending(false);
  }}
>
  ↕ Sort by class
</button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>EMAIL</th>
                  <th>PHONE</th>
                  <th>CLASS</th>
                  <th>TOTAL FEE</th>
                  <th>PAID</th>
                  <th>PENDING</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const pending = getPendingAmount(student);
                  const isPaid = pending === 0;

                  return (
                    <tr key={student.id}>
                      <td>
                        <div className="student-cell">
                          <span className={`student-avatar avatar-${student.id}`}>
                            {student.name.charAt(0)}
                          </span>
                          <strong>{student.name}</strong>
                        </div>
                      </td>
                      <td>{student.email}</td>
                      <td>{student.phone}</td>
                      <td>Class {student.className}</td>
                      <td>{formatCurrency(student.totalFee)}</td>
                      <td>{formatCurrency(student.paidAmount)}</td>
                      <td className={pending > 0 ? "pending-amount" : ""}>
                        {formatCurrency(pending)}
                      </td>
                      <td>
                        <span className={`status ${isPaid ? "paid" : "due"}`}>
                          {isPaid ? "Fully Paid" : "Pending"}
                        </span>
                      </td>
                      <td>
  <button
    type="button"
    className="sort-button"
    onClick={() => handleViewFees(student.id)}
  >
    View Fees
  </button>
  <button
  type="button"
  className="delete-button"
  onClick={() => handleRemoveStudent(student)}
>
  Remove
</button>
</td>
                    </tr>
                  );
                })}

                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan="9" className="empty-state">
                      No students found. Try another search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            Showing {filteredStudents.length} of {students.length} students
          </div>
        </section>

{selectedStudentId !== null && (
  <section className="table-section fee-details-section">
    <div className="section-heading">
      <div>
        <h2>Month-wise Fee Details</h2>
        <p>
          {feeDetails
            ? `${feeDetails.student.name} · Class ${feeDetails.student.className}`
            : "Loading selected student's fees"}
        </p>
      </div>

      <button
        type="button"
        className="sort-button"
        onClick={() => {
          setSelectedStudentId(null);
          setFeeDetails(null);
          setFeeError("");
        }}
      >
        Close
      </button>
    </div>

    {feeLoading && <p>Loading fee details...</p>}

    {feeError && (
      <p className="error-message">{feeError}</p>
    )}

    {feeDetails && (
      <>
        <div className="summary-grid fee-summary-grid">
          <div className="summary-card">
            <span>Total charges</span>
            <h2>{formatCurrency(feeDetails.summary.totalCharges)}</h2>
          </div>

          <div className="summary-card">
            <span>Allocated credit</span>
            <h2>{formatCurrency(feeDetails.summary.allocatedCredits)}</h2>
          </div>

          <div className="summary-card">
            <span>Due now</span>
            <h2>{formatCurrency(feeDetails.summary.dueBalance)}</h2>
          </div>

          <div className="summary-card">
            <span>Upcoming</span>
            <h2>{formatCurrency(feeDetails.summary.upcomingBalance)}</h2>
          </div>
        </div>

        <div className="table-wrapper">
        {paymentMessage && (
  <p className="payment-success">{paymentMessage}</p>
)}

{paymentError && (
  <p className="error-message">{paymentError}</p>
)}
          <table>
            <thead>
              <tr>
                <th>FEE</th>
                <th>DUE DATE</th>
                <th>AMOUNT</th>
                <th>ALLOCATED</th>
                <th>REMAINING</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {feeDetails.charges.map((charge) => (
                <tr key={charge.chargeId}>
                  <td>
                    {charge.chargeType === "ADMISSION"
                      ? "Admission Fee"
                      : new Date(
                          `${charge.feeMonth}T12:00:00`
                        ).toLocaleDateString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })}
                  </td>

                  <td>{charge.dueDate}</td>
                  <td>{formatCurrency(Number(charge.feeAmount))}</td>
                  <td>
                    {formatCurrency(Number(charge.allocatedAmount))}
                  </td>
                  <td>
                    {formatCurrency(Number(charge.remainingAmount))}
                  </td>
                  <td>
                    <span
                      className={`status ${
                        charge.feeStatus === "PAID"
                          ? "paid"
                          : "due"
                      }`}
                    >
                      {charge.feeStatus}
                    </span>
                  </td>

<td>
  {Number(charge.remainingAmount) > 0 &&
  charge.feeStatus !== "UPCOMING" ? (
    <div className="payment-controls">
      <input
        type="number"
        min="0.01"
        max={Number(charge.remainingAmount)}
        step="0.01"
        aria-label={`Payment amount for charge ${charge.chargeId}`}
        placeholder="Amount ₹"
        value={
          paymentAmounts[charge.chargeId] ??
          charge.remainingAmount
        }
        onChange={(event) =>
          setPaymentAmounts((previous) => ({
            ...previous,
            [charge.chargeId]: event.target.value,
          }))
        }
        disabled={payingChargeId !== null}
      />

      <button
        type="button"
        className="sort-button"
        onClick={() => handleRecordPayment(charge)}
        disabled={payingChargeId !== null}
      >
        {payingChargeId === charge.chargeId
          ? "Processing..."
          : "Pay Fee"}
      </button>
    </div>
  ) : (
    <span>—</span>
  )}
</td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </section>
)}


        <footer className="page-footer">
          FeeFlow · Student Fee Management System
        </footer>
      </main>
    </div>
  );
}

export default App;
