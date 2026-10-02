# Sync Script Test Checklist

**What changed:** The sync script explicitly fetches and merges `origin/main` before pushing, even if local commits were made before pulling. It does not rebase or force-push, and it retries up to three push attempts when origin advances during sync. Merge commits are expected when histories diverge; original commit hashes remain unchanged.

Tracked, staged, and untracked work is temporarily stashed and restored. Existing user stashes are left alone. A configured `core` remote is merged as before; origin-only repositories are also supported. Run the script from `main`; it refuses to switch branches or proceed during an unfinished Git operation.

## Everyday Workflow

Run `git status` and review your changes before publishing. If you want your current
work pushed, stage the intended files and commit them first, then run sync:

```powershell
git status
git add path/to/changed-file
git commit -m "Describe the change"
.\scripts\sync-repo.ps1
```

You can also sync before starting work without making a new commit. Any uncommitted
tracked, staged, or untracked changes are temporarily stashed and then restored;
they are **not** committed or pushed. The script also retries normal pushes if
origin advances between its fetch and push.

If you committed before pulling, no history rewrite is needed. Run sync on `main`:
it fetches the remote commits, creates a merge when needed, and pushes both histories.
Conflicts still require manual resolution.

### Understanding Restoration Output

`Restoring saved changes...`, a list of modified/untracked files, and
`Dropped stash@{...}` mean that the script restored saved work and removed its own
temporary stash after a successful apply. `no changes added to commit` is Git's
normal status output, not an error. The restored files still need a commit before
they can be published. Check the final sync message and exit code; a later stash
conflict or a push failure is reported separately.

## Automated Local Tests

Run these before testing against a real remote:

```powershell
.\scripts\tests\sync-repo.tests.ps1
```

The tests create and remove temporary local repositories. They do not contact GitHub or alter your actual repository. They cover diverged commits, conflicting pull settings, saved-work restoration, older stashes, merge/stash conflicts, fetch failures, concurrent remote advances, rejected pushes, optional core sync, and wrong-branch preflight checks.

## Conflict Recovery

The script cannot safely choose between conflicting edits. It stops rather than pushing an unresolved merge or overwriting work.

- For a merge conflict, resolve the files and complete the merge, or run `git merge --abort`. The script prints the exact stash hash and a `git stash apply --index <hash>` recovery command. Restore the saved work after the merge is finished or aborted.
- For a stash-restoration conflict, the stash is kept and the script exits with failure. Resolve the files already present in the worktree; do not blindly apply the same stash again. Inspect `git stash list` before dropping the saved stash.
- For network or permission failures without conflicts, saved work is restored and the script exits with failure. Your local commits remain available for a later retry.

The script never commits uncommitted work. Only existing commits and any conflict-free merge commits are pushed.

**Your job:** Run through the checklist below in YOUR app repo to make sure everything still works. Do NOT skip the safety steps.

---

## Before You Start

- [ ] Review your work and commit changes you want included in the next push; sync preserves uncommitted changes but does not publish them
- [ ] Confirm you're on `main`: run `git branch --show-current` — it should say `main`
- [ ] Confirm your remote is set up: run `git remote -v` — `origin` is required; app repos should also have `core` (the shared platform repo)

The core platform repo can sync with `origin` only. If an app repo is expected to
receive shared core updates but its `core` remote is missing, ask your senior to
configure it; the script skips core sync when that remote is absent.

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

Your senior has updated core. For an app repo with a `core` remote and a clean
worktree, fetch and merge explicitly rather than relying on `git pull` settings:

```bash
git checkout main
git fetch origin main
git merge --ff --no-edit origin/main
git fetch core main
git merge --ff --no-edit core/main -m "Merge upstream core changes into main"
git push origin main
```

For an origin-only repo, omit the two `core` commands. The updated script maintains
the `core-main` mirror automatically on subsequent runs.

### Expected Results

| Step | You should see |
|---|---|
| `git checkout main` | On `main` |
| `git fetch origin main` / `git fetch core main` | Remote refs are refreshed |
| `git merge --ff --no-edit ...` | Fast-forward, merge commit, or `Already up to date.` |
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

You should see explicit `merge --ff --no-edit` arguments. Comments and operation
checks may mention rebase, but the script never executes a rebase.

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

- A diverged history produces a merge commit; a fast-forward or no-op does not require a new merge commit
- Your previous commits should still be there with the **same hashes** as before
- No duplicated commit messages

---

## Step 6: Run the Sync Script (Full Test)

Now test the actual script. If the remotes have not changed since Step 2, no new
commits should be needed. This is a live sync that can push committed work to origin:

```powershell
.\scripts\sync-repo.ps1
```

### Expected Results

| Step in script | You should see |
|---|---|
| `[1/4] Fetching and merging latest main from origin` | `Already up to date.` |
| `[2/4] Refreshing core-main` | Fetch completes and the tracking mirror is updated, or core is skipped for an origin-only repo |
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
