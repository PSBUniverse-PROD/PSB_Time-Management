# Sync Script Test Checklist

**What changed:** The sync script (`scripts/sync-repo.ps1`) now uses `merge` instead of `rebase`. This means no more force-pushing and no more duplicated commits.

**Your job:** Run through the checklist below in YOUR app repo to make sure everything still works. Do NOT skip the safety steps.

---

## Before You Start

- [ ] Make sure all your current work is committed and pushed
- [ ] Confirm you're on `main`: run `git branch --show-current` — it should say `main`
- [ ] Confirm your remote is set up: run `git remote -v` — you should see `origin` (your repo) and `core` (the shared platform repo)

If `core` remote is missing, stop and tell your senior.

---

## Step 1: Create a Safety Backup Branch

**Do this first. Do not skip this.**

```bash
git checkout main
git branch backup/pre-merge-test
```

This gives you a snapshot to restore if anything goes wrong. You can delete it later.

---

## Step 2: Pull the Updated Script

Your senior has updated core. Pull it:

```bash
git checkout core-main
git pull core main
git checkout main
git merge core-main -m "Merge upstream core changes into main"
git push origin main
```

### Expected Results

| Step | You should see |
|---|---|
| `git checkout core-main` | `Switched to branch 'core-main'` |
| `git pull core main` | Files updated, or `Already up to date.` |
| `git checkout main` | `Switched to branch 'main'` |
| `git merge core-main ...` | `Merge made by the 'ort' strategy` with a list of changed files, OR `Already up to date.` |
| `git push origin main` | Normal push output, NO `--force` needed |

### If Something Goes Wrong

If the merge says **CONFLICT**, do this:

```bash
git merge --abort
```

That undoes the merge completely. Tell your senior which files conflicted.

---

## Step 3: Verify the Script Exists

```bash
cat scripts/sync-repo.ps1 | Select-String "merge"
```

### Expected Result

You should see lines mentioning `merge` (not `rebase`). This confirms you got the updated script.

---

## Step 4: Verify Your App Still Works

```bash
npm run dev
```

### Expected Results

- [ ] Dev server starts on http://localhost:3000
- [ ] Your module's page loads (click through to it from the dashboard)
- [ ] No new console errors in the browser

Then stop the dev server (Ctrl+C) and run:

```bash
npm run build
```

- [ ] Build completes with no errors

---

## Step 5: Verify Your Git History is Clean

```bash
git log --oneline -10
```

### Expected Result

- You should see a new merge commit at the top: `Merge upstream core changes into main`
- Your previous commits should still be there with the **same hashes** as before
- No duplicated commit messages

---

## Step 6: Run the Sync Script (Full Test)

Now test the actual script. Since core hasn't changed since Step 2, this should be a no-op:

```powershell
.\scripts\sync-repo.ps1
```

### Expected Results

| Step in script | You should see |
|---|---|
| `[1/4] Pulling latest main` | `Already up to date.` |
| `[2/4] Updating core-main` | `Already up to date.` |
| `[3/4] Merging core-main` | `Already up to date.` |
| `[4/4] Pushing main` | `Everything up-to-date` |
| Final message | `=== Sync complete! Ready to work. ===` |

If any step shows an ERROR, **do not try to fix it yourself**. Copy the full terminal output and send it to your senior.

---

## Step 7: Clean Up

Once everything passes, delete the backup branch:

```bash
git branch -d backup/pre-merge-test
```

---

## Quick Summary

| Check | Pass? |
|---|---|
| Backup branch created before testing | |
| Merge from core-main succeeded (no force-push) | |
| `scripts/sync-repo.ps1` contains merge commands | |
| `npm run dev` works, module loads | |
| `npm run build` passes | |
| Git log shows stable hashes (no duplicates) | |
| `.\scripts\sync-repo.ps1` runs cleanly | |
| Backup branch deleted | |

**If all boxes are checked, reply to your senior: "Sync script tested, all clear."**

**If anything failed, send your senior the terminal output. Do NOT try to fix it.**
