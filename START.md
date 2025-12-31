# How to Start Followly

## Prerequisites Check ✅

- ✅ PostgreSQL installed and running
- ✅ Redis installed and running  
- ✅ Node modules installed
- ✅ Environment files configured

## Step 1: Update Email Provider API Keys

Edit `backend/.env` and add your API keys:

```bash
# Brevo (formerly Sendinblue)
BREVO_API_KEY=your-actual-brevo-api-key

# Mailjet
MAILJET_API_KEY=your-actual-mailjet-api-key
MAILJET_API_SECRET=your-actual-mailjet-secret

# Resend
RESEND_API_KEY=your-actual-resend-api-key
```

**Where to get keys:**
- **Brevo**: https://app.brevo.com/settings/keys/api
- **Mailjet**: https://app.mailjet.com/account/apikeys
- **Resend**: https://resend.com/api-keys

> **Note**: You only need ONE provider to get started. The system will use whichever you configure.

## Step 2: Start Services (if not running)

```bash
# Start PostgreSQL
brew services start postgresql@15

# Start Redis
brew services start redis

# Verify they're running
brew services list
```

## Step 3: Start the Project

### Option A: Start Both Together (Recommended)

From the root directory:

```bash
npm run dev
```

This will start:
- Backend on http://localhost:3000
- Frontend on http://localhost:5173

### Option B: Start Separately

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## Step 4: Access the Application

1. **Landing Page**: http://localhost:5173
2. **Register/Login**: http://localhost:5173/register
3. **Dashboard**: http://localhost:5173/app (after login)

## First Time Setup

When you start the backend for the first time, it will:
- ✅ Connect to PostgreSQL
- ✅ Run database migrations automatically
- ✅ Create all necessary tables
- ✅ Start the queue workers

## Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Test connection
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
psql -d followly -c "SELECT 1;"
```

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Restart if needed
brew services restart redis
```

### Port Already in Use
```bash
# Find what's using port 3000
lsof -i :3000

# Find what's using port 5173
lsof -i :5173
```

### Database Migrations Not Running
The migrations run automatically on server start. Check the backend console for:
```
✅ Database connected
✅ Migration executed: createUsersTable
✅ Migration executed: createContactsTable
...
```

## Next Steps After Starting

1. **Register a new account** at http://localhost:5173/register
2. **Add your email provider** in Settings (after login)
3. **Import contacts** or add them manually
4. **Create your first campaign** or automation

## Development Commands

```bash
# Backend only
cd backend && npm run dev

# Frontend only  
cd frontend && npm run dev

# Build for production
npm run build

# Backend build
cd backend && npm run build

# Frontend build
cd frontend && npm run build
```

