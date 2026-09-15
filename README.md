# OPPS — Street Empire

> A text-based street empire builder built for the [Jest platform](https://jest.com) — playable instantly via RCS/iMessage, no app store required.

**Status: Early Prototype / Work In Progress**

---

## About

OPPS is an incremental street RPG where players build a street empire from the ground up. Run jobs, fight rivals, acquire properties, and grow your crew — all from within your messaging app.

Built by **Dominion Games** for the Jest platform, which delivers games through RCS messaging with zero friction — no download, no install, just tap a link and play.

---

## Gameplay

- **The Hood** — Monitor your status, collect income from properties, rest up, and launder money
- **Moves** — Run jobs to earn cash and XP, unlock higher-tier jobs as you rank up
- **Opps List** — Fight enemies to earn money and reputation
- **The Plug** — Buy weapons and gear to boost your attack and defense stats
- **Spots** — Purchase properties that generate passive income
- **Stats** — Track your rank, inventory, and overall progress

---

## Tech Stack

| Layer | Technology |
|---|---|
| Game | Vanilla JavaScript / HTML5 |
| Styling | CSS3 with custom properties |
| Data | JSON files served from CDN |
| Hosting | GitHub Pages |
| Platform | [Jest](https://jest.com) (RCS messaging) |
| State | localStorage (Jest SDK when available) |

---

## Project Structure

```
opps/
├── index.html            # Main entry point
├── css/
│   └── styles.css        # All styles
├── js/
│   ├── state.js          # Game state (G object) + GameState abstraction
│   ├── ui.js             # Shared UI helpers (tabs, toast, log)
│   ├── hud.js            # HUD rendering
│   ├── jobs.js           # Jobs mechanics
│   ├── combat.js         # Combat system
│   ├── store.js          # Item store
│   ├── properties.js     # Property management
│   ├── hood.js           # Hood activities
│   ├── stats.js          # Stats tab
│   ├── crew.js           # Crew system (stub — pending Jest SDK)
│   └── main.js           # Init, data loading, energy regen
├── data/
│   ├── jobs.json         # Job definitions
│   ├── enemies.json      # Enemy definitions
│   ├── gear.json         # Item definitions — the whole catalog, one id one row
│   ├── skills.json       # Skill identity + copy (costs live in tuning.json)
│   ├── plugs.json        # Plug roster + dialogue
│   ├── quests.json       # Plug quests
│   ├── moves.json        # MAKE MOVES content (featured / side / daily)
│   ├── city.json         # THE HOOD city seed + parameters
│   ├── properties.json   # Property definitions
│   └── ranks.json        # Rank name progression
└── assets/
    └── images/           # Game assets (coming soon)
```

---

## Local Development

Since the game fetches JSON data files, you need a local server — opening `index.html` directly won't work.

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/opps.git
cd opps

# Start a local server (pick one)
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

## Contributing

We welcome contributions from the team. Please follow these guidelines:

### Branching Strategy

```
main          ← stable, always deployable
└── feature/your-feature-name    ← your work goes here
```

Never commit directly to `main`. Always work on a feature branch and open a pull request.

```bash
# Start a new feature
git checkout -b feature/crew-mechanics

# When ready, push and open a PR
git push origin feature/crew-mechanics
```

### Commit Messages

Keep commit messages clear and descriptive:

```
✅ add crew invite link generation
✅ fix energy regen on mobile safari
✅ update enemy stats balancing
❌ fix stuff
❌ wip
❌ asdfgh
```

### Adding Game Content

- **New jobs, enemies, store items, properties** → edit the relevant file in `data/`— no JavaScript changes needed
- **New mechanics** → add a new file in `js/` and reference it in `index.html` in the correct load order
- **Styles** → all CSS lives in `css/styles.css`

### Jest SDK Integration

The `GameState` object in `js/state.js` is the single integration point for the Jest SDK. When SDK access becomes available, only this file needs to change — all other game logic remains untouched.

Similarly, `js/crew.js` contains stubs for crew and invite mechanics pending Jest SDK access.

---

## Roadmap

- [ ] Mobile layout (bottom nav bar for portrait mode)
- [ ] Crew invite mechanic via Jest SDK
- [ ] Hard currency UI and mock purchase flow
- [ ] Jest SDK integration (state, wallet, identity)
- [ ] Convert sidebar nav to mobile-friendly bottom tab bar
- [ ] Asset artwork for enemies, items, and properties
- [ ] Godot migration evaluation for v2

---

## License

Proprietary — © 2026 Dominion Games. All rights reserved.
