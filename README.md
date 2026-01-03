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

Deploy on Heroku:
Create a new Git repository
Initialize a git repository in a new or existing directory

$ cd my-project/
$ git init
$ heroku git:remote -a followly

Existing Git repository
For existing repositories, simply add the heroku remote

$ heroku git:remote -a followly

Deploy your application
Commit your code to the repository and deploy it to Heroku using Git.

$ git add .
$ git commit -am "make it better"
$ git push heroku main

After deploying, scale the workers with:
heroku ps:scale email_worker=1 automation_worker=1 scheduling_worker=1