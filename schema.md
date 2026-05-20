# MongoDB Schema

The app uses MongoDB Atlas with four collections.

## users

```js
{
  _id: "usr_...",
  name: "Admin User",
  email: "admin@example.com",
  passwordHash: "salt:hash",
  role: "Admin", // "Admin" or "Member"
  createdAt: ISODate
}
```

Indexes:

```js
db.users.createIndex({ email: 1 }, { unique: true })
```

## projects

```js
{
  _id: "prj_...",
  name: "Website Launch",
  description: "Project notes",
  ownerId: "usr_...",
  createdAt: ISODate
}
```

Indexes:

```js
db.projects.createIndex({ ownerId: 1 })
```

## memberships

```js
{
  _id: "mem_...",
  projectId: "prj_...",
  userId: "usr_...",
  role: "Admin" // "Admin" or "Member"
}
```

Indexes:

```js
db.memberships.createIndex({ projectId: 1, userId: 1 }, { unique: true })
db.memberships.createIndex({ userId: 1 })
```

## tasks

```js
{
  _id: "tsk_...",
  title: "Design login screen",
  projectId: "prj_...",
  assigneeId: "usr_...",
  status: "Todo", // "Todo", "In Progress", or "Done"
  dueDate: "2026-05-30",
  createdBy: "usr_...",
  createdAt: ISODate
}
```

Indexes:

```js
db.tasks.createIndex({ projectId: 1 })
db.tasks.createIndex({ assigneeId: 1 })
```
