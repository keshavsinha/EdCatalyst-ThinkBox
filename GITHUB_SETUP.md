# Publishing this repository on GitHub

This folder is already a git repository with the full commit history (v3.0 → v3.3). You only need to create an empty repo on GitHub and push.

## Option A: GitHub website + Git (recommended)

1. Go to <https://github.com/new>.
   - **Repository name:** `thinkbox`
   - **Visibility:** Public
   - Leave **Add a README**, **.gitignore** and **license** unticked, because this repo already has them.
   - Click **Create repository**.
2. Open a terminal (Windows: *Git Bash* or *PowerShell*) inside this unzipped folder and run:
   ```bash
   git remote add origin https://github.com/keshavsinha/thinkbox.git
   git push -u origin main
   ```
3. When asked to sign in, use your GitHub username. For the password, use a **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens → *Generate new token*, with the `repo` scope), or let the browser sign-in window open.

## Option B: GitHub Desktop (no commands)

1. Install GitHub Desktop from <https://desktop.github.com> and sign in.
2. **File → Add local repository** → choose this folder.
3. Click **Publish repository**, untick *Keep this code private*, then click **Publish**.

## Option C: GitHub CLI

```bash
gh auth login
gh repo create thinkbox --public --source . --push
```

## After publishing

- **About** (gear icon on the repo page): add the description *ThinkBox — think first, then check. Practice & revision Chrome extension with hints, explained answers and double-checking*, the website `https://edcatalyst.in`, and the topics `chrome-extension`, `education`, `study-tool`, `ocr`, `groq`.
- **Release:** Releases → *Draft a new release* → tag `v3.3.0` → attach a ZIP of the folder. Students can then download it from the Releases page.
- **Video walkthrough:** upload it to YouTube and add the link under the title in `README.md`:
  ```markdown
  ▶️ **Video walkthrough:** https://youtu.be/YOUR_VIDEO_ID
  ```

## Updating later

```bash
git add -A
git commit -m "Describe the change"
git push
```

## Before every push

Never commit an API key. Run this check first; it should print nothing:
```bash
git grep -nE "gsk_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}|AIza[0-9A-Za-z_-]{30}"
```
