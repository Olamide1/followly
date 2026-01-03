web: cd backend && npm run start
email_worker: cd backend && node dist/workers/emailWorker.js
automation_worker: cd backend && node dist/workers/automationWorker.js
scheduling_worker: cd backend && node dist/workers/schedulingWorker.js

# after deploying scale the workers with:- heroku ps:scale email_worker=1 automation_worker=1 scheduling_worker=1