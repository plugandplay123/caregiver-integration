require("dotenv").config();
/**
 * create-template.js
 * Creates the Caregiver Application form template in PandaDoc (Sandbox)
 * Run once: node create-template.js
 */

const PANDADOC_API_KEY = process.env.PANDADOC_API_KEY; // set in .env
const PANDADOC_BASE    = "https://api.pandadoc.com/public/v1";

// ─── Field definitions ──────────────────────────────────────────────────────
// name        → used in webhook payload AND maps directly to AxisCare field
// title       → label shown to the caregiver on the form
// field_type  → text | date | dropdown | initials | signature
// required    → enforced by PandaDoc before submission
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = [
  // Personal info
  { name: "firstName",            title: "First name",                   field_type: "text",      required: true  },
  { name: "middleInitial",        title: "Middle initial",               field_type: "text",      required: false },
  { name: "lastName",             title: "Last name",                    field_type: "text",      required: true  },
  { name: "dateOfBirth",          title: "Date of birth",                field_type: "date",      required: false },
  { name: "gender",               title: "Gender",                       field_type: "dropdown",  required: false,
    options: ["M", "F", "Prefer not to say"] },
  { name: "ethnicity",            title: "Ethnicity",                    field_type: "text",      required: false },
  { name: "ssn",                  title: "Social Security Number",       field_type: "text",      required: false }, // masked in UI

  // Contact
  { name: "personalEmail",        title: "Personal email",               field_type: "text",      required: false },
  { name: "mobilePhone",          title: "Mobile phone",                 field_type: "text",      required: false },
  { name: "homePhone",            title: "Home phone",                   field_type: "text",      required: false },
  { name: "otherPhone",           title: "Other phone",                  field_type: "text",      required: false },

  // Mailing address
  { name: "streetAddress",        title: "Street address",               field_type: "text",      required: false },
  { name: "streetAddress2",       title: "Address line 2",               field_type: "text",      required: false },
  { name: "city",                 title: "City",                         field_type: "text",      required: false },
  { name: "state",                title: "State",                        field_type: "text",      required: false },
  { name: "postalCode",           title: "ZIP code",                     field_type: "text",      required: false },

  // Employment
  { name: "applicationDate",      title: "Application date",             field_type: "date",      required: false },
  { name: "startDate",            title: "Available start date",         field_type: "date",      required: false },
  { name: "hireDate",             title: "Hire date",                    field_type: "date",      required: false },
  { name: "payRate",              title: "Expected pay rate",            field_type: "text",      required: false },
  { name: "payrollId",            title: "Payroll ID",                   field_type: "text",      required: false },
  { name: "caregiverClass",       title: "Caregiver class",              field_type: "dropdown",  required: false,
    options: ["CGR", "CNA", "Comp", "HCA", "HHA", "LVN", "PCA", "RN", "STR"] },

  // Driver license
  { name: "driverLicenseNumber",      title: "Driver license number",    field_type: "text",      required: false },
  { name: "driverLicenseState",       title: "Driver license state",     field_type: "text",      required: false },
  { name: "driverLicenseExpiration",  title: "License expiration date",  field_type: "date",      required: false },
  { name: "driverLicenseIssued",      title: "License issue date",       field_type: "date",      required: false },
  { name: "acceptableDrivingDistance",title: "Max driving distance (mi)", field_type: "text",      required: false },

  // Referral
  { name: "referredByName",       title: "Referred by (name)",           field_type: "text",      required: false },
  { name: "referredByType",       title: "Referred by (type)",           field_type: "dropdown",  required: false,
    options: ["client", "caregiver", "contact", "organization", "other"] },

  // Signature
  { name: "applicantSignature",   title: "Applicant signature",          field_type: "signature", required: true  },
];

// ─── Build content blocks ─────────────────────────────────────────────────────

function buildContentBlocks(fields) {
  const sections = [
    { heading: "Personal information",  keys: ["firstName","middleInitial","lastName","dateOfBirth","gender","ethnicity","ssn"] },
    { heading: "Contact information",   keys: ["personalEmail","mobilePhone","homePhone","otherPhone"] },
    { heading: "Mailing address",       keys: ["streetAddress","streetAddress2","city","state","postalCode"] },
    { heading: "Employment details",    keys: ["applicationDate","startDate","hireDate","payRate","payrollId","caregiverClass"] },
    { heading: "Driver information",    keys: ["driverLicenseNumber","driverLicenseState","driverLicenseExpiration","driverLicenseIssued","acceptableDrivingDistance"] },
    { heading: "Referral",              keys: ["referredByName","referredByType"] },
    { heading: "Signature",             keys: ["applicantSignature"] },
  ];

  const fieldMap = Object.fromEntries(fields.map(f => [f.name, f]));
  const blocks   = [];

  // Document title block
  blocks.push({
    type: "text",
    content: "<h1>Caregiver Application</h1><p>Please complete all required fields and sign at the bottom.</p>",
  });

  sections.forEach(section => {
    // Section heading
    blocks.push({ type: "text", content: `<h2>${section.heading}</h2>` });

    // One content block per field in section
    section.keys.forEach(key => {
      const f = fieldMap[key];
      if (!f) return;

      blocks.push({
        type:    "field",
        name:    f.name,
        title:   f.title,
        field_type: f.field_type,
        ...(f.required && { merge_field: { editable: true, required: true } }),
        ...(f.options  && { options: f.options.map(o => ({ value: o, label: o })) }),
      });
    });
  });

  return blocks;
}

// ─── Create template ──────────────────────────────────────────────────────────

async function createTemplate() {
  if (!PANDADOC_API_KEY) {
    console.error("ERROR: PANDADOC_API_KEY environment variable not set.");
    process.exit(1);
  }

  const body = {
    name:       "Caregiver Application Form",
    recipients: [
      {
        email:      "applicant@example.com", // placeholder — replaced when sending
        first_name: "Applicant",
        last_name:  "",
        role:       "Applicant",
      },
    ],
    content: buildContentBlocks(FIELDS),
    metadata: {
      source:  "pandadoc-axiscare-integration",
      version: "1.0",
    },
  };

  try {
    const res = await fetch(`${PANDADOC_BASE}/documents`, {
      method:  "POST",
      headers: {
        "Authorization": `API-Key ${PANDADOC_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("PandaDoc API error:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log("✅ Template created successfully");
    console.log("   Document ID :", data.id);
    console.log("   Status      :", data.status);
    console.log("   Name        :", data.name);
    console.log("\n⚠  Save the Document ID — you need it in webhook-server.js");

  } catch (err) {
    console.error("Request failed:", err.message);
    process.exit(1);
  }
}

createTemplate();
