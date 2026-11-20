# CivicMind live demo guide

Use this as the script for a 15–20 minute viva. It follows the code that is actually in the project. Read the numbers on the screen. Do not recite a score the page is not showing.

The public site is http://localhost:3000. The API is http://localhost:8000. API docs are at http://localhost:8000/docs. Health is http://localhost:8000/api/health.

## What is already in the database

A few real complaints are already stored around **Renuka Nagar / Mahavir Nagar** (Kandivali side of Mumbai): potholes on Roads & Infrastructure and a garbage report on Sanitation. Use those pins on the map as existing data.

Do not drop the new demo pin on that same spot. A new pothole there can join an incident that was already in the database, which makes the duplicate story confusing. The fresh examples below use **Bandra** and **Marine Drive**, which are many kilometres away. The duplicate rule is 500 metres, so those pins cannot merge with Renuka Nagar.

## 15–20 minute spoken sequence

Keep two browser windows open. Window A is the citizen (Chrome or Edge). Window B is the authority. Log the citizen in before you file anything, or the account page will not receive notifications.

| Minutes | Do this | Say this |
| --- | --- | --- |
| 0:00–1:30 | Window A, home page. Point at the four live figures, then the nav. | “These four numbers come from the database and the historical file. They are not placeholders. The citizen site is for filing and tracking. Command is a separate desk.” |
| 1:30–3:00 | Paste the nonsense complaint, pin Bandra, submit. Show the rejection card. | “The model rejected this before anything was stored. There is no complaint id, because invalid reports are not written to the database.” |
| 3:00–6:00 | Paste the first Bandra waterlogging text, same pin, submit. Show category, department, priority meter, CM code and INC code. | “The photo is optional here. The model only classifies the issue. The department and the priority score are computed by rules, not by the model. The clock and the coordinates come from the browser and the server, never from the model.” |
| 6:00–8:00 | Paste the second Bandra wording, same pin, submit. | “This is a different sentence about the same drain. It joins the same incident only if similarity, distance, and time all pass. The card shows each check.” |
| 8:00–9:30 | Move the pin to Marine Drive. Paste the street-light text. Submit. | “Same day, different place, different problem. Distance fails, so this is a new incident and a different department.” |
| 9:30–11:00 | Open the CM link. Then open Account and show the notification. | “The citizen can follow the complaint without being an authority. The notification exists because I was logged in when I filed.” |
| 11:00–14:30 | Window B, Command, admin login. All departments, then Roads, then back to All. Open the Bandra incident. Show the priority breakdown. Set In progress and save a note. | “An authority only sees their own desk. The administrator sees all ten desks and Unassigned. Priority is a weighted score from 0 to 10. Severity is a separate label.” |
| 14:30–17:30 | Map, then Analytics, then Evaluation, then Copilot with the priority question. | “The map plots stored incidents. The archive charts are the 30,000-row BMC file and are labeled historical. Duplicate accuracy is blank on purpose: we do not have a labeled pair set.” |
| 17:30–20:00 | Window A, refresh the tracking page. If time remains, resolve it in Window B and confirm or reopen in Window A. | “The citizen page is reading the same incident row. Refreshing it shows the status the desk just saved.” |

If Groq or the embedding service is slow, skip Hindi, voice, and the photo. Those three are the right things to cut. Do not skip the rejection, the valid filing, the duplicate card, the authority status change, and the citizen refresh.

---

## Pre-demo checklist

1. Supabase project is resumed, not paused. The API uses the session pooler on port 5432.
2. In `backend`, start the API with the project virtualenv:

   ```powershell
   .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
   ```

3. In `frontend`, start the site:

   ```powershell
   npm run dev
   ```

4. Open http://localhost:8000/api/health. You want `database_ok: true`, a PostGIS version, a pgvector version, and no embedding error. If `embedding_error` is set, accepted complaints cannot be stored, because every accepted complaint is embedded before insert.
5. `backend/.env` must contain `DATABASE_URL`, `GROQ_API_KEY`, `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, and `EMBEDDING_MODEL`. Groq is used for vision and chat. Groq does not provide embeddings, so embeddings are a separate OpenAI-compatible host. The running setup has been using Jina (`jina-embeddings-v3`, 1024 dimensions). Do not change the embedding model during the demo. The database refuses mixed dimensions.
6. Use Chrome or Edge if you will show voice. Firefox will not show a working Speak button. Allow the microphone when asked.
7. Log in on the citizen site first: Account → `citizen@civicmind.in` / `Citizen@12345`.
8. Have two photos on the laptop only if you will show images: one real civic photo (pothole, drain, garbage, or street light) and one unrelated photo (food or a selfie). JPG, PNG, or WebP. The browser compresses the file to JPEG, longest side 1280 pixels. The API rejects anything over 3.5 MB or a file that is not JPEG, PNG, or WebP by its bytes.
9. Write down the demo start time in UTC or IST, and later write down every `CM-` and `INC-` code the demo creates. You need those to delete only the demo rows.
10. Open Window B to http://localhost:3000/authority but do not log in until the authority section.

### Demo accounts

| Who | Email | Password | What they can see |
| --- | --- | --- | --- |
| Administrator | admin@civicmind.in | Admin@12345 | All departments and Unassigned |
| Citizen | citizen@civicmind.in | Citizen@12345 | Own complaints and notifications |
| Each desk | `{department_id}@civicmind.in` | Authority@12345 | Only that department |

Desk emails are `roads_infra@`, `water_supply@`, `sanitation@`, `street_lighting@`, `drainage@`, `public_health@`, `traffic@`, `parks_gardens@`, `building_encroachment@`, and `public_safety@`, all at `civicmind.in`.

Registration on the public site creates citizens only. An administrator creates authority accounts.

---

## Pins to use

Click the map. Do not trust “Use my location” unless you are physically in Mumbai. The pin is what gets stored.

- **Bandra, for the duplicate pair.** Click the coast around Carter Road / Bandra West. Roughly latitude 19.055, longitude 72.825. The area name is filled by the server from that pin. Say the name the screen shows.
- **Marine Drive, for the different-place complaint.** Roughly latitude 18.944, longitude 72.823.
- Leave **Renuka Nagar** alone. Those pins are the existing records.

The server stores the time in UTC when the complaint is accepted. The model is never asked for a time or a coordinate.

---

## Copy-paste complaints

**Nonsense, must be rejected.** Any pin is fine. No photo.

```text
asdfgh jkl qwerty nothing burger pizza movie tonight lol random words
```

**Unrelated, must be rejected.**

```text
I want a pizza delivered to my house and this website is useless. Buy me a movie ticket.
```

**Valid English, first Bandra report.** No photo the first time, so the photo check stays “No photo”.

```text
The storm drain outside the Bandra post office is blocked and the road is waterlogged up to the footpath. Vehicles are moving slowly through the standing water.
```

**Same place, different wording.** Keep the exact same pin.

```text
Rainwater is flooding the street by the Bandra post office because the drain is clogged and people cannot use the footpath.
```

**Different place, different problem.** Move the pin to Marine Drive first.

```text
The street light along the Marine Drive promenade has been dark for three nights and the pole is damaged.
```

**Hindi, only if you have time.** Use a pin that is not the Bandra drain pin, or this can join the waterlogging incident.

```text
समुद्र किनारे का स्ट्रीट लाइट तीन रातों से बंद है और खंभा टूटा हुआ है। रात में रास्ता अंधेरा है।
```

**Marathi, only if you have time.** Same caution: new pin, or a clearly different problem.

```text
बस स्टॉपजवळचा कचराकुंडी ओसंडून वाहत आहे. कचरा रस्त्यावर पसरला आहे आणि तो तीन दिवसांपासून उचलला गेलेला नाही.
```

**Reopen comment, after the authority has marked the incident resolved.** At least 8 characters.

```text
The drain is still blocked and the water has not gone down.
```

**Authority note when moving to In progress.**

```text
Crew assigned. Site visit scheduled for this ward.
```

**Resolution text.** At least 8 characters. The save is rejected without it.

```text
Drain cleared and standing water removed from the carriageway.
```

---

## Citizen interface

### 1. Homepage, live statistics, navigation

1. Open http://localhost:3000.
2. Read the four figures: Live complaints, Live incidents, Resolved, Archive.
3. Click Map, Archive, Assistant, Account, and Command only as a tour. Come back with Report.

What to show: the archive figure is 30,000 if the historical file loaded. Live figures match stored complaints and incidents. If the API is down, the figures are omitted rather than replaced with fake numbers.

Concept: the public homepage calls `/api/public/stats` and `/api/health`. Archive count is the BMC CSV. Live counts are SQL.

Verify: the live complaint count increases by one after a successful filing and a refresh. A rejected filing does not increase it.

### 2. Invalid complaint

1. Stay on the home page. You can be logged in.
2. Paste the nonsense text into “What is happening?”.
3. Click the map and drop the Bandra pin. Submit stays disabled until a pin exists.
4. Click Submit complaint.

What to show: a card titled “Not filed as a civic complaint”. Text says “Not a civic issue”. The explanation is the rejection reason. There is no CM code.

Concept: Groq (`qwen/qwen3.6-27b`) returns a JSON assessment. `apply_policy` then fails closed. If the model says the text is not a civic issue, the API returns the rejection and does not insert a row.

Verify: refresh the homepage. Live complaints is unchanged. Map does not gain a marker.

Say aloud if the model unexpectedly accepts the nonsense: “The policy is fail-closed, but the decision starts from the model. I will try the second unrelated sentence.” Do not pretend a rejection happened if the card says accepted.

### 3. Valid complaint, pin, routing, priority

1. Replace the text with the first Bandra waterlogging paragraph.
2. Keep or re-drop the Bandra pin. The coordinate box under the map must show latitude and longitude.
3. Leave language on English. Do not attach a photo yet.
4. Submit.

What to show, in this order:

- Text: Civic issue. Photo: No photo.
- Category, issue type, severity, confidence.
- Department name and the routing sentence.
- Priority meter with five factors.
- A `CM-` link and an `INC-` code.
- “New incident”, unless this pin accidentally matched something else.

Concept, one sentence each:

- Classification and the English description are the model.
- Department is deterministic: category map first, then phrase rules. Waterlogging is Drainage even if the word “water” is present, because the longer phrase wins.
- Priority is `0.30×impact + 0.25×safety risk + 0.20×report volume + 0.15×location + 0.10×duration`. For a fresh drainage report inside Mumbai with a named area, one report, and under 12 hours, impact is 9, location is 8, volume is 1, duration is 1, and risk follows the severity label (medium is 5). Read the meter rather than doing the arithmetic in your head.
- Urgent means score 8 or above. A brand-new single report usually is not urgent. Duration rises as the incident ages. The old Renuka Nagar incidents can look urgent because they have been open a long time.

Verify: click the `CM-` link. The tracking page shows the same text, status Open, and the pin’s area.

### 4. Hindi and Marathi

1. Click Hindi or Marathi before submitting.
2. Paste the matching paragraph.
3. Use a pin that is not the Bandra drain pin if you still want a separate incident.

What to show: the result description is in English even when the complaint is not. The language chip is stored with the complaint.

Concept: the vision prompt tells the model to accept English, Hindi, and Marathi and to write the structured description in English. Routing still uses the English features plus phrase rules, so Hindi words alone do not drive the department.

Verify: the tracking page or the authority incident shows the original Hindi or Marathi text, not a translation substituted for it.

Reliability: this depends on Groq. If the model rejects a clearly civic Hindi sentence, say so and continue in English. That is a model miss, not a routing bug.

### 5. Voice

1. Select the language chip first. English uses `en-IN`, Hindi `hi-IN`, Marathi `mr-IN`.
2. Click Speak. Allow the microphone.
3. Say the Bandra sentence, or a short new one at a new pin: “The footpath near the bus stop is broken and people are walking on the road.”
4. Click Stop listening if it does not stop. Edit any wrong words. Then pin and submit.

What to show: words appearing in the textarea. After submit, the same validation card as a typed complaint.

Concept: speech-to-text is the browser Web Speech API. Nothing is sent to Groq until you submit the text. The product does not run its own speech model.

Verify: turn off the microphone permission and show that Speak reports that this browser cannot dictate. That is an honest negative test.

Reliability: Chrome and Edge only. A noisy room can produce a transcript the model then rejects. Fix the text before submitting.

### 6. Image and multimodal check

Do the irrelevant photo first. It should not be stored.

1. Type a valid sentence, for example the Marine Drive street-light text, on a new pin.
2. Upload the food photo or selfie.
3. Submit.

What to show: “Not a civic photo”, rejection, no CM code.

Then, if you have a real civic photo:

1. Same valid sentence, photo of a drain, road, light, or garbage that matches the sentence.
2. Submit.

What to show: Photo “Shows the issue”, and `visual_evidence` describing the picture. The citizen image is on the tracking page and later in the authority drawer.

Concept: one Groq vision call sees the text and the image together. Policy: if a photo is attached, `image_shows_civic_issue` must be true. A civic sentence with a selfie is rejected. Text and photo are not stored on rejection.

Verify: rejected photo does not appear under Account → my complaints.

Reliability: the model can disagree with you about a blurry photo. If a good civic photo is rejected, say “fail closed” and submit that complaint without the photo so the rest of the demo continues.

### 7. Duplicate detection

1. Submit the first Bandra waterlogging text and note the `INC-` code.
2. Without moving the pin, submit the second wording.

What to show on the second card:

- “Existing incident” and the same `INC-` code.
- Semantic similarity, distance in metres, and time gap.
- Three pass/fail marks. The rule is similarity at least 0.80, distance at most 500 m, and time gap at most 72 hours. All three are required.
- Report count on that incident becomes 2. Volume points in the priority formula move from 1 to 3.

Then move the pin to Marine Drive and submit the street-light text.

What to show: “New incident”, a new `INC-` code, and a distance that fails the 500 m test against the Bandra report. Street Lighting is a different department from Drainage.

Concept: embeddings are compared with pgvector cosine similarity. Distance is PostGIS. The explanation is produced by `evaluate_candidates`. The model does not decide the match.

Verify: authority incident drawer lists both citizen texts under one incident for the Bandra pair, and a separate incident for Marine Drive.

Reliability: if similarity is under 0.80, the card still shows the three numbers and creates a new incident. Say “the rule refused to merge them, and it shows which test failed.” Do not tell the teacher the accuracy of this matcher. The evaluation page sets accuracy to null because there is no labeled pair set.

### 8. Tracking, map, filters

1. From the result card, click the `CM-` code. Or open http://localhost:3000/track/CM-XXXXXXXX after you have a code.
2. Show status, timeline, original text, department, and priority.
3. Open Map in the nav (http://localhost:3000/complaints).

What to show: Mumbai, clustered markers, hover text, the new Bandra and Marine Drive points, and the older Renuka Nagar points. Use Search with `pothole` or `drain`. Category and severity dropdowns filter the same list the map is using.

Concept: public list endpoints `/api/complaints` and `/api/incidents`. The map clusters by zoom. Colours are severity.

Verify: a rejected complaint never appears. The new accepted ones do, after the map reloads.

### 9. Citizen assistant

1. Open Assistant.
2. Click “How is the priority score calculated?” or paste:

```text
Which department handles a blocked storm drain?
```

What to show: an answer, a mode line, and source excerpts from `operations.md` or `citizen_guidance.md`. If the mode says the language model was not used, the answer is a briefing built from those excerpts. That is still a valid demo.

Concept: retrieval over the project’s own operating notes, with an optional Groq answer that is instructed not to invent counts or circular numbers. Optional tracking code on that page pulls one live complaint’s status. It is not a search engine over the web.

Verify: ask “What is the BMC circular number for potholes?” The assistant should say the notes do not cover that. If it invents a circular number, do not defend it. Say the prompt forbids that and show the retrieved excerpts.

### 10. Notifications, feedback, reopen

Notifications:

1. File while logged in as `citizen@civicmind.in`.
2. Open Account. The new complaint is listed. A notification appears when the authority later changes status.

Feedback and reopen only exist after status is Resolved. Do this at the end of the authority section, then return here.

1. On the tracking page, when status is Resolved, the confirm form and “Ask to reopen” appear.
2. Either click confirm, or paste the reopen sentence and click Ask to reopen.

What to show: confirmed leaves it resolved and writes a feedback event. Reopen sets status back to Open, clears the resolved time, increments reopen count, and notifies the department.

Concept: possession of the tracking code is enough to open the public tracking page and send feedback. The account notification list is only for the logged-in user id stored on the complaint.

Verify: after reopen, Window B shows the incident as Open again and the audit line “Citizen asked to reopen”.

---

## Authority command center

Open http://localhost:3000/authority in Window B.

### 1. Admin login and a department login

1. Sign in as `admin@civicmind.in` / `Admin@12345`.
2. Show the department chips: All, the ten desks, Unassigned.
3. Click Roads & Infrastructure. KPIs and the list shrink to that desk.
4. Click All again.
5. If you have a second profile or time, sign out and sign in as `drainage@civicmind.in` / `Authority@12345`. The screen says the account is locked to Drainage. There is no department switcher.

Concept: the API forces an authority user’s scope to their department. Asking for another desk returns 403. Unassigned incidents are visible to administrators only. The UI hides that chip for a desk account.

Verify: the Bandra waterlogging incident is under Drainage, not under Roads. The Marine Drive light is under Street Lighting.

Unassigned: the live list may be empty. Say that. The archive evaluation is where stray-animal rows show up as the routing miss. Do not invent a live unassigned incident.

### 2. Overview

1. Click Overview.
2. Read complaints, active incidents, critical, urgent, resolved, resolution rate, and average resolution hours.
3. Show the map on the overview and the workload list.

What to show: zeros when a desk has no rows. The map count is incidents in the current desk, not the filtered table page.

Concept: KPIs are aggregated from stored incidents. Average resolution time is computed only from incidents that have both a start time and a resolved time. With no resolved demo incidents, that figure can be a dash. That is correct.

### 3. Incident, priority, evidence, status

1. Click Incidents, or Map, and open the Bandra `INC-` code.
2. Show the extractive summary (it quotes the stored citizen text), both reports if the duplicate merged, the routing reason, and the priority bars.
3. Optional: click Write AI summary. That calls Groq and stores `ai_summary`. Skip it if time is short. The extractive summary is already there without that button.
4. Set status to In progress. Paste the crew note. Save.
5. Click Map in the drawer if you want navigation. It opens Google directions from the stored coordinates.

What to show: priority factors with weights. A score of 8 or more is marked urgent. Severity stays a badge and is not the same number.

Status rules in code: Open can go to In progress or Resolved. In progress can go to Open or Resolved. Resolved can go back to Open. Resolving requires a resolution sentence of at least 8 characters.

6. Set Resolved, paste the drain-cleared sentence, save.
7. Attach the “after” photo in the evidence upload if you prepared one. JPG, PNG, or WebP, under 3.5 MB.

Concept: notes, status, and the resolution photo are written in the same database the citizen tracking page reads. Recommended next steps are rules on the stored fields, not a second model.

Verify: Window A, refresh the tracking page. Status and the note’s effect are visible. The resolution photo appears on the citizen timeline. Then either confirm or send the reopen sentence.

### 4. GIS

1. Click Map in the command nav.
2. Say the sentence already on the page: the map plots every incident in the workspace. Search and status filters apply to the list underneath, not to the map.
3. Click a marker and show the drawer.
4. Click Roads and show that the garbage and drainage pins leave the map.

Concept: dark canvas tiles, clustering until you zoom in, severity colours. The earlier “API key required” tiles were replaced because CARTO now stamps that on keyless tiles.

### 5. Hotspots

1. Click Hotspots.

What you will probably show: “No live cell meets the hotspot rule.” Say that clearly.

The rule, which is on the page: emerging means at least 3 incidents in a cell of about 0.008 degrees in the last 14 days, and either none in the previous 14 days or at least twice as many as that previous window. Recurring means at least 4 stored reports and at least one incident that is not resolved.

One or two demo incidents cannot satisfy that. Do not call the Bandra pin a hotspot.

Archive wards on that page are the historical file. The hint says they are not live hotspots. Area civic health is only for area names that exist on live incidents. The formula is on the page: higher is healthier.

### 6. Historical file, analytics, forecast

1. Click Analytics.
2. Point at “Live incidents” versus “Historical archive”.
3. If the forecast chart is present, read MAE, RMSE, and MAPE from the screen.

Concept: `frontend/data/bmc_historical_complaints.csv` has 30,000 rows, years 2019–2025. The forecast is an additive seasonal trend fit on that file: a least-squares line plus the average residual by calendar month. It holds out the last 6 months, needs 18 consecutive months, fills missing months with 0, and skips zero actuals in MAPE. It is not a neural network.

The live chart will only show months that have rows in Postgres. A demo filed today adds one month with a handful of incidents. Do not describe that chart as the BMC forecast.

Verify: the archive caption includes the row count and says it is the historical file.

### 7. Copilot

1. Click Copilot.
2. Paste:

```text
Which desk owns waterlogging, and what has to be true before two complaints join one incident?
```

What to show: the answer, the mode, and the excerpts. Same honesty rule as the citizen assistant. If Groq fails, the mode is a briefing and the excerpts are still on screen.

Concept: the copilot receives retrieved note chunks plus a JSON snapshot of the current desk. It is told not to invent statistics.

### 8. Evaluation

1. Click Evaluation.
2. Read routing agreement from the screen.
3. Point at the stray-animal category if it is in the table. Phrase routing does not assign that category, so those archive rows do not match the crosswalk. That pulls the agreement below 100 percent.
4. Read the duplicate-detection note. Accuracy is empty. Labeled pairs are 0.
5. Read the priority formula line.

Concept: routing agreement compares phrase routing of the archive category string with the archive department, through a fixed crosswalk (Roads to Roads & Infrastructure, Hydraulic to Water Supply, and so on). It is agreement with historical labels, not a trained classifier. Forecast MAE, RMSE, and MAPE are computed on the holdout months of the same file.

On this file the agreement is about 98 percent and the stray-animal rows are the miss. Still read the page. If the file is missing, the page says the historical file is not available. Do not invent the percentage.

### 9. Audit, accounts, exports

1. Click Audit. Show the lines for the status change you just made, with the time and the actor.
2. Click Reports. Download CSV, then PDF. Open the CSV and show the Bandra row.
3. Click Accounts only if you are the administrator. Show the seeded users. Creating another desk is optional and writes a user. Skip it in a short demo.

Concept: every status change, note, reassignment, and resolution photo is an `incident_events` row. CSV and PDF are generated from the current department scope. The PDF is a small built-in generator, not a third-party report product.

A department account’s export contains only that department. Unassigned rows are not in a desk export.

---

## Showing that authority and citizen share one record

1. Citizen is logged in and the tracking page for the Bandra `CM-` or `INC-` code is open.
2. Authority sets that incident to In progress and saves the crew note.
3. Citizen refreshes the tracking page. Status reads In progress.
4. Citizen opens Account. A “Complaint update” notification is there.
5. Authority marks it Resolved with the resolution sentence.
6. Citizen refreshes again. The confirm and reopen controls appear.
7. Citizen submits the reopen sentence.
8. Authority refreshes the incident. Status is Open, reopen count increased, audit shows the citizen sentence.

There is no websocket. You must refresh. Say that. The point is one Postgres row, two roles.

---

## What not to claim

- Duplicate-detection accuracy. It is not measured. The evaluation page says so.
- That every Hindi, Marathi, or photo decision will match your expectation. Those are model calls and can be wrong. The policy then fails closed.
- A live hotspot, a live forecast, or a live resolution-rate story from two new incidents.
- That the assistant can cite BMC circulars. The only retrieval corpus is `backend/knowledge/operations.md` and `citizen_guidance.md`.
- That voice is an in-house speech model.
- That the authority map is filtered by the search box. The search filters the list. The map shows the department’s incidents.
- An unassigned live incident, unless Unassigned actually has rows when you look.

## What is reliable without the model

Department routing, priority math, status transitions, auth scopes, tracking codes, the historical CSV charts, routing agreement, and the forecast arithmetic do not ask Groq. They still need Postgres, except the CSV charts on the Archive page, which are computed in the frontend from the file.

Accepted complaint filing needs both Groq and the embedding service. Rejection needs Groq only.

---

## How demo actions change the database

| Action | Writes? |
| --- | --- |
| Rejected text or rejected photo | No complaint and no incident |
| Accepted complaint | Inserts a complaint, inserts or updates an incident, stores an embedding, writes an event and notifications |
| Duplicate that matches | New complaint on the existing incident, `report_count` increases |
| Status, note, resolution text | Updates the incident and inserts an audit event and notifications |
| Resolution photo | Inserts `resolution_images` |
| Citizen confirm | Inserts feedback, audit event |
| Citizen reopen | Inserts feedback, sets status Open, clears `resolved_at`, increments `reopen_count` |
| AI summary button | Writes `incidents.ai_summary` |
| New authority user on Accounts | Inserts a user |
| Archive page, analytics, evaluation | No writes. They read the CSV and Postgres |
| Login | Inserts a session row. Only the hash of the token is stored |

The original Renuka Nagar complaints should stay. Demo rows are the new `CM-` and `INC-` codes.

### Reset only the demo rows

Do this after the viva, in the Supabase SQL editor. Run the SELECTs first. Replace the timestamp with the time you wrote down before the first successful submit. Use UTC. IST is five hours and 30 minutes ahead, so 16:00 IST is 10:30 UTC.

```sql
-- Preview first.
SELECT tracking_code, timestamp
FROM complaints
WHERE timestamp > TIMESTAMPTZ '2026-11-19 10:30:00+00';

SELECT tracking_code, first_reported_at
FROM incidents
WHERE first_reported_at > TIMESTAMPTZ '2026-11-19 10:30:00+00';
```

If those lists are only the codes you created, delete the children, then the complaints, then those incidents:

```sql
BEGIN;

DELETE FROM resolution_images
WHERE incident_id IN (
  SELECT id FROM incidents
  WHERE first_reported_at > TIMESTAMPTZ '2026-11-19 10:30:00+00'
);

DELETE FROM feedback
WHERE incident_id IN (
  SELECT id FROM incidents
  WHERE first_reported_at > TIMESTAMPTZ '2026-11-19 10:30:00+00'
);

DELETE FROM notifications
WHERE incident_id IN (
  SELECT id FROM incidents
  WHERE first_reported_at > TIMESTAMPTZ '2026-11-19 10:30:00+00'
);

DELETE FROM incident_events
WHERE incident_id IN (
  SELECT id FROM incidents
  WHERE first_reported_at > TIMESTAMPTZ '2026-11-19 10:30:00+00'
);

DELETE FROM complaints
WHERE timestamp > TIMESTAMPTZ '2026-11-19 10:30:00+00';

DELETE FROM incidents
WHERE first_reported_at > TIMESTAMPTZ '2026-11-19 10:30:00+00';

COMMIT;
```

If a demo complaint joined an older incident, do not delete that incident. Delete only the new complaint row, and say during the demo that `report_count` on the old incident was increased. Fixing that count by hand is optional and easy to get wrong, so prefer the far-away pins so every demo incident is new.

Do not run `DELETE FROM complaints` or `DELETE FROM incidents` without the timestamp filter.

---

## AI pipeline, in the order the code runs

1. The browser sends text, a language code, the map pin, and an optional image. It does not send a timestamp.
2. The API stamps the time in UTC.
3. Groq returns JSON: whether the text is civic, whether the photo shows that issue, category, type, subtype, severity, an English description, and a confidence.
4. `apply_policy` can only make the decision stricter. A failed text or a failed photo stops the request. Nothing is stored.
5. If it passes, the server reverse-geocodes the pin to an area name.
6. The embedding service embeds the complaint text plus the extracted features. The vector length must match the dimension already stored in the database.
7. pgvector finds nearby semantic candidates. PostGIS measures metres. The time gap is computed from stored timestamps.
8. The incident is reused only when similarity, distance, and time all pass. Otherwise a new incident is inserted.
9. `infer_department` assigns a desk from the category, then from phrases. No phrase and no mapped category means Unassigned, which only an administrator can work.
10. Priority is calculated from category, severity, report count, whether the pin is inside Mumbai, and age. It is stored and recomputed when the incident is opened, so duration does not go stale.
11. An extractive summary is built from the citizen sentences. A Groq summary is optional and later.
12. Authority edits are normal SQL updates plus audit rows. The citizen tracking page reads those rows.

---

## Questions a teacher may ask

**Why is priority not the same as severity?**  
Severity is the model’s label: low, medium, high, or critical. Priority is a separate 0–10 score. A medium drainage incident can outrank a high parks incident because impact, how many people reported it, location, and age are in the formula. The weights are 0.30, 0.25, 0.20, 0.15, and 0.10.

**Why not let the model assign the department?**  
The desk has to be explainable. Category and phrase rules return a sentence, `routing_reason`, which is shown on the result card and in the drawer. The model can be wrong. The rule can be read out in a viva.

**How can two different sentences be the same incident?**  
The embedding puts similar meanings near each other. That is necessary but not sufficient. The points must also be within 500 metres and 72 hours. If any one fails, the card says which one, and a new incident is created.

**What is your duplicate accuracy?**  
We do not have a labeled set of pairs, so we do not report one. The evaluation page shows accuracy as empty. The rule itself is unit-tested.

**What does the 98 percent on the evaluation page mean?**  
It is agreement between phrase routing and the historical department labels on the 30,000-row file, using a fixed crosswalk. It is not a trained classifier. The stray-animal category is the known miss.

**Is the forecast machine learning?**  
It is a seasonal trend fit on the archive: a straight line plus the average leftover for each calendar month, scored on the last six months with MAE, RMSE, and MAPE. The live database does not have 18 months of CivicMind reports, so the live product does not forecast itself. The chart is labeled historical.

**Where do coordinates and time come from?**  
The pin comes from the map click or the browser geolocation API. The timestamp is set on the server at insert. The prompt does not ask the model for either.

**How do you stop one department editing another department’s incident?**  
The session token is random. Only its SHA-256 hash is stored. Passwords are PBKDF2. On each authority request the server checks the role. An authority user is forced to their own `department` value. Unassigned incidents require an administrator.

**What happens if Groq is down?**  
Filing and the assistants fail with the provider error. Routing, priority, maps, the CSV archive, and already stored incidents still open. A rejected or failed call does not insert a half-written complaint.

**Why are there two models?**  
Groq is the chat and vision model. It does not serve embeddings. Similarity uses a separate embedding endpoint. The database records the vector size and will not mix a second embedding model into the same table.
