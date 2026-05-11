# 20163 Question Submission App — Changes from the original GFM Voting App

This folder contains a modified version of the original `voting-app` adapted for the
**Sanmartino Guest Lecture cycle** (course 20163 Risk Management — Insurance Module).
The infrastructure (Express, in-memory store, SSE live updates, `@studbocconi.it`
email validation, admin password) is reused as-is. The data model has been switched
from *votes* to *submissions*, and a new *Question Wall* view has been added.

## File map

```
voting-app/
├── package.json              ← updated name and description only
├── server.js                 ← rewritten (data model + new endpoints)
└── public/
    ├── index.html            ← rewritten (Group Submission Form)
    ├── wall.html             ← NEW (Question Wall, public live view)
    └── admin.html            ← rewritten (Admin panel with selection toggles)
```

> The original `package-lock.json` and `node_modules/` are not duplicated here.
> When deploying, `npm install` will regenerate them from `package.json`.

## What the app now does

1. **Admin** configures groups (default: 10) via `/admin.html` and opens submissions.
2. **Each group** opens `/` (the Group Submission Form), enters a `@studbocconi.it`
   email, picks the group from the dropdown, and submits **2 questions + 2 AI
   hypothesised answers**. Word limits are enforced server-side: 50 words per
   question, 200 words per AI hypothesis. Any group member can resubmit; the latest
   submission overwrites the previous.
3. **Question Wall** at `/wall.html` is the public live view to be projected during
   the guest lecture. It shows **questions only**, never AI hypotheses, so as not
   to influence Sanmartino. Selected questions are highlighted in gold with a star.
4. **Admin** at `/admin.html` sees everything (questions + hypotheses) and can mark
   each question as "selected" with a toggle. Selections are reflected in real time
   on the Question Wall.
5. **Export**: from the admin panel, JSON or CSV export of the full Question &
   Hypothesis Sheet, to be distributed to the class at the start of Session 2.

## Endpoint summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/status` | public | Configured? Open? Teams list. |
| GET  | `/api/team/:teamId/submission` | public | Pre-fill form when re-editing. |
| POST | `/api/submit` | public | Submit/overwrite a group's 2 questions + 2 hypotheses. |
| GET  | `/api/questions` | public | Question Wall data (no hypotheses). |
| GET  | `/api/wall/stream` | public | SSE stream for Question Wall and submission form. |
| POST | `/api/admin/teams` | admin | Configure group list. |
| POST | `/api/admin/open` | admin | Open submissions. |
| POST | `/api/admin/close` | admin | Close submissions. |
| POST | `/api/admin/reset` | admin | Clear all submissions and selections. |
| GET  | `/api/admin/submissions` | admin | All submissions including hypotheses. |
| GET  | `/api/admin/stream` | admin | SSE stream with full data for the admin panel. |
| POST | `/api/admin/select` | admin | Toggle `selected` on a specific question (`{ teamId, qNum, selected }`). |
| GET  | `/api/admin/export.json` | admin | Full export as JSON. |
| GET  | `/api/admin/export.csv` | admin | Full export as CSV. |

## Deployment on Render

The app deploys identically to the original. Quick checklist:

1. Push this `voting-app/` folder to a Git repository (GitHub, GitLab).
2. On Render, create a new **Web Service** pointing to the repo.
3. **Environment**:
   - `Node version`: ≥ 18
   - `Build command`: `npm install`
   - `Start command`: `npm start`
4. **Environment variables**:
   - `ADMIN_PASS`: choose a new admin password (default fallback is `gfm2026`)
   - `PORT`: leave unset; Render injects it automatically
5. The state is **in-memory only**: a Render restart wipes all submissions. This is
   intentional for a one-shot classroom exercise. If persistence is needed in
   future, swap the in-memory `state.submissions` Map for a JSON file or SQLite.

## Operational sequence (Session 1 day)

1. Before class: open `/admin.html`, sign in, configure 10 groups, click **Open submissions**.
2. Distribute the URL of `/` to students (QR code on a slide is the smoothest path).
3. Project `/wall.html` on the screen as soon as the first submissions arrive.
4. At the end of Session 1, click **Close submissions** to freeze the set.
5. Hand the laptop to Sanmartino with `/wall.html` in full screen; he reads through
   the 20 questions and marks the ones he wants to address (or you do it on his
   instructions from `/admin.html`).
6. After the lecture, click **Export JSON** (or CSV) to obtain the Question &
   Hypothesis Sheet for Session 2.

## Notes on visual identity

The dark cyan/navy palette of the original app has been preserved across all three
views, so the look is immediately recognisable to students who used the voting app
before. The Question Wall is designed to project well: large group cards, clear
typography, selected questions highlighted in gold so Sanmartino's choices are
visible to the room in real time.
