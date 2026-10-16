# Student Fee Management System

This is a simple Student Fee Management System made as a project using React, Node.js and MySQL.

The main purpose of this project is to manage student details and keep track of their fees and payments.

## Features

- Add new student details.
- View student records.
- Check total fees, paid fees and pending fees.
- View month-wise fee details.
- Record demo fee payments.
- Search students by name.
- Sort students by pending fees.

## Technologies Used

- React.js – Frontend
- Node.js and Express.js – Backend
- MySQL – Database
- CSS – Styling
- Vite – Frontend development

## Project Structure

```text
student-fee-dashboard/
├── public/
├── src/
│   ├── App.jsx
│   ├── App.css
│   └── main.jsx
├── server/
│   ├── index.js
│   ├── db.js
│   └── package.json
├── package.json
└── README.md
```

## How to Run the Project

### 1. Download the project

Clone the repository or download the project files from GitHub.

### 2. Start the backend

Open a terminal and go to the server folder.

```bash
cd server
npm install
npm run dev
```

Before starting the backend, make sure MySQL is running and the database configuration is set correctly in the `server/.env` file.

### 3. Start the frontend

Open another terminal in the main project folder.

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal, usually `http://localhost:5173`.

## Database Configuration

Create a `server/.env` file and add your own database details.

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=fee_management
PORT=5000
```

Change these values according to your MySQL setup. The required database and tables must already exist.

**Important:** Do not upload your `.env` file or database password to GitHub.

## Note

The payment feature currently records demo payments. It is not connected to a real payment gateway.

This project is still being improved, and more features may be added later.
