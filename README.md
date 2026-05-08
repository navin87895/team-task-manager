# Team Task Manager

A full-stack team task manager where users can create projects, add teammates, assign tasks, and track progress with role-based access control.

## Features

- Signup and login with hashed passwords and JWT authentication
- Admin and member roles
- Project creation and project-level membership management
- Manager/contributor project roles
- Task creation, assignment, priority, due date, and status tracking
- Dashboard with total tasks, personal open tasks, overdue tasks, projects, and status distribution
- REST API with validation and relational data model
- PostgreSQL support through `DATABASE_URL`
- Local JSON fallback so the app can be tried without installing a database

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Vanilla HTML/CSS/JavaScript frontend
- JWT, bcrypt, Zod validation

## Local Setup

```bash
npm install
npm start
```

Open `http://localhost:3000`.

By default, local development uses `data/local-db.json`. For PostgreSQL, create a `.env` file:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
JWT_SECRET=replace-with-a-long-random-secret
PORT=3000
```

## API Overview

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id/members`
- `POST /api/projects/:id/members`
- `DELETE /api/projects/:id/members/:userId`
- `GET /api/projects/:id/tasks`
- `POST /api/projects/:id/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/tasks/my`
- `GET /api/dashboard`

## Suggested Demo Video Flow

1. Sign up as an admin.
2. Create a project.
3. Sign up as a member in another browser/incognito session.
4. Add the member to the project.
5. Create and assign tasks with due dates and priorities.
6. Update task statuses as the member.
7. Show dashboard totals and overdue/status tracking.
