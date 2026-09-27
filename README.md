# THE WEB DEVELOPER - Backend

This backend matches the current frontend API:

- GET  /api/health
- POST /api/auth/login
- GET  /api/projects
- POST /api/projects
- PUT  /api/projects/:id
- DELETE /api/projects/:id
- GET  /api/settings
- PUT  /api/settings/policy
- PUT  /api/settings/banner

## IMPORTANT

Do NOT use Render's local filesystem as the database.
This backend uses PostgreSQL, so records survive Render restarts/redeploys.

## Render setup

Create a PostgreSQL database first (Render PostgreSQL or another hosted PostgreSQL provider).

Then create a Render Web Service from this folder/repository.

Build Command:
npm install

Start Command:
npm start

Add these Environment Variables:

DATABASE_URL
JWT_SECRET
ADMIN_NAME
ADMIN_PASSWORD
FRONTEND_ORIGIN
NODE_ENV=production

For the current GitHub Pages website:

FRONTEND_ORIGIN=https://devendragarg773-cmd.github.io

The server automatically creates its required tables on first start.

## Login

The frontend sends the owner name and password to:

POST /api/auth/login

Set ADMIN_NAME and ADMIN_PASSWORD in Render.
Do not put the real password inside the backend source code.

## Data

Projects are stored as JSONB records so the existing frontend fields are preserved without changing the UI.

The backend stores:
- demo/real websites
- website name/category/link
- price/sold price
- customer name/mobile
- description
- favorite
- signature
- status/date

Settings store:
- private policy
- banner data URL

## Note about images

The current frontend sends banner/signature images as data URLs.
This backend supports them and stores them in PostgreSQL.

For a very large number of images, object storage (such as Supabase Storage or Cloudinary) would be faster and cheaper. The current backend is designed to work with the frontend you supplied without requiring a frontend rewrite.
