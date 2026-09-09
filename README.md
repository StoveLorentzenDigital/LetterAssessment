# Letter Check

A tiny offline PWA for tracking letter comprehension across a whole class.
Students are identified by number, never by name. For every student and every letter A–Z you
toggle three things:

| Toggle | Means |
| --- | --- |
| **A** (blue) | identifies the uppercase letter |
| **a** (amber) | identifies the lowercase letter |
| **🔊** (violet) | produces the letter sound |

That's 78 checks per student, well over a thousand for a full class — so the whole app is
built around making one tap the entire interaction.

**Live app:** <https://stovelorentzendigital.github.io/LetterAssessment/>

## Three ways to work

- **By student** — pick a child, run down the alphabet. Best for a one-on-one conference.
- **By letter** — pick a letter, run down the class list. Best for checking one target letter
  with everybody. The dots under each letter in the A–Z strip fill in when *every* student has
  mastered that category.
- **Overview** — the whole class as a grid: one column per letter, three bars per cell,
  a percentage per student, and a class percentage per letter along the bottom so you can see
  which letters to reteach. Tap any student number to jump to that sheet.

**Undo** in the top bar reverses the last toggle (up to 100 deep) for when a tap lands on the
wrong row.

## Serving it locally

Any static web server works — the app is plain HTML, CSS, and JavaScript with no build step.

```bash
cd ...\LetterAssessment
python -m http.server 8000
```

Then open <http://localhost:8000>. A server is required (not `file://`) because service workers
and the manifest only load over `http://localhost` or HTTPS.

To use it on a classroom tablet, host the folder anywhere static and open it once on the device.

## Installing on a device

- **iPad / iPhone** — open in Safari or Chrome, Share → *Add to Home Screen*.
- **Android / Chromebook / desktop Chrome or Edge** — open the app, then use the install icon in
  the address bar, or the **Install app on this device** button that appears under *Manage*.

Once installed it launches full screen and works with no network at all.

## Student data is tracked by number

The roster is a list of numbers — **Student 1**, **Student 2**, and so on — and the app never
asks for or stores a name. Under *Manage* you add slots one at a time, or **Fill roster** to
seed 20 at once for a typical class. Each slot's number is editable, so it can match the
numbering already in your own gradebook, and removing a student frees that number for the next
one added.

Keep the number-to-child key wherever you already keep your roster. That way an exported CSV, a
JSON backup, or a lost tablet carries no identifying information about any child.

## Data

Everything is stored in the browser's `localStorage` on that one device. Nothing is uploaded,
and there are no accounts. Exports and backups contain student numbers only.

- **Download CSV** — one row per student number, three columns per letter (1/0), plus per-category and
  overall totals. Saved to the device's downloads folder, UTF-8 with a BOM so Excel opens it
  cleanly.
- **Copy for spreadsheet** — the same table, tab-separated, straight onto the clipboard. Paste
  into an open Excel or Sheets tab and it lands in columns.
- **Download backup / Restore backup** — a JSON file with the full roster and every mark. Use
  this to move a class to a new device, or to snapshot a term before clearing.
- **Share CSV / Share backup** — appears only on devices that can genuinely share a file
  (iPad, phone), for AirDrop or Mail. On desktop the buttons stay hidden, because the OS share
  sheet there is a dead end — its Copy does not carry file contents and it offers no
  "save to this device".
- **Clear all marks** — keeps the roster, erases the checks. Handy at the start of a new
  assessment window; export a backup first if you want the history.

Because storage is per-device and per-browser, clearing site data or "reset this iPad" wipes it.
Export a backup at the end of each assessment round.

## Files

```
index.html              markup for the three views and the manage sheet
styles.css              all styling; light and dark themes follow the device
app.js                  state, rendering, storage, import/export
sw.js                   service worker; caches the app shell for offline use
manifest.webmanifest    PWA metadata
icons/                  app icons (SVG source + generated PNGs)
```
