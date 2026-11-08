# Next: automatic watching

The goal: Revenant keeps watching by itself and shows results on the live site. This is a plan only. Nothing here is built yet.

Written on 8 Nov 2026. The hackathon deadline is 10 Nov 2026, 17:00 UTC.

## 1. Scheduler: GitHub Actions

Limits checked on the Vercel and GitHub docs.

| Option | What the docs say | Fit |
|---|---|---|
| Vercel cron, Hobby plan | Once per day at most, and the run can land anywhere in a one-hour window. Faster schedules fail at deploy time. | No. Watching every 10 minutes is impossible. |
| GitHub Actions schedule | Shortest interval is 5 minutes. Runs can be delayed at busy times, especially at the start of the hour. | Yes. |
| Outside pinger (such as cron-job.org) hitting a Vercel route | Free and fast, but it adds a third party. The route must finish inside Vercel's function limit and must be protected with a secret. | Backup only. |

**Why GitHub Actions:** the job runs our own scripts directly, outside Vercel, so there is no function time limit. The scripts we already built (the scan, the watcher, the pull check) can run almost as they are. A run every 10 minutes also keeps visitor traffic and scanner traffic in separate places.

Two things to know about Actions:

- In a public repository, scheduled workflows switch themselves off after 60 days with no repository activity. This is no problem for the hackathon, since we push often.
- If the repo is private, check the free minutes before choosing the 10-minute interval. If the minutes are tight, run every 30 minutes instead.

The keys go in GitHub secrets under the same four names we use now (`TATUM_API_KEY`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_PRIVATE_KEY`, `MEMWAL_SERVER_URL`). They are never printed in logs.

## 2. Where the watch list and detections live

Vercel's disk is read-only, and an Actions run starts with an empty disk each time. So the data needs a store that both the job and the site can reach.

- **Detections and the watch list:** save them to Walrus Memory in new namespaces, `revenant-detections` and `revenant-watchlist`. They stay separate from `revenant-rugs` and `revenant-warnings`. The site reads them the way it reads rugs today, with a 5-minute cache and a committed snapshot as a fallback if Walrus is slow.
- **Scan position:** keep a "last checkpoint scanned" marker in the Actions cache. If the cache is lost, the next run just rescans the last few hours and skips tokens already saved.
- **Alternatives rejected:** committing JSON back to git from the job would trigger a Vercel redeploy on every commit. A separate database (Vercel's Redis or Blob free tiers) adds one more service to set up. Add one only if Walrus writes prove too slow for the watch list.

## 3. Sharing Tatum's 3 requests per second, visitors first

- **How it works today:** each running server has its own queue. Nothing is shared between visitors' traces on Vercel and a separate job like the scanner. So the limit would be shared on Tatum's side while we only manage it on our side.
- **Rule 1, fixed budget:** the scanner is limited to 1 request per second, so 2 per second are always left for visitors.
- **Rule 2, back off:** the first "too many requests" answer makes the scanner stop that run and wait for the next one. It never retries hard. Visitor traces keep their normal retries.
- **Rule 3, small jobs:** the scanner works in short bursts with a cap on calls per run. Past scans show the cost is low. Screening a token cost about 1 call, and a full check about 14. A normal run needs roughly 10 to 30 calls.
- **Rule 4, small watch list:** the list is capped at about 20 tokens, at 1 call each per run.
- **To check first:** whether Tatum gives a second key its own separate rate limit. If it does, that is the cleanest answer. Also check the monthly request quota on the free plan before turning this on.

## 4. Labelling detections, kept apart from the 8 rugs

- **Separate storage:** detections go to `revenant-detections`, never to `revenant-rugs`. The "rug pulls remembered" counter reads only `revenant-rugs`, so it stays at 8 with no extra code.
- **Wording and look:** every card says "Detected by Revenant, not yet checked by a person". It has its own grey "Detected" stamp, not the amber "Rug pulled" one. The detected tokens sit in their own section under the confirmed ones, with their own count.
- **No influence on verdicts:** detections do not feed the "linked to rug pulls we know" headline until a person confirms them.
- **Confirming:** a person confirms one the way BUBBLES was confirmed. A script re-saves it to `revenant-rugs` as confirmed and marks the detection as promoted. Only then does the 8 become 9.

## 5. Steps and time estimates

1. Check repo public or private, Tatum quota and a second key: 30 min
2. Data shapes, the two namespaces, the reader, with no screen yet: 3 hours
3. Scanner: find new tokens with real money in the pool, update the watch list, check pulls: 4 to 6 hours
4. Request budget and back-off rules: 2 to 3 hours
5. Saving detections to Walrus with duplicate protection and a cap: 2 hours
6. Site: separate section, labels, no change to the 8: 3 to 4 hours
7. GitHub workflow, secrets, cache: 1 to 2 hours
8. Dry run with no Walrus writes, watched for a day: about 1 hour of work, 1 day of waiting
9. Build, screenshots at 1280px and 390px: 1 to 2 hours
10. Preview review, then merge: 1 hour

That is about 2 to 3 working days plus the one-day dry run. With 2 days left before the deadline, a small version fits: steps 2, 3, 5, 6 (minimal) and 7, about one long day. Steps 4 and 8 come after, but keep the 1 request per second cap from step 4 in even the small version.

### What could break the live site

- **Rate starvation:** the scanner eating visitors' requests. The budget rules prevent it.
- **Counters:** detections mixed into `revenant-rugs` would change the 8. Separate storage prevents it.
- **Slower board:** an extra Walrus read slowing `/api/memory`. Use its own endpoint, cache and fallback.
- **Junk growth:** too many saved detections making the index slow. Use a cap and de-duplicate.
- **Wrong accusations:** a false detection shown as a fact. The wording, the grey stamp and "not yet checked" cover this.
- **Secrets:** a key leaking into GitHub logs. Never print keys, and check the log output.
- **Build or env:** a missing variable or a type error breaking the deploy. Run `next build` before every merge.
- **Walrus down:** the page must still load from the snapshots.

## 6. Branch and preview

Yes, this can be built on a separate branch, for example `watch-automation`. Vercel is already connected to the repo and the site is live, so each push to the branch gets its own preview link automatically, separate from production. Production only changes when the branch is merged into `main`.

- **Env vars:** check that the four variables are also set for Vercel's Preview environment, not only Production.
- **Test namespace:** the preview must not write test data into the real namespaces. Make the namespace names settings, so the branch uses `revenant-detections-test`.
- **Scheduled runs:** GitHub only runs scheduled workflows from the default branch, so the schedule cannot be tested on the branch. Test the script by hand locally or with a manual run, and turn the schedule on at merge.
- **Link visibility:** Vercel preview links are protected by default, so only people you invite can open them.
