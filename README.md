# Team Task Manager

A full-stack web app for creating projects, managing team members, assigning tasks, and tracking progress with Admin/Member role-based access control.

## Features

- Signup and login with password hashing
- Admin and Member roles
- Project creation and team membership
- Task creation, assignment, status updates, and due dates
- Dashboard totals for all tasks, todo, in progress, done, and overdue
- REST API with validation and relationships
- MongoDB Atlas database with users, projects, memberships, and tasks collections
- Automatic database indexes on server startup

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js REST API
- Database: MongoDB Atlas
- Deployment: Railway

## Database

This is not frontend-only. The frontend is in `public/`, the backend REST API is in `server.js`, and the database is MongoDB Atlas.

The app connects to MongoDB using:

```text
MONGODB_URI
```

The collection structure is documented in `schema.md`. On startup, `server.js` automatically creates the required indexes.

Collections:

- `users`
- `projects`
- `memberships`
- `tasks`

Relationships are stored by ids:

- A project belongs to an owner user.
- A project has many members through `memberships`.
- A task belongs to a project.
- A task is assigned to a user.
- A task is created by a user.

## MongoDB Atlas Setup

1. Go to MongoDB Atlas and create a free account.
2. Create a free M0 cluster.
3. Create a database user with username and password.
4. In Network Access, allow access from anywhere:

```text
0.0.0.0/0
```

5. Click Connect -> Drivers.
6. Copy the connection string.
7. Replace `<password>` with your real database user password.
8. Add the database name at the end:

```text
mongodb+srv://username:password@cluster.mongodb.net/team_task_manager
```

## Run Locally

Install dependencies:

```powershell
npm.cmd install
```

Run from VS Code terminal:

```powershell
$env:MONGODB_URI="your_mongodb_atlas_connection_string"
$env:JWT_SECRET="local-secret"
node server.js
```

Open:

```text
http://localhost:3000
```

For development with auto-restart:

```powershell
$env:MONGODB_URI="your_mongodb_atlas_connection_string"
$env:JWT_SECRET="local-secret"
npm.cmd run dev
```

## Demo Flow

1. Signup as an Admin.
2. Create a project.
3. Signup another user as a Member in a second browser or after logout.
4. Login as Admin again and add that Member to the project.
5. Create a task assigned to the Member.
6. Login as the Member and update the task status.

## Railway Deployment

1. Push this project to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. In the Railway web service variables, add:

```text
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your-long-random-secret
```

4. Railway will run `npm start` automatically.
5. Generate a Railway public domain and use it as the live URL for submission.

## API Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/:id/members`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `GET /api/dashboard`


