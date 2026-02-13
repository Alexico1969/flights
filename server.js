const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const AMADEUS_BASE = process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";
const AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID;
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

  if (!AMADEUS_CLIENT_ID || !AMADEUS_CLIENT_SECRET) {
    throw new Error("Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: AMADEUS_CLIENT_ID,
    client_secret: AMADEUS_CLIENT_SECRET
  });

  const tokenResponse = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    throw new Error(`Token request failed: ${tokenResponse.status} ${err}`);
  }

  const tokenData = await tokenResponse.json();
  cachedToken = tokenData.access_token;

  const expiresIn = Number(tokenData.expires_in || 1799);
  cachedTokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;

  return cachedToken;
}

app.post("/api/search-flights", async (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate } = req.body || {};

    if (!origin || !destination || !departureDate || !returnDate) {
      return res.status(400).json({ error: "origin, destination, departureDate, and returnDate are required." });
    }

    if (origin === destination) {
      return res.status(400).json({ error: "Origin and destination must be different." });
    }

    const accessToken = await getAccessToken();
    const params = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate,
      returnDate,
      adults: "1",
      nonStop: "false",
      currencyCode: "USD",
      max: "12"
    });

    const searchResponse = await fetch(`${AMADEUS_BASE}/v2/shopping/flight-offers?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.text();
      return res.status(searchResponse.status).json({ error: `Flight search failed: ${err}` });
    }

    const searchData = await searchResponse.json();
    const offers = (searchData.data || []).map((offer) => {
      const itineraries = offer.itineraries || [];
      const outbound = itineraries[0];
      const inbound = itineraries[1];
      const firstOutbound = outbound?.segments?.[0];
      const lastOutbound = outbound?.segments?.[outbound.segments.length - 1];
      const firstInbound = inbound?.segments?.[0];
      const lastInbound = inbound?.segments?.[inbound.segments.length - 1];

      return {
        id: offer.id,
        price: offer.price?.total,
        currency: offer.price?.currency,
        validatingAirlineCodes: offer.validatingAirlineCodes || [],
        outbound: {
          departureAirport: firstOutbound?.departure?.iataCode,
          departureTime: firstOutbound?.departure?.at,
          arrivalAirport: lastOutbound?.arrival?.iataCode,
          arrivalTime: lastOutbound?.arrival?.at,
          duration: outbound?.duration,
          stops: Math.max((outbound?.segments?.length || 1) - 1, 0)
        },
        inbound: {
          departureAirport: firstInbound?.departure?.iataCode,
          departureTime: firstInbound?.departure?.at,
          arrivalAirport: lastInbound?.arrival?.iataCode,
          arrivalTime: lastInbound?.arrival?.at,
          duration: inbound?.duration,
          stops: Math.max((inbound?.segments?.length || 1) - 1, 0)
        }
      };
    });

    offers.sort((a, b) => Number(a.price) - Number(b.price));

    return res.json({ offers });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Find Flight app running on http://localhost:${port}`);
});
