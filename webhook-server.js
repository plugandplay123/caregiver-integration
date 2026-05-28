require("dotenv").config();
const express = require("express");
const app     = express();

app.use(express.json());

const PORT               = process.env.PORT               || 3000;
const PANDADOC_API_KEY   = process.env.PANDADOC_API_KEY;
const AXISCARE_TOKEN     = process.env.AXISCARE_TOKEN;
const AXISCARE_SITE      = process.env.AXISCARE_SITE_NUMBER;
const AXISCARE_BASE      = `https://${AXISCARE_SITE}.axiscare.com/api`;
const AXISCARE_API_VER   = "2023-10-01";

function toAxisDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  return d.toISOString().split("T")[0];
}

function cleanPhone(value) {
  if (!value) return null;
  return value.replace(/\D/g, "") || null;
}

async function fetchDocumentFields(documentId) {
  const res = await fetch(
    `https://api.pandadoc.com/public/v1/documents/${documentId}/fields`,
    {
      headers: {
        "Authorization": `API-Key ${PANDADOC_API_KEY}`,
        "Content-Type":  "application/json",
      },
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch PandaDoc fields: ${err}`);
  }
  const data = await res.json();
  console.log("Raw fields from PandaDoc:", JSON.stringify(data, null, 2));
  const map = {};
  (data.fields || []).forEach(f => { map[f.field_id] = f.value ?? null; });
  return map;
}

function buildAxisCarePayload(fields) {
  const hasAddress = fields.streetAddress || fields.city || fields.state || fields.postalCode;
  const mailingAddress = hasAddress
    ? {
        streetAddress1: fields.streetAddress  || null,
        streetAddress2: fields.streetAddress2 || null,
        city:           fields.city           || null,
        state:          fields.state          || null,
        postalCode:     fields.postalCode     || null,
      }
    : null;

  const validReferredByTypes = ["license", "client", "caregiver", "contact", "organization", "other"];
  const referredByType = validReferredByTypes.includes(fields.referredByType) ? fields.referredByType : null;
  const referredBy =
    fields.referredByName && referredByType
      ? { type: referredByType, name: fields.referredByName }
      : null;

  return {
    firstName:     fields.firstName || null,
    lastName:      fields.lastName  || null,
    middleInitial: fields.middleInitial?.slice(0, 2) || null,
    ssn:           fields.ssn || null,
    dateOfBirth:   toAxisDate(fields.dateOfBirth),
    personalEmail: fields.personalEmail || null,
    mobilePhone:   cleanPhone(fields.mobilePhone),
    mailingAddress,
    referredBy,
    status: null,
  };
}

async function createAxisCareApplicant(payload) {
  const res = await fetch(`${AXISCARE_BASE}/applicants`, {
    method: "POST",
    headers: {
      "Authorization":          `Bearer ${AXISCARE_TOKEN}`,
      "Content-Type":           "application/json",
      "X-AxisCare-Api-Version": AXISCARE_API_VER,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`AxisCare error ${res.status}: ${JSON.stringify(data.errors || data)}`);
  }
  return data;
}

app.post("/webhook/pandadoc", async (req, res) => {
  res.status(200).json({ received: true });

  // PandaDoc sends an array of events
  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    const eventName = event?.event;
    const status    = event?.data?.status;
    const documentId   = event?.data?.id;
    const documentName = event?.data?.name;

    console.log(`\nEvent: ${eventName} | Status: ${status} | Doc: ${documentName}`);

    // Only process document_state_changed — ignore recipient_completed duplicate
    if (eventName !== "document_state_changed") {
      console.log("Skipping event type:", eventName);
      continue;
    }

    // Only process when fully completed
    if (status !== "document.completed") {
      console.log("Not completed yet — skipping");
      continue;
    }

    try {
      const fields = await fetchDocumentFields(documentId);
      console.log("Fields fetched:", Object.keys(fields).length);

      if (!fields.firstName || !fields.lastName) {
        console.error("ERROR: firstName or lastName missing — skipping");
        continue;
      }

      const payload = buildAxisCarePayload(fields);
      console.log("Sending to AxisCare...");

      // Strip null values — AxisCare rejects null for typed fields
  const cleanPayload = Object.fromEntries(
    Object.entries(payload).filter(([_, v]) => v !== null && v !== undefined)
  );
  const result = await createAxisCareApplicant(cleanPayload);
      console.log("Applicant created in AxisCare — ID:", result.results?.id);

    } catch (err) {
      console.error("ERROR:", err.message);
    }
  }
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`\nWebhook server running on port ${PORT}`);
  if (!AXISCARE_TOKEN)   console.warn("WARNING: AXISCARE_TOKEN not set");
  if (!AXISCARE_SITE)    console.warn("WARNING: AXISCARE_SITE_NUMBER not set");
  if (!PANDADOC_API_KEY) console.warn("WARNING: PANDADOC_API_KEY not set");
});
