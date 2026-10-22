# Dealer Linking

Dealer linking lets you say **"this record belongs to that dealer"**. Once a record is linked, the dealer sees it when they sign in to the dealer portal (`/dealer/account`, the Projects page). Project Map already does this for projects.

> The dealer always sees the **current** record. Nothing is copied: only the link is saved, and the portal reads the record live from your app's own table every time.

## When to use it

| Use it when | Do not use it when |
|---|---|
| A dealer should see this record in their portal | The record is internal only (staff notes, costs, payroll) |
| Your record has a dealer it belongs to (an order, a project, a quote) | You only need to show a dealer's name on screen: read `psb_s_dealermaster` instead |
| Staff pick the dealer from a list | A record needs more than one dealer: one record has one dealer only |

## How it works, in plain words

1. Staff open a record in your app and pick a dealer from a "Linked Dealer" list.
2. Your app saves a link: **which dealer**, **which app** (your `module_key`) and **which record** (its id). That is all that is stored, in the table `psb_m_dealerlink`.
3. The dealer signs in to the portal. The portal finds their links and reads each record **from your app's table**, showing only the columns you allowed.
4. Picking another dealer replaces the link. Clearing the list removes it.

## The files involved

| File | Repo | What it is for | Do you edit it? |
|---|---|---|---|
| `src/core/dealer/dealerLinks.js` | Core (copied into every app by the core sync) | Ready-made functions: dealer list, look up, link, unlink | **No**, you only call it |
| `src/core/dealer/dealerRecordSources.js` | **PSBUniverse-core only** | Tells the portal where your records live and what dealers may see | **Yes**, one entry for your app (step 5) |
| `src/modules/<your-module>/data/<name>.actions.js` | Your app | Your server actions that call the ready-made functions | Yes |
| Your form component | Your app | The "Linked Dealer" picker | Yes |
| `psb_m_dealerlink` | Database | Holds the links | **No**, no database change is needed |

> **Note:** the Quick Start says never edit `src/core`. `dealerRecordSources.js` is the one exception, and only for adding your app's entry. Make that change in **PSBUniverse-core**, never in your app's copy of core, and have a senior review it.

## Step by step

### Step 1: Find your module_key

Open your module's `index.js` and copy its `module_key` (for example `"project-map"`). It must match an **active** row in `psb_s_application`, or linking fails with "Unknown application".

At the top of your actions file, write it once:

```js
// Your app's module_key from psb_s_application. Write it once, here.
const DEALER_LINK_MODULE_KEY = "my-app";
```

### Step 2: Add two server actions

File: `src/modules/<your-module>/data/<name>.actions.js` (it already starts with `"use server"`).

```js
import { getCurrentSession } from "@/core/auth/session.service";
import {
  getDealerLink,
  linkRecordToDealer,
  listDealersForPicker,
  unlinkRecordFromDealer,
} from "@/core/dealer/dealerLinks";

// Dealer choices for the picker, plus the dealer this record is linked to now.
export async function loadMyRecordDealerOptions(recordId) {
  const [dealers, link] = await Promise.all([
    listDealersForPicker(),
    recordId ? getDealerLink({ moduleKey: DEALER_LINK_MODULE_KEY, recordId }) : null,
  ]);
  const options = dealers.map((dealer) => ({
    value: String(dealer.dealer_id),
    label: dealer.dealer_code ? dealer.dealer_name + " (" + dealer.dealer_code + ")" : dealer.dealer_name,
  }));
  return { dealers: options, linkedDealerId: link ? String(link.dealer_id) : "" };
}

// Saves the picker. An empty choice removes the link.
export async function setMyRecordDealer(recordId, dealerId) {
  const session = await getCurrentSession();
  if (!session?.userId) throw new Error("Please sign in again.");

  if (!dealerId) {
    await unlinkRecordFromDealer({ moduleKey: DEALER_LINK_MODULE_KEY, recordId });
    return { linked: false };
  }
  const dealer = await linkRecordToDealer({
    moduleKey: DEALER_LINK_MODULE_KEY,
    recordId,
    dealerId,
    userId: Number(session.userId) || null,
  });
  return { linked: true, dealer };
}
```

Rename `MyRecord` to your record's name, for example `loadOrderDealerOptions`.

> If a record is linked to a dealer that was later switched off, that dealer is not in the list. Project Map adds it back as "(inactive)" so the form still shows it: see `loadProjectDealerOptions` in Project Map.

### Step 3: Add the Linked Dealer picker to your form

Use the shared `SearchSelect` (type to search). Keep the dealer **outside** your record's own form data: it is not a column of your table, and many save functions send every form field to the database.

```jsx
import { SearchSelect, toastError } from "@/shared/components/ui";
import { loadMyRecordDealerOptions, setMyRecordDealer } from "../data/myRecord.actions";

const [dealerOptions, setDealerOptions] = useState([]);
const [linkedDealerId, setLinkedDealerId] = useState("");

useEffect(() => {
  loadMyRecordDealerOptions(record?.id ?? null)
    .then((result) => {
      setDealerOptions(result.dealers);
      setLinkedDealerId(result.linkedDealerId);
    })
    .catch(() => toastError("Unable to load the dealer list."));
}, [record?.id]);

<SearchSelect
  options={dealerOptions}
  value={linkedDealerId || null}
  onChange={(value) => setLinkedDealerId(value == null ? "" : String(value))}
  placeholder="Not linked - pick a dealer"
  searchPlaceholder="Search dealers..."
/>
```

Save the link **after** the record is saved (a new record needs its id first), and on its own, so a link problem never loses the record:

```js
try {
  await setMyRecordDealer(savedRecord.id, linkedDealerId || null);
} catch (err) {
  toastError("The record was saved, but the dealer link was not: " + (err?.message || "unknown error"));
}
```

### Step 4: Remove the link when a record is deleted

In your delete action, after the record is deleted:

```js
// A leftover link is harmless, so a failure here must not block the delete.
try {
  await unlinkRecordFromDealer({ moduleKey: DEALER_LINK_MODULE_KEY, recordId: id });
} catch (linkError) {
  console.error("[deleteMyRecord] Failed to remove dealer link:", linkError?.message);
}
```

### Step 5: Tell the dealer portal about your records

File: `src/core/dealer/dealerRecordSources.js` in **PSBUniverse-core**. Add one entry inside `DEALER_RECORD_SOURCES`, keyed by your `module_key`. The names below are examples: use your real table and columns.

```js
"my-app": {
  appLabel: "My App",          // shown to the dealer
  recordLabel: "Order",        // what one record is called
  table: "myapp_t_orders",     // your table
  idColumn: "id",              // the column your record id is in
  // ONLY columns a dealer may see. Never internal notes, costs or payment details.
  select: "id, order_name, status_name, city, state_code, order_date, total_amount",
  toRecord(row) {
    return {
      title: text(row.order_name) || "Order",
      status: text(row.status_name),
      location: [row.city, row.state_code].map(text).filter(Boolean).join(", "),
      reference: text(row.id),
      sortDate: text(row.order_date),
      dateText: dateText(row.order_date),
      amountText: moneyText(row.total_amount),
      details: [
        ["Order", text(row.order_name)],
        ["Order date", dateText(row.order_date)],
      ],
    };
  },
},
```

`text`, `dateText` and `moneyText` already exist at the top of that file. The `"project-map"` entry there is a complete real example.

### Step 6: Sync, deploy and test

1. Make sure your app repo has `src/core/dealer/dealerLinks.js`. If it does not, get the latest core into your app first (the normal core sync, `scripts/sync-repo.ps1`).
2. Deploy **PSBUniverse-core** (for step 5) and **your app** (for steps 2 to 4).
3. Test with a **test dealer**, never a real one:

| Do this | You should see |
|---|---|
| In your app, pick the test dealer on a record and save | No error |
| Sign in at `/dealer/login` as that dealer, open Projects | Your record, labelled with your `appLabel` |
| Change the record in your app, refresh the portal | The change shows at once |
| Clear the picker and save, refresh the portal | The record is gone |

The dealer needs a portal login first: staff create it in **Dealer Master Setup** with the **Login** button.

## Rules

| Rule | Why |
|---|---|
| Call the dealer functions only from your server actions, after your own checks (signed in, allowed to edit) | They use the admin database key and do no permission checks themselves |
| Only staff link records. Never let the dealer portal link or unlink | Dealers would be able to claim other records |
| Never copy record details into `psb_m_dealerlink` | The dealer must always see live data |
| Never hard-code dealer ids or dealer names | Ids differ between the QAS and PROD databases |
| `module_key` uses lowercase letters, numbers and dashes only | The functions refuse anything else |
| Record ids are saved as text, up to 100 characters | Numbers and UUIDs both work |

## Common problems

| Message or symptom | Cause | Fix |
|---|---|---|
| "Unknown application ..." | Your `module_key` is not an active row in `psb_s_application` | Check the spelling and that the application is active |
| "That dealer is not active." | The dealer was switched off | Turn it back on in Dealer Master Setup, or pick another dealer |
| "That dealer does not exist." | The dealer was deleted, or the id is wrong | Pick the dealer again from the list |
| The link saves, but the dealer does not see the record | No entry in `dealerRecordSources.js`, or core not deployed | Do step 5 and deploy PSBUniverse-core |
| The dealer sees nothing at all from your app | A column name in `select` is wrong | Check the server log for `loadDealerRecords my-app:` and fix the column |

## The ready-made functions

| Function | What it does | Returns |
|---|---|---|
| `listDealersForPicker()` | Active dealers, by name | `[{ dealer_id, dealer_code, dealer_name }]` |
| `getDealerLink({ moduleKey, recordId })` | The dealer one record is linked to | The dealer, or `null` |
| `linkRecordToDealer({ moduleKey, recordId, dealerId, userId })` | Links a record, replacing any old link | The dealer |
| `unlinkRecordFromDealer({ moduleKey, recordId })` | Removes a record's link | Nothing |
| `listDealerLinks(dealerId)` | Every record linked to one dealer (used by the portal) | `[{ module_key, record_id }]` |

All of them are in `src/core/dealer/dealerLinks.js` and run on the server only.
