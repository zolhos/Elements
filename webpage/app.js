// LGR to Greek Unicode Transliteration dictionary
const lgrMap = {
    'a': 'α', 'b': 'β', 'g': 'γ', 'd': 'δ', 'e': 'ε', 'z': 'ζ',
    'h': 'η', 'j': 'θ', 'i': 'ι', 'k': 'κ', 'l': 'λ', 'm': 'μ',
    'n': 'ν', 'x': 'ξ', 'o': 'ο', 'p': 'π', 'r': 'ρ',
    's': 'σ', 'c': 'ς', 't': 'τ', 'u': 'υ', 'f': 'φ', 'q': 'χ',
    'y': 'ψ', 'w': 'ω',
    'A': 'Α', 'B': 'Β', 'G': 'Γ', 'D': 'Δ', 'E': 'Ε', 'Z': 'Ζ',
    'H': 'Η', 'J': 'Θ', 'I': 'Ι', 'K': 'Κ', 'L': 'Λ', 'M': 'Μ',
    'N': 'Ν', 'X': 'Ξ', 'O': 'Ο', 'P': 'Π', 'R': 'Ρ',
    'S': 'Σ', 'T': 'Τ', 'U': 'Υ', 'F': 'Φ', 'Q': 'Χ', 'Y': 'Ψ', 'W': 'Ω'
};

function transliterateLGR(text) {
    if (!text) return "";
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (lgrMap[char] !== undefined) {
            result += lgrMap[char];
        } else if (['>', '<', "'", '`', '~', '|', '^'].includes(char)) {
            // Keep iota subscript as combining character
            if (char === '|') {
                result += '\u0345';
            }
        } else {
            result += char;
        }
    }
    return result;
}

// State
let booksData = [];
let elementsMap = new Map(); // id -> element object
let dependentsMap = new Map(); // id -> set of element ids that depend on it
let loadedBooksCache = new Map(); // bookId -> bookContent object
let network = null;
let nodesDataset = null;
let edgesDataset = null;
let selectedElementId = null;

// DOM Elements
const searchInput = document.getElementById('search-input');
const filterBook = document.getElementById('filter-book');
const filterType = document.getElementById('filter-type');
const navTree = document.getElementById('nav-tree');
const detailPanel = document.getElementById('detail-panel');
const detailPlaceholder = document.getElementById('detail-placeholder');
const detailContent = document.getElementById('detail-content');
const closeDetailBtn = document.getElementById('close-detail-btn');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statDef = document.getElementById('stat-def');
const statPost = document.getElementById('stat-post');
const statCn = document.getElementById('stat-cn');
const statTheorem = document.getElementById('stat-theorem');
const statProblem = document.getElementById('stat-problem');

// Controls
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnFit = document.getElementById('btn-fit');
const btnPhysics = document.getElementById('btn-physics');

// Fetch and initialize
async function init() {
    try {
        const response = await fetch('elements_index.json');
        booksData = await response.json();
        
        buildDataStructures();
        updateStatistics();
        renderNavTree();
        initializeNetworkGraph();
        setupEventListeners();
        
        // Render math in the document once loaded
        if (window.renderMathInElement) {
            window.renderMathInElement(document.body, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        }
    } catch (error) {
        console.error("Error loading elements data:", error);
        navTree.innerHTML = `<div class="loading-placeholder" style="color:#ff6b6b">Failed to load data from JSON file.</div>`;
    }
}

// Build Maps for O(1) lookups and dependencies tracing
function buildDataStructures() {
    elementsMap.clear();
    dependentsMap.clear();
    
    booksData.forEach(book => {
        // Collect Definitions
        book.definitions.forEach(item => {
            item.bookId = book.id;
            item.type = 'definition';
            item.title = `Definition ${item.number}`;
            elementsMap.set(item.id, item);
        });
        
        // Collect Postulates
        book.postulates.forEach(item => {
            item.bookId = book.id;
            item.type = 'postulate';
            item.title = `Postulate ${item.number}`;
            elementsMap.set(item.id, item);
        });
        
        // Collect Common Notions
        book.common_notions.forEach(item => {
            item.bookId = book.id;
            item.type = 'common_notion';
            item.title = `Common Notion ${item.number}`;
            elementsMap.set(item.id, item);
        });
        
        // Collect Propositions
        book.propositions.forEach(item => {
            item.bookId = book.id;
            elementsMap.set(item.id, item);
        });
    });
    
    // Build dependents map (who uses this element)
    elementsMap.forEach((item, id) => {
        if (item.dependencies && item.dependencies.length > 0) {
            item.dependencies.forEach(depId => {
                if (!dependentsMap.has(depId)) {
                    dependentsMap.set(depId, new Set());
                }
                dependentsMap.get(depId).add(id);
            });
        }
    });
}

function updateStatistics() {
    let total = elementsMap.size;
    let defs = 0, posts = 0, cns = 0, theorems = 0, problems = 0;
    
    elementsMap.forEach(item => {
        if (item.type === 'definition') defs++;
        else if (item.type === 'postulate') posts++;
        else if (item.type === 'common_notion') cns++;
        else if (item.type === 'theorem') theorems++;
        else if (item.type === 'problem') problems++;
    });
    
    statTotal.textContent = total;
    statDef.textContent = defs;
    statPost.textContent = posts;
    statCn.textContent = cns;
    statTheorem.textContent = theorems;
    statProblem.textContent = problems;
}

// Sidebar Render
function renderNavTree(searchQuery = '', bookFilter = 'all', typeFilter = 'all') {
    navTree.innerHTML = '';
    
    const query = searchQuery.toLowerCase().trim();
    
    booksData.forEach(book => {
        // Apply book filter
        if (bookFilter !== 'all' && book.id.toString() !== bookFilter) return;
        
        // Group elements by category
        const groups = {
            definitions: book.definitions || [],
            postulates: book.postulates || [],
            common_notions: book.common_notions || [],
            propositions: book.propositions || []
        };
        
        let hasVisibleElements = false;
        const bookNode = document.createElement('div');
        bookNode.className = 'book-node';
        
        const header = document.createElement('div');
        header.className = 'book-node-header';
        header.innerHTML = `<span>Book ${book.id}</span> <span class="arrow">▼</span>`;
        bookNode.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'book-node-content';
        
        // Definitions section
        if (typeFilter === 'all' || typeFilter === 'definition') {
            const filtered = groups.definitions.filter(item => matchSearch(item, query));
            if (filtered.length > 0) {
                hasVisibleElements = true;
                const sect = document.createElement('div');
                sect.className = 'section-title';
                sect.textContent = 'Definitions';
                content.appendChild(sect);
                
                filtered.forEach(item => {
                    content.appendChild(createItemLink(item));
                });
            }
        }
        
        // Postulates section (Only in Book 1)
        if (book.id === 1 && (typeFilter === 'all' || typeFilter === 'postulate')) {
            const filtered = groups.postulates.filter(item => matchSearch(item, query));
            if (filtered.length > 0) {
                hasVisibleElements = true;
                const sect = document.createElement('div');
                sect.className = 'section-title';
                sect.textContent = 'Postulates';
                content.appendChild(sect);
                
                filtered.forEach(item => {
                    content.appendChild(createItemLink(item));
                });
            }
        }
        
        // Common Notions section (Only in Book 1)
        if (book.id === 1 && (typeFilter === 'all' || typeFilter === 'common_notion')) {
            const filtered = groups.common_notions.filter(item => matchSearch(item, query));
            if (filtered.length > 0) {
                hasVisibleElements = true;
                const sect = document.createElement('div');
                sect.className = 'section-title';
                sect.textContent = 'Common Notions';
                content.appendChild(sect);
                
                filtered.forEach(item => {
                    content.appendChild(createItemLink(item));
                });
            }
        }
        
        // Propositions section (Theorems / Problems)
        const propsFiltered = groups.propositions.filter(item => {
            if (typeFilter !== 'all' && item.type !== typeFilter) return false;
            return matchSearch(item, query);
        });
        
        if (propsFiltered.length > 0) {
            hasVisibleElements = true;
            const sect = document.createElement('div');
            sect.className = 'section-title';
            sect.textContent = 'Propositions';
            content.appendChild(sect);
            
            propsFiltered.forEach(item => {
                content.appendChild(createItemLink(item));
            });
        }
        
        bookNode.appendChild(content);
        
        // Collapse toggle
        header.addEventListener('click', () => {
            content.classList.toggle('collapsed');
            header.querySelector('.arrow').textContent = content.classList.contains('collapsed') ? '►' : '▼';
        });
        
        if (hasVisibleElements) {
            navTree.appendChild(bookNode);
        }
    });
    
    if (navTree.children.length === 0) {
        navTree.innerHTML = `<div class="loading-placeholder">No elements found.</div>`;
    }
}

function matchSearch(item, query) {
    if (!query) return true;
    const numStr = item.number.toString();
    const idStr = item.id.toLowerCase();
    
    if (idStr.includes(query) || numStr.includes(query)) return true;
    
    if (item.english && item.english.toLowerCase().includes(query)) return true;
    if (item.greek && item.greek.toLowerCase().includes(query)) return true;
    
    if (item.english_statement && item.english_statement.toLowerCase().includes(query)) return true;
    if (item.english_proof && item.english_proof.toLowerCase().includes(query)) return true;
    
    return false;
}

function createItemLink(item) {
    const link = document.createElement('div');
    link.className = `item-link type-${item.type}`;
    if (item.id === selectedElementId) {
        link.classList.add('selected');
    }
    link.dataset.id = item.id;
    
    let displayTitle = "";
    if (item.type === 'definition') displayTitle = `Def. ${item.number}`;
    else if (item.type === 'postulate') displayTitle = `Post. ${item.number}`;
    else if (item.type === 'common_notion') displayTitle = `C.N. ${item.number}`;
    else displayTitle = `Prop. ${item.bookId}.${item.number}`;
    
    let textDesc = item.english_statement || item.english || "";
    if (textDesc.length > 50) textDesc = textDesc.substring(0, 47) + "...";
    
    link.innerHTML = `<span class="item-link-num">${displayTitle}</span><span class="item-link-title">${textDesc}</span>`;
    
    link.addEventListener('click', () => {
        selectElement(item.id);
    });
    
    return link;
}

// Network Graph Setup
function initializeNetworkGraph() {
    const nodes = [];
    const edges = [];
    
    elementsMap.forEach((item, id) => {
        let label = "";
        let color = "";
        let shape = "dot";
        let size = 15;
        
        if (item.type === 'definition') {
            label = `D ${item.bookId}.${item.number}`;
            color = '#4a90e2';
            size = 10;
        } else if (item.type === 'postulate') {
            label = `P ${item.number}`;
            color = '#a275e3';
            size = 12;
        } else if (item.type === 'common_notion') {
            label = `CN ${item.number}`;
            color = '#e05e8b';
            size = 12;
        } else {
            label = `Prop ${item.bookId}.${item.number}`;
            color = item.type === 'theorem' ? '#2ecc71' : '#f39c12';
            size = 18;
            shape = "dot";
        }
        
        let desc = item.english_statement || item.english || "";
        if (desc.length > 100) desc = desc.substring(0, 97) + "...";
        
        nodes.push({
            id: id,
            label: label,
            title: `${item.title || ('Proposition ' + item.bookId + '.' + item.number)}\n${desc}`,
            color: {
                background: color,
                border: '#ffffff',
                highlight: {
                    background: '#ffffff',
                    border: color
                }
            },
            font: {
                color: '#f0f0f5',
                size: 11,
                face: 'Inter'
            },
            shape: shape,
            size: size,
            borderWidth: 1.5,
            shadow: true
        });
        
        // Edges
        if (item.dependencies) {
            item.dependencies.forEach(depId => {
                // Ensure dependency node exists
                if (elementsMap.has(depId)) {
                    edges.push({
                        from: depId,
                        to: id,
                        arrows: 'to',
                        color: {
                            color: 'rgba(255, 255, 255, 0.12)',
                            highlight: '#ffffff',
                            hover: '#ffffff'
                        },
                        width: 1,
                        smooth: {
                            type: 'cubicBezier',
                            roundness: 0.2
                        }
                    });
                }
            });
        }
    });
    
    nodesDataset = new vis.DataSet(nodes);
    edgesDataset = new vis.DataSet(edges);
    
    const container = document.getElementById('network-graph');
    const data = {
        nodes: nodesDataset,
        edges: edgesDataset
    };
    
    const options = {
        nodes: {
            scaling: {
                min: 8,
                max: 30
            }
        },
        edges: {
            arrows: {
                to: { enabled: true, scaleFactor: 0.5 }
            }
        },
        physics: {
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                gravitationalConstant: -26,
                centralGravity: 0.015,
                springLength: 90,
                springConstant: 0.08
            },
            stabilization: {
                iterations: 150,
                updateInterval: 25
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200
        }
    };
    
    network = new vis.Network(container, data, options);
    
    // Click Node behavior
    network.on("click", function(params) {
        if (params.nodes.length > 0) {
            const id = params.nodes[0];
            selectElement(id, false); // select node (do not reposition camera on itself immediately unless requested)
        } else {
            // Click outside resets highlights
            resetGraphHighlight();
        }
    });
    
    // After stabilization, we can turn off physics to allow smooth user interaction
    network.on("stabilizationIterationsDone", function () {
        network.setOptions({ physics: { enabled: true } });
    });
}

function focusNode(nodeId) {
    if (network && nodeId) {
        network.focus(nodeId, {
            scale: 1.1,
            animation: {
                duration: 800,
                easingFunction: "easeInOutQuad"
            }
        });
        highlightNodeInGraph(nodeId);
    }
}

function highlightNodeInGraph(selectedId) {
    const allNodes = nodesDataset.get({ returnType: "Object" });
    const allEdges = edgesDataset.get();
    
    // Get dependencies and dependents
    const item = elementsMap.get(selectedId);
    const dependencies = new Set(item.dependencies || []);
    const dependents = dependentsMap.get(selectedId) || new Set();
    
    // Highlight colors
    elementsMap.forEach((node, id) => {
        let opacity = 0.15;
        let fontColor = 'rgba(240, 240, 245, 0.15)';
        
        if (id === selectedId) {
            opacity = 1.0;
            fontColor = '#ffffff';
        } else if (dependencies.has(id) || dependents.has(id)) {
            opacity = 0.85;
            fontColor = '#f0f0f5';
        }
        
        nodesDataset.update({
            id: id,
            color: {
                background: allNodes[id].color.background,
                border: id === selectedId ? '#ffffff' : 'rgba(255,255,255,0.4)',
                opacity: opacity
            },
            font: { color: fontColor }
        });
    });
    
    // Update edge colors
    const updatedEdges = allEdges.map(edge => {
        let color = 'rgba(255, 255, 255, 0.05)';
        let width = 1;
        
        if (edge.to === selectedId && dependencies.has(edge.from)) {
            // Foundations pointing TO selected
            color = '#4a90e2';
            width = 2.5;
        } else if (edge.from === selectedId && dependents.has(edge.to)) {
            // Dependents pointing FROM selected
            color = '#2ecc71';
            width = 2.5;
        }
        
        return {
            id: edge.id,
            color: { color: color },
            width: width
        };
    });
    edgesDataset.update(updatedEdges);
}

function resetGraphHighlight() {
    const allNodes = nodesDataset.get({ returnType: "Object" });
    const allEdges = edgesDataset.get();
    
    // Restore default opacities
    elementsMap.forEach((node, id) => {
        nodesDataset.update({
            id: id,
            color: {
                border: '#ffffff'
            },
            font: { color: '#f0f0f5' }
        });
    });
    
    const updatedEdges = allEdges.map(edge => {
        return {
            id: edge.id,
            color: { color: 'rgba(255, 255, 255, 0.12)' },
            width: 1
        };
    });
    edgesDataset.update(updatedEdges);
}

// Helper for lazy loading book content text
async function getBookContent(bookId) {
    if (loadedBooksCache.has(bookId)) {
        return loadedBooksCache.get(bookId);
    }
    try {
        const response = await fetch(`content_book_${bookId}.json`);
        const content = await response.json();
        loadedBooksCache.set(bookId, content);
        return content;
    } catch (err) {
        console.error(`Error loading content for Book ${bookId}:`, err);
        return null;
    }
}

// Select Element Action
async function selectElement(id, centerCamera = true) {
    selectedElementId = id;
    const item = elementsMap.get(id);
    if (!item) return;
    
    // Highlight list item in tree
    document.querySelectorAll('.item-link').forEach(el => el.classList.remove('selected'));
    const linkEl = document.querySelector(`.item-link[data-id="${id}"]`);
    if (linkEl) {
        linkEl.classList.add('selected');
        linkEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    
    // Show details panel
    detailPlaceholder.classList.add('hidden');
    detailContent.classList.remove('hidden');
    detailPanel.classList.remove('hidden');
    
    // Setup Header badge / title
    const badgeEl = document.getElementById('detail-badge');
    const titleEl = document.getElementById('detail-title');
    const typeEl = document.getElementById('detail-type');
    
    // Set Panel Type Styles
    detailContent.className = 'detail-content'; // reset
    detailContent.classList.add(`type-${item.type}`);
    
    let displayBadge = "";
    let displayType = "";
    
    if (item.type === 'definition') {
        displayBadge = `Definition ${item.bookId}.${item.number}`;
        displayType = `Definition (Book ${item.bookId})`;
        titleEl.textContent = item.english.length > 60 ? item.english.substring(0, 57) + "..." : item.english;
    } else if (item.type === 'postulate') {
        displayBadge = `Postulate ${item.number}`;
        displayType = "Geometric Postulate";
        titleEl.textContent = item.english.length > 60 ? item.english.substring(0, 57) + "..." : item.english;
    } else if (item.type === 'common_notion') {
        displayBadge = `Common Notion ${item.number}`;
        displayType = "Common Notion (Axiom)";
        titleEl.textContent = item.english.length > 60 ? item.english.substring(0, 57) + "..." : item.english;
    } else {
        displayBadge = `Proposition ${item.bookId}.${item.number}`;
        displayType = item.type === 'theorem' ? 'Theorem (Proof)' : 'Problem (Construction)';
        titleEl.textContent = item.english_statement;
    }
    
    badgeEl.textContent = displayBadge;
    typeEl.textContent = displayType;
    
    // Load content text from book content JSON if not cached
    const contentData = await getBookContent(item.bookId);
    const textItem = contentData ? contentData[id] : null;
    
    // Set English Content
    const enStatement = textItem ? (textItem.english_statement || textItem.english || "") : (item.english_statement || item.english || "");
    const enProof = textItem ? (textItem.english_proof || "") : "";
    
    document.getElementById('detail-en-statement').innerHTML = formatMath(enStatement);
    const enProofEl = document.getElementById('detail-en-proof');
    if (enProof) {
        document.getElementById('section-en-proof').style.display = 'block';
        enProofEl.innerHTML = formatMath(enProof);
    } else {
        document.getElementById('section-en-proof').style.display = 'none';
    }
    
    // Set Greek Content (Transliterated and parsed into real Greek characters)
    const rawGkStatement = textItem ? (textItem.greek_statement || textItem.greek || "") : "";
    const rawGkProof = textItem ? (textItem.greek_proof || "") : "";
    
    const gkStatementUnicode = transliterateLGR(rawGkStatement);
    const gkProofUnicode = transliterateLGR(rawGkProof);
    
    document.getElementById('detail-gk-statement').innerHTML = gkStatementUnicode;
    const gkProofEl = document.getElementById('detail-gk-proof');
    if (rawGkProof) {
        document.getElementById('section-gk-proof').style.display = 'block';
        gkProofEl.innerHTML = gkProofUnicode;
    } else {
        document.getElementById('section-gk-proof').style.display = 'none';
    }
    
    // Render dependencies list
    const depContainer = document.getElementById('detail-dependencies');
    depContainer.innerHTML = '';
    
    if (item.dependencies && item.dependencies.length > 0) {
        item.dependencies.forEach(depId => {
            const depItem = elementsMap.get(depId);
            if (depItem) {
                const badge = createRelationBadge(depItem, 'badge-foundation');
                depContainer.appendChild(badge);
            }
        });
    } else {
        depContainer.innerHTML = '<span class="no-items">No direct dependencies</span>';
    }
    
    // Render dependents list
    const depdContainer = document.getElementById('detail-dependents');
    depdContainer.innerHTML = '';
    const depsSet = dependentsMap.get(id);
    
    if (depsSet && depsSet.size > 0) {
        depsSet.forEach(depdId => {
            const depdItem = elementsMap.get(depdId);
            if (depdItem) {
                const badge = createRelationBadge(depdItem, 'badge-dependent');
                depdContainer.appendChild(badge);
            }
        });
    } else {
        depdContainer.innerHTML = '<span class="no-items">Not used directly in any proposition</span>';
    }
    
    // Update Math rendering
    if (window.renderMathInElement) {
        window.renderMathInElement(detailPanel, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    }
    
    // Update Graph Highlight
    highlightNodeInGraph(id);
    
    // Reposition camera on node
    if (centerCamera) {
        focusNode(id);
    }
}

function createRelationBadge(item, customClass) {
    const badge = document.createElement('div');
    badge.className = `relation-badge badge-${item.type} ${customClass}`;
    
    let displayTitle = "";
    if (item.type === 'definition') displayTitle = `Def. ${item.bookId}.${item.number}`;
    else if (item.type === 'postulate') displayTitle = `Post. ${item.number}`;
    else if (item.type === 'common_notion') displayTitle = `C.N. ${item.number}`;
    else displayTitle = `Prop. ${item.bookId}.${item.number}`;
    
    badge.textContent = displayTitle;
    badge.title = item.english_statement || item.english || "";
    
    badge.addEventListener('click', () => {
        selectElement(item.id);
    });
    
    return badge;
}

// Clean Fitzpatrick's math expressions for HTML/KaTeX:
// Sometimes formulas inside Fitzpatrick use $A$, $AB$, $[Post.~3]$ inside the formula, or formatting like $^\dag$.
// KaTeX needs standard LaTeX delimiters like $...$.
function formatMath(text) {
    if (!text) return "";
    
    // Fitzpatrick footnotes like $^\dag$ or $^\ddag$ can be replaced with superscript tag
    let formatted = text.replace(/\$^\dag\$/g, '<sup>†</sup>');
    formatted = formatted.replace(/\$^\ddag\$/g, '<sup>‡</sup>');
    
    // Return cleaned text
    return formatted;
}

// Event Listeners
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
        renderNavTree(e.target.value, filterBook.value, filterType.value);
    });
    
    // Filters
    filterBook.addEventListener('change', (e) => {
        renderNavTree(searchInput.value, e.target.value, filterType.value);
    });
    
    filterType.addEventListener('change', (e) => {
        renderNavTree(searchInput.value, filterBook.value, e.target.value);
    });
    
    // Close Details Panel
    closeDetailBtn.addEventListener('click', () => {
        detailPanel.classList.add('hidden');
        resetGraphHighlight();
        selectedElementId = null;
        document.querySelectorAll('.item-link').forEach(el => el.classList.remove('selected'));
    });
    
    // Tabs clicking
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            const paneId = btn.dataset.tab;
            document.getElementById(paneId).classList.add('active');
        });
    });
    
    // Graph Control Overlay
    btnZoomIn.addEventListener('click', () => {
        if (network) {
            const scale = network.getScale();
            network.moveTo({ scale: scale * 1.3 });
        }
    });
    
    btnZoomOut.addEventListener('click', () => {
        if (network) {
            const scale = network.getScale();
            network.moveTo({ scale: scale * 0.7 });
        }
    });
    
    btnFit.addEventListener('click', () => {
        if (network) {
            network.fit({
                animation: {
                    duration: 600,
                    easingFunction: "easeInOutQuad"
                }
            });
        }
    });
    
    btnPhysics.addEventListener('click', () => {
        if (network) {
            const active = btnPhysics.classList.toggle('active');
            network.setOptions({ physics: { enabled: active } });
            btnPhysics.textContent = active ? 'Physics' : 'Static';
        }
    });
}

// Start
window.addEventListener('DOMContentLoaded', init);
