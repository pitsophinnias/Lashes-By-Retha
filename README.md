# Lashes By Retha Business Platform

Stack: Vite + React (customer site + admin), Node.js + Express (backend, port 3002), PostgreSQL, Render, Cloudflare, GitHub

Sections: Product marketplace, Beauty class enrolment, Setmore API integration (appointments read-only)

## Run order

1. cd backend && npm install && npm run dev — http://localhost:3002
2. cd admin-dashboard && npm install && npm run dev — http://localhost:5274
3. cd customer-site && npm install && npm run dev — http://localhost:5273

## Environment variables

Copy backend/.env.example to backend/.env and fill in values.

SETMORE_REFRESH_TOKEN — from the Setmore dashboard, needed for appointment API access

DATABASE_URL — PostgreSQL connection string
