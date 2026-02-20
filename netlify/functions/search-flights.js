let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const base = process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret
  });

  const tokenResponse = await fetch(`${base}/v1/security/oauth2/token`, {
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

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { origin, destination, departureDate, returnDate } = body;

    if (!origin || !destination || !departureDate || !returnDate) {
      return json(400, { error: "origin, destination, departureDate, and returnDate are required." });
    }

    if (origin === destination) {
      return json(400, { error: "Origin and destination must be different." });
    }

    const base = process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";
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

    const searchResponse = await fetch(`${base}/v2/shopping/flight-offers?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.text();
      return json(searchResponse.status, { error: `Flight search failed: ${err}` });
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
    return json(200, { offers });
  } catch (error) {
    return json(500, { error: error.message || "Unexpected server error." });
  }
};
