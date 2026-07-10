# Euclid's Elements Dependency Visualizer

An interactive dark-mode web application visualizing the logical dependencies between definitions, postulates, common notions, and propositions across all 13 books of Euclid's Elements. It is based on Heiberg's standard Greek edition and Prof. Richard Fitzpatrick's modern English translation.

➜ **Live Local Link (during development):** `http://localhost:5174/`

---

## 🚀 Key Features

* **Interactive Dependency Graph (Vis.js Network)**:
  * Node colors indicate types: **Definitions** (purple), **Postulates** (blue), **Common Notions** (pink), **Theorems** (cyan/green), and **Problems** (yellow).
  * Hovering shows clean statements without raw LaTeX/HTML tags.
  * Clicking any node highlights its foundations (red borders) and what depends on it (green borders), fading everything else.
  * Physics layout (spring force) can be toggled on/off to make the graph static and highly responsive.
* **Hybrid Data Architecture**:
  * Carries out instantaneous rendering by parsing a lightweight relationship index first, deferring detailed proofs until requested.
* **Bilingual Display (Greek & English)**:
  * Real-time transliteration from LaTeX LGR ASCII encoding to standard Unicode politonic Greek.
  * Fuses side-by-side views of both the original Greek statement/proof and Fitzpatrick's translation.
* **Mathematical Formula Rendering**:
  * Integrates **KaTeX** for rendering LaTeX geometric symbols and mathematical formulas (e.g. $AB$, $CA^2$) dynamically with zero lag.
* **Robust Navigation & Filters**:
  * Real-time search by text or ID.
  * Sidebar navigation index grouped by books and categories.
  * One-click navigation: clicking on badges inside details centers the camera on the target node instantly.

---

## 🛠️ Technical Architecture

To scale the project to all 13 books while maintaining optimal performance, the data is split:

```
[ LaTeX Source (.tex) ] 
       │
       ▼ (parse_elements.py)
 ┌─────┴───────────────────────────────────────────────────────┐
 │                                                             │
 ▼ (Lightweight Index)                                         ▼ (Heavy Content JSONs)
webpage/elements_index.json                                   webpage/content_book_[1-13].json
(Ids, titles, type, dependencies)                             (Original Greek, English proof texts)
(~260 KB)                                                     (Lazy loaded on demand & cached)
 │                                                             │
 └───────────────────────┬─────────────────────────────────────┘
                         ▼
             [ webpage/app.js (Vis.js Graph) ]
```

* **Index File (`webpage/elements_index.json`)**: Contains only the IDs, types, numbers, and dependency maps of all 593 elements. Weighs just ~260 KB and is downloaded instantly on page load.
* **Content Files (`webpage/content_book_X.json`)**: 13 separate JSON files containing the actual Greek/English statements and proofs of each book. Loaded asynchronously (lazy load) when the user clicks on a node from that book, then cached in memory.

---

## 📁 File Structure

```
├── Book01/ to Book13/     # Original LaTeX books source files
├── scripts/
│   └── parse_elements.py  # Python parser converting LaTeX files to JSON database
└── webpage/
    ├── index.html         # Main page layout (dark mode glassmorphism)
    ├── style.css          # Modern typography, CSS tokens, and layout styles
    ├── app.js             # Core JS orchestrating Vis.js, KaTeX, and Lazy Loading
    ├── package.json       # Development configuration (Vite dev server)
    ├── elements_index.json# Global elements relationship metadata
    └── content_book_*.json# Individual book content files
```

---

## 💻 How to Run Locally

### 1. Generate the JSON database (Optional)
If you modify the LaTeX files or the parser, you can regenerate the database:
```bash
python3 scripts/parse_elements.py
```

### 2. Start the Web Server
Navigate to the `webpage` folder, install dependencies, and start the local server:
```bash
cd webpage
npm install
npm run dev
```
Open the provided URL (e.g., `http://localhost:5174/`) in your browser.
