# YDSP Mission Quiz (GitHub Pages + Firebase)

| Page | File | Who |
|---|---|---|
| Students join | `index.html` (the site's main address) | Phones. Shown as a QR code on the big screen |
| Big screen | `show.html` | Projector. **Runs the game**: Start, Reveal, Leaderboard, Next |
| Admin | `admin.html` | You. Edit questions; changes appear on the big screen instantly |

Sign in on `show.html` and `admin.html` with the email and password you added in Firebase Authentication.

## One-time setup

1. **Database rules:** Firebase console → Realtime Database → **Rules** tab → delete everything → paste the contents of `database.rules.json` → **Publish**.
2. **Upload to GitHub:** create a **Public** repository. Free GitHub Pages only works on public repositories. Your questions and answers are stored in Firebase, not in these files. Upload everything in this folder, including the `assets` folder.
3. **Turn on GitHub Pages:** repository → **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → **Save**. After 1–2 minutes the address appears at the top, like `https://yourname.github.io/mission-quiz/`.
4. **First sign-in:** open `…/admin.html` and sign in. The first email account to sign in becomes the quiz admin, so do this straight away. The 10 question slots are created for you.

## On the day

- Open `show.html` on the projector and sign in. **Only open one big screen**, because it runs the game.
- Students scan the QR code and type a nickname. No accounts or app needed. Mobile data or any Wi-Fi works.
- **Space / → / Enter** moves to the next step. A question ends when time runs out or every connected student has answered.
- Click a name twice to remove it. **⟲ Lobby** keeps players but clears scores. **New game** removes everyone.
- If the big screen is refreshed mid-game, it carries on where it left off.

## Limits (free Firebase plan)

100 devices connected at once, which is plenty for 24 students plus the screens.
