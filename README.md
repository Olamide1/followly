# Followly

Email automation that feels human and scales safely.

## Tech Stack

- **Frontend**: Vue 3, Tailwind CSS, Pinia, Axios
- **Backend**: Node.js, Express, PostgreSQL, Redis
- **Email Providers**: Brevo, Mailjet, Resend

## Getting Started

1. Install dependencies:
```bash
npm run install:all
```

2. Set up environment variables (see backend/.env.example and frontend/.env.example)

3. Start development servers:
```bash
npm run dev
```

## Project Structure

- `backend/` - Express API server
- `frontend/` - Vue 3 application

## Features

- Contact management with CSV import/export
- Static and Smart lists
- Broadcast campaigns and lifecycle sequences
- Automation engine with triggers and actions
- Smart provider routing (Brevo, Mailjet, Resend)
- Auto-warmup engine
- Compliance and suppression management
- Comprehensive analytics

