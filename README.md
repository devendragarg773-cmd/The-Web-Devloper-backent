# THE WEB DEVELOPER — Backend

This backend provides online shared storage for the current THE WEB DEVELOPER website.

## What it stores

- Real websites
- Demo websites
- Customer name/mobile
- Prices
- Website links
- Project information
- Favorites
- Customer signatures
- Private policy
- Banner image

## API

### Health
GET `/api/health`

### Login
POST `/api/auth/login`

Body:
```json
{
  "name": "DEVENDRA GARG",
  "password": "YOUR_OWNER_PASSWORD"
}
```

### Projects
- GET `/api/projects`
- GET `/api/projects/:id`
- POST `/api/projects`
- PUT `/api/projects/:id`
- DELETE `/api/projects/:id`

### Settings
- GET `/api/settings`
- PUT `/api/settings/policy`
- PUT `/api/settings/banner`

All routes except health and login require:
`Authorization: Bearer YOUR_JWT_TOKEN`

## Local setup

1. Install Node.js.
2. Open this folder in terminal.
3. Run:
```bash
npm install
```
4. Copy `.env.example` to `.env`.
5. Put your owner password and a long random JWT secret in `.env`.
6. Start:
```bash
npm start
```

## Render deployment

Create a Node Web Service and use:

Build Command:
```bash
npm install
```

Start Command:
```bash
npm start
```

Environment variables:
- `OWNER_PASSWORD`
- `JWT_SECRET`
- `FRONTEND_ORIGIN`

The SQLite database is stored in `data/twd.db`.

IMPORTANT:
For production on Render, use persistent disk storage for SQLite or move the database to PostgreSQL/Supabase. Without persistent storage, a redeploy/restart can lose SQLite data.
