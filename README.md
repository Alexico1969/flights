# Find Flight Web App

Round-trip flight finder web app with:

- Fixed airport choices: `JFK`, `LGA` (La Guardia), `AMS` (Amsterdam)
- Travel + return date selection
- Online flight search using Amadeus Flight Offers API
- Multiple returned options sorted by lowest price
- Travel-themed responsive UI
- Netlify deployment support via serverless function

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file and configure Amadeus credentials:
   ```bash
   copy .env.example .env
   ```
3. Fill in your `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` in `.env`.
4. Start the app:
   ```bash
   npm start
   ```
5. Open:
   `http://localhost:3000`

## Netlify Deployment

This project is configured for Netlify:

- Static site: `public/`
- Serverless API: `netlify/functions/search-flights.js`
- Redirect: `/api/search-flights` -> `/.netlify/functions/search-flights`

### Deploy Steps

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Netlify, create a new site from that repo.
3. Build settings:
   - Build command: leave empty
   - Publish directory: `public`
4. In Netlify Site Settings -> Environment Variables, add:
   - `AMADEUS_CLIENT_ID`
   - `AMADEUS_CLIENT_SECRET`
   - `AMADEUS_BASE_URL` = `https://test.api.amadeus.com`
5. Deploy site.

### Local Netlify Test

Run:

```bash
npm install
npm run netlify:dev
```

Then open the local URL shown by Netlify CLI.

## Notes

- Uses Amadeus test environment by default (`https://test.api.amadeus.com`).
- If you want production flight results, switch credentials/base URL accordingly.
