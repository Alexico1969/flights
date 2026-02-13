const form = document.getElementById("flight-form");
const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const departureDateInput = document.getElementById("departureDate");
const returnDateInput = document.getElementById("returnDate");
const results = document.getElementById("results");
const statusText = document.getElementById("status");
const searchBtn = document.getElementById("search-btn");
const STORAGE_KEY = "find-flight:last-search";

function setDateMinimums() {
  const today = new Date();
  const iso = today.toISOString().split("T")[0];
  departureDateInput.min = iso;
  returnDateInput.min = iso;
}

function saveLastSearch({ origin, destination, departureDate, returnDate }) {
  const payload = { origin, destination, departureDate, returnDate };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreLastSearch() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (typeof data.origin === "string") originInput.value = data.origin;
    if (typeof data.destination === "string") destinationInput.value = data.destination;
    if (typeof data.departureDate === "string") departureDateInput.value = data.departureDate;
    if (typeof data.returnDate === "string") returnDateInput.value = data.returnDate;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function fmtDateTime(value) {
  if (!value) {
    return "Unknown time";
  }
  const date = new Date(value);
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function humanDuration(isoDuration) {
  if (!isoDuration || typeof isoDuration !== "string") {
    return "Unknown duration";
  }
  const h = isoDuration.match(/(\d+)H/);
  const m = isoDuration.match(/(\d+)M/);
  const parts = [];
  if (h) parts.push(`${h[1]}h`);
  if (m) parts.push(`${m[1]}m`);
  return parts.join(" ") || isoDuration;
}

function googleFlightsUrl(offer) {
  const outDate = (offer.outbound.departureTime || "").split("T")[0];
  const inDate = (offer.inbound.departureTime || "").split("T")[0];
  const from = offer.outbound.departureAirport;
  const to = offer.outbound.arrivalAirport;

  if (!from || !to || !outDate || !inDate) {
    return "https://www.google.com/travel/flights";
  }

  return `https://www.google.com/travel/flights?hl=en#flt=${from}.${to}.${outDate}*${to}.${from}.${inDate};c:USD;e:1;sd:1;t:f`;
}

function renderOffers(offers) {
  if (!offers.length) {
    results.innerHTML = "<p class='flight-card'>No flights found for these dates and airports.</p>";
    return;
  }

  results.innerHTML = offers
    .map((offer, idx) => {
      const airlines = offer.validatingAirlineCodes?.join(", ") || "Airline unavailable";
      const flightUrl = googleFlightsUrl(offer);
      return `
        <article class="flight-card" style="animation-delay:${Math.min(idx * 70, 350)}ms">
          <div class="flight-top">
            <div class="price">${offer.currency} ${offer.price}</div>
            <span class="badge">${airlines}</span>
          </div>

          <div class="leg">
            <p class="leg-title">Outbound</p>
            <p class="route">${offer.outbound.departureAirport} -> ${offer.outbound.arrivalAirport}</p>
            <p class="meta">
              ${fmtDateTime(offer.outbound.departureTime)} to ${fmtDateTime(offer.outbound.arrivalTime)}
              | ${humanDuration(offer.outbound.duration)} | Stops: ${offer.outbound.stops}
            </p>
          </div>

          <div class="leg">
            <p class="leg-title">Return</p>
            <p class="route">${offer.inbound.departureAirport} -> ${offer.inbound.arrivalAirport}</p>
            <p class="meta">
              ${fmtDateTime(offer.inbound.departureTime)} to ${fmtDateTime(offer.inbound.arrivalTime)}
              | ${humanDuration(offer.inbound.duration)} | Stops: ${offer.inbound.stops}
            </p>
          </div>

          <div class="leg">
            <a href="${flightUrl}" target="_blank" rel="noopener noreferrer">View Flight Webpage</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#9a1e06" : "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  results.innerHTML = "";

  const origin = originInput.value;
  const destination = destinationInput.value;
  const departureDate = departureDateInput.value;
  const returnDate = returnDateInput.value;

  if (!origin || !destination || !departureDate || !returnDate) {
    setStatus("Please complete all fields.", true);
    return;
  }

  if (origin === destination) {
    setStatus("Departure and destination airports must be different.", true);
    return;
  }

  if (returnDate < departureDate) {
    setStatus("Return date must be on or after departure date.", true);
    return;
  }

  try {
    searchBtn.disabled = true;
    setStatus("Searching for best flight options...");
    saveLastSearch({ origin, destination, departureDate, returnDate });

    const response = await fetch("/api/search-flights", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        origin,
        destination,
        departureDate,
        returnDate
      })
    });

    const raw = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let payload = {};

    if (raw && contentType.includes("application/json")) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = {};
      }
    }

    if (!response.ok) {
      const fallback = raw ? raw.slice(0, 180) : "Search request failed.";
      throw new Error(payload.error || fallback);
    }

    renderOffers(payload.offers || []);
    setStatus(`Found ${payload.offers?.length || 0} options sorted by price.`);
  } catch (error) {
    setStatus(error.message || "Unable to search flights right now.", true);
  } finally {
    searchBtn.disabled = false;
  }
});

setDateMinimums();
restoreLastSearch();
