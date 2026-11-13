// Scan page: grocery receipts and bills.
//
// OCR engines:
//  - "tesseract": Tesseract.js runs in the browser. Free, no key, the photo never leaves the device.
//  - "vision":    Google Cloud Vision (DOCUMENT_TEXT_DETECTION). Better on crumpled or faded receipts.
//                 Needs "Cloud Vision API" enabled (and billing on) in the Google Cloud project that
//                 owns this key. This is the same key as the Maps one in fuel.html. The key is visible
//                 to anyone who opens the page, so restrict it to your site and to the APIs you use.
const GOOGLE_VISION_API_KEY = "google api key"; // replace with your key, or leave blank to disable Google Vision

const HISTORY_KEY = "scan.history.v1";
const CATEGORIES = [...ReceiptParser.ITEM_CATEGORIES.map(([name]) => name), "Other"];

const $ = (id) => document.getElementById(id);
const photo = $("photo"), preview = $("preview"), placeholder = $("placeholder");
const engineSelect = $("engine"), scanButton = $("scan");
const groceryForm = $("groceryForm"), billForm = $("billForm"), itemRows = $("itemRows");

let mode = new URLSearchParams(location.search).get("mode") === "bills" ? "bills" : "groceries";
let images = null; // { ocr: canvas, vision: dataURL, thumb: dataURL }

// ---------- helpers ----------
function isoDate(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const monthKey = (d = new Date()) => isoDate(d).slice(0, 7);

// "45.5" -> 4550, parsed from the text so there's no floating-point error
function inputToCents(value) {
    const m = /^\s*(\d+)(?:\.(\d*))?\s*$/.exec(String(value));
    if (!m) return NaN;
    const frac = m[2] || "";
    let cents = parseInt(m[1], 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
    if (frac.length > 2 && frac[2] >= "5") cents += 1;
    return cents;
}
const centsToInput = (cents) => (cents / 100).toFixed(2);

function formatMoney(cents) {
    const abs = Math.abs(Math.round(cents));
    const whole = Math.floor(abs / 100).toLocaleString("en-US");
    const frac = abs % 100;
    return `${cents < 0 ? "-" : ""}Rs ${whole}${frac ? "." + String(frac).padStart(2, "0") : ""}`;
}

const prettyDate = (iso) =>
    iso ? new Date(iso + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "No date";

function loadHistory() {
    try { return JSON.parse(AppStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
}
function saveHistory(list) {
    AppStorage.setItem(HISTORY_KEY, JSON.stringify(list)); // throws if storage is full/blocked
}

// ---------- mode ----------
function setMode(next) {
    mode = next;
    const active = "bg-white shadow dark:bg-neutral-800";
    for (const [btn, m] of [[$("modeGroceries"), "groceries"], [$("modeBills"), "bills"]]) {
        btn.className = `rounded-lg p-2 text-sm font-medium ${m === mode ? active : "text-slate-500 dark:text-neutral-400"}`;
        btn.setAttribute("aria-pressed", m === mode);
    }
    groceryForm.classList.add("hidden");
    billForm.classList.add("hidden");
    $("groceryHistory").classList.toggle("hidden", mode !== "groceries");
    $("billHistory").classList.toggle("hidden", mode !== "bills");
    $("saveStatus").textContent = "";
    history.replaceState(null, "", `?mode=${mode}`);
    renderHistory();
}
$("modeGroceries").addEventListener("click", () => setMode("groceries"));
$("modeBills").addEventListener("click", () => setMode("bills"));

// ---------- engine ----------
if (GOOGLE_VISION_API_KEY) {
    engineSelect.value = "vision"; // default to Google Vision when a key is set
} else {
    const opt = engineSelect.querySelector('option[value="vision"]');
    opt.disabled = true;
    opt.textContent = "Google Vision (add API key in scan.js)";
}

// ---------- photo ----------
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unreadable image")); };
        img.src = url;
    });
}

function drawScaled(img, maxSide, allowUpscale = false) {
    let scale = maxSide / Math.max(img.width, img.height);
    if (!allowUpscale) scale = Math.min(1, scale);
    else scale = Math.min(2, scale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
}

// Greyscale + contrast stretch: makes faint thermal-paper text much easier for Tesseract.
function enhanceForOCR(canvas) {
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
        const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
        px[i] = g;
        hist[g]++;
    }
    // Ignore the darkest/lightest 1% so specks and glare don't set the range
    const total = px.length / 4;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.01) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.01) hi--;
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
        const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
        px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
}

photo.addEventListener("change", async () => {
    const file = photo.files[0];
    if (!file) return;
    $("scanError").textContent = "";
    try {
        const img = await loadImage(file);
        images = {
            file,         // original photo, sent to Google Vision as-is
            img,          // decoded image, used only if the original is too big for Vision
            ocr: enhanceForOCR(drawScaled(img, 2000, true)),
            thumb: drawScaled(img, 500).toDataURL("image/jpeg", 0.6),
        };
        preview.src = drawScaled(img, 1600).toDataURL("image/jpeg", 0.85);
        preview.classList.remove("hidden");
        placeholder.classList.add("hidden");
        scanButton.disabled = false;
    } catch (e) {
        images = null;
        scanButton.disabled = true;
        $("scanError").textContent = "Couldn't read that image. Try a JPG or PNG photo.";
    }
});

// ---------- OCR ----------
function setProgress(fraction, text) {
    $("progress").classList.remove("hidden");
    if (fraction != null) $("progressBar").style.width = Math.round(fraction * 100) + "%";
    $("progressText").textContent = text;
}

let workerPromise = null;
function getTesseractWorker() {
    if (typeof Tesseract === "undefined") throw new Error("Tesseract.js didn't load (are you offline?)");
    if (!workerPromise) {
        workerPromise = Tesseract.createWorker("eng", 1, {
            logger: (m) => {
                if (m.status === "recognizing text") setProgress(m.progress, "Reading text…");
                else setProgress(null, "Loading OCR engine (first time only)…");
            },
        }).then(async (worker) => {
            // PSM 4 = single column of text of variable sizes, which suits receipts
            await worker.setParameters({ tessedit_pageseg_mode: "4", preserve_interword_spaces: "1" });
            return worker;
        });
        workerPromise.catch(() => { workerPromise = null; });
    }
    return workerPromise;
}

async function ocrTesseract() {
    const worker = await getTesseractWorker();
    const { data } = await worker.recognize(images.ocr);
    return data.text;
}

// Google Vision accepts up to ~10 MB of base64 image data per request.
const VISION_MAX_BASE64 = 9.5 * 1024 * 1024;
const VISION_TYPES = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp", "image/tiff", "image/x-icon"];

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Couldn't read the photo file"));
        reader.readAsDataURL(file);
    });
}

// The original photo bytes, untouched. Only if it's too large (or a format
// Vision can't read, like HEIC) is it re-encoded: full resolution first, then
// lower quality, and only shrunk as a last resort.
async function imageForVision() {
    if (VISION_TYPES.includes(images.file.type)) {
        const original = await fileToBase64(images.file);
        if (original.length <= VISION_MAX_BASE64) return { content: original, note: "original quality" };
    }
    for (const [maxSide, quality] of [[Infinity, 0.95], [Infinity, 0.9], [4000, 0.9], [3000, 0.9]]) {
        const canvas = maxSide === Infinity ? drawScaled(images.img, Math.max(images.img.width, images.img.height)) : drawScaled(images.img, maxSide);
        const content = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        if (content.length <= VISION_MAX_BASE64) {
            return { content, note: `re-encoded at ${canvas.width}×${canvas.height}, ${Math.round(quality * 100)}% quality (original too large for Vision)` };
        }
    }
    throw new Error("Photo is too large for Google Vision even after re-encoding.");
}

async function ocrVision() {
    setProgress(0.1, "Preparing photo…");
    const image = await imageForVision();
    console.info(`Google Vision: sending ${(image.content.length * 0.75 / 1024 / 1024).toFixed(1)} MB, ${image.note}`);
    setProgress(0.3, image.note === "original quality" ? "Sending original photo to Google Vision…" : "Sending to Google Vision…");
    const res = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(GOOGLE_VISION_API_KEY)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests: [{
                    image: { content: image.content },
                    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                    imageContext: { languageHints: ["en", "fr"] },
                }],
            }),
        }
    );
    const json = await res.json();
    const err = json.error || json.responses?.[0]?.error;
    if (!res.ok || err) {
        const msg = err?.message || `HTTP ${res.status}`;
        if (/not been used|disabled|SERVICE_DISABLED/i.test(msg)) {
            throw new Error("Cloud Vision API isn't enabled for this key's Google Cloud project. Enable it in Google Cloud Console → APIs & Services, then try again.");
        }
        if (/billing/i.test(msg)) throw new Error("Google Vision needs billing turned on for this Google Cloud project.");
        if (/referer|not authorized|API_KEY_SERVICE_BLOCKED|blocked/i.test(msg)) {
            throw new Error("This API key isn't allowed to use Cloud Vision. In Google Cloud Console → Credentials, add Cloud Vision API to the key's allowed APIs.");
        }
        throw new Error(msg);
    }
    const words = (json.responses[0].textAnnotations || []).slice(1); // [0] is the whole text
    return words.length ? linesFromWords(words) : json.responses[0].fullTextAnnotation?.text || "";
}

// Vision returns receipt columns as separate blocks (all names, then all prices),
// which breaks "name ... price" lines. Rebuild real lines by grouping words that
// sit at the same height on the photo, then reading each row left to right.
function linesFromWords(words) {
    const boxes = words.map((w) => {
        const v = w.boundingPoly.vertices.map((p) => ({ x: p.x || 0, y: p.y || 0 }));
        const xs = v.map((p) => p.x), ys = v.map((p) => p.y);
        const top = Math.min(...ys), bottom = Math.max(...ys);
        return { text: w.description, left: Math.min(...xs), right: Math.max(...xs), cy: (top + bottom) / 2, h: bottom - top };
    });
    const heights = boxes.map((b) => b.h).sort((a, b) => a - b);
    const lineHeight = heights[Math.floor(heights.length / 2)] || 10;

    boxes.sort((a, b) => a.cy - b.cy);
    const rows = [];
    for (const box of boxes) {
        const row = rows[rows.length - 1];
        if (row && Math.abs(box.cy - row.cy) <= lineHeight * 0.6) {
            row.words.push(box);
            row.cy += (box.cy - row.cy) / row.words.length; // running average keeps slight tilt in check
        } else {
            rows.push({ cy: box.cy, words: [box] });
        }
    }

    return rows.map((row) => {
        row.words.sort((a, b) => a.left - b.left);
        let line = "";
        let prev = null;
        for (const w of row.words) {
            // Words almost touching (e.g. "1,207" "." "67") are joined without a space
            const touching = prev && w.left - prev.right < lineHeight * 0.15;
            line += (prev && !touching ? " " : "") + w.text;
            prev = w;
        }
        return line;
    }).join("\n");
}

scanButton.addEventListener("click", async () => {
    if (!images) return;
    scanButton.disabled = true;
    $("scanError").textContent = "";
    $("saveStatus").textContent = "";
    setProgress(0, "Starting…");
    try {
        const text = engineSelect.value === "vision" ? await ocrVision() : await ocrTesseract();
        setProgress(1, "Done");
        $("rawText").textContent = text || "(no text found)";
        $("rawWrap").classList.remove("hidden");
        if (!text.trim()) {
            $("scanError").textContent = "No text found. Retake the photo closer, flatter and in better light.";
            return;
        }
        if (mode === "groceries") fillGroceryForm(ReceiptParser.parseReceipt(text));
        else fillBillForm(ReceiptParser.parseBill(text));
    } catch (e) {
        console.error(e);
        $("scanError").textContent = `Scan failed: ${e.message}`;
    } finally {
        scanButton.disabled = false;
        setTimeout(() => $("progress").classList.add("hidden"), 800);
    }
});

$("manual").addEventListener("click", () => {
    $("rawWrap").classList.add("hidden");
    if (mode === "groceries") fillGroceryForm({ store: "", date: null, items: [], totalCents: null });
    else fillBillForm({ type: "Electricity", provider: "", account: "", amountCents: null, billDate: null, dueDate: null });
});

// ---------- grocery review ----------
function addItemRow(item = { name: "", category: "Other", cents: null }) {
    const tr = document.createElement("tr");
    tr.className = "border-t border-slate-200 dark:border-neutral-800";
    const inputCls = "w-full rounded-md border border-slate-300 bg-white p-1.5 dark:border-neutral-700 dark:bg-neutral-900";

    const name = document.createElement("input");
    name.className = inputCls + " min-w-[8rem]";
    name.value = item.name;
    name.placeholder = "Item";
    name.dataset.field = "name";
    // Re-guess the category when the name is edited, unless the user picked one
    name.addEventListener("change", () => {
        if (!category.dataset.touched) category.value = ReceiptParser.categoriseItem(name.value);
    });

    const category = document.createElement("select");
    category.className = inputCls;
    category.dataset.field = "category";
    for (const c of CATEGORIES) category.add(new Option(c, c, false, c === item.category));
    category.addEventListener("change", () => { category.dataset.touched = "1"; });

    // Qty × unit price = line price. Changing the qty updates the price;
    // changing the price keeps the qty and updates the unit price.
    const qty = document.createElement("input");
    qty.className = inputCls + " w-16 text-right";
    qty.type = "number";
    qty.step = "any";
    qty.min = "0";
    qty.dataset.field = "qty";
    qty.value = item.qty ?? 1;
    qty.setAttribute("aria-label", "Quantity");

    const price = document.createElement("input");
    price.className = inputCls + " w-24 text-right";
    price.type = "number";
    price.step = "0.01";
    price.dataset.field = "price";
    if (item.cents != null) price.value = centsToInput(item.cents);

    let unitCents = item.unitCents ?? (item.cents != null ? Math.round(item.cents / (item.qty || 1)) : null);
    qty.addEventListener("input", () => {
        const q = parseFloat(qty.value);
        if (q > 0 && unitCents != null) price.value = centsToInput(Math.round(q * unitCents));
        updateSum();
    });
    price.addEventListener("input", () => {
        const q = parseFloat(qty.value) || 1;
        const c = inputToCents(price.value);
        if (Number.isFinite(c)) unitCents = Math.round(c / q);
        updateSum();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Remove item");
    del.className = "px-2 text-slate-400 hover:text-red-500";
    del.addEventListener("click", () => { tr.remove(); updateSum(); });

    for (const [el, cls] of [[name, "py-1.5 pr-2"], [qty, "py-1.5 pr-2"], [category, "py-1.5 pr-2"], [price, "py-1.5"], [del, "py-1.5"]]) {
        const td = document.createElement("td");
        td.className = cls;
        td.appendChild(el);
        tr.appendChild(td);
    }
    itemRows.appendChild(tr);
}

function readItems() {
    return [...itemRows.querySelectorAll("tr")]
        .map((tr) => {
            const qty = parseFloat(tr.querySelector('[data-field="qty"]').value);
            const cents = inputToCents(tr.querySelector('[data-field="price"]').value);
            const q = qty > 0 ? qty : 1;
            return {
                name: tr.querySelector('[data-field="name"]').value.trim(),
                qty: q,
                unitCents: Number.isFinite(cents) ? Math.round(cents / q) : null,
                category: tr.querySelector('[data-field="category"]').value,
                cents,
            };
        })
        .filter((it) => it.name && Number.isFinite(it.cents));
}

function updateSum() {
    const sum = readItems().reduce((s, it) => s + it.cents, 0);
    $("itemsSum").textContent = formatMoney(sum);
    const total = inputToCents(groceryForm.elements.total.value);
    const warn = $("sumWarning");
    if (readItems().length && Number.isFinite(total) && total !== sum) {
        const diff = total - sum;
        warn.textContent = `Items are ${formatMoney(Math.abs(diff))} ${diff > 0 ? "less" : "more"} than the total. ` +
            `An item may be missing or misread.`;
    } else {
        warn.textContent = "";
    }
}

function fillGroceryForm(r) {
    billForm.classList.add("hidden");
    groceryForm.reset();
    itemRows.innerHTML = "";
    const f = groceryForm.elements;
    f.store.value = r.store || "";
    f.date.value = r.date || isoDate();
    if (r.totalCents != null) f.total.value = centsToInput(r.totalCents);
    r.items.forEach(addItemRow);
    if (!r.items.length) addItemRow();
    groceryForm.classList.remove("hidden");
    updateSum();
    groceryForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("addItem").addEventListener("click", () => addItemRow());
$("useSum").addEventListener("click", () => {
    const sum = readItems().reduce((s, it) => s + it.cents, 0);
    groceryForm.elements.total.value = centsToInput(sum);
    updateSum();
});
groceryForm.elements.total.addEventListener("input", updateSum);

groceryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = groceryForm.elements;
    const totalCents = inputToCents(f.total.value);
    if (!(totalCents > 0)) return;
    saveRecord({
        kind: "grocery",
        store: f.store.value.trim(),
        date: f.date.value,
        items: readItems(),
        totalCents,
    }, groceryForm, `Saved ${formatMoney(totalCents)} from ${f.store.value.trim()}.`);
});

// ---------- bill review ----------
function fillBillForm(b) {
    groceryForm.classList.add("hidden");
    billForm.reset();
    const f = billForm.elements;
    f.type.value = b.type || "Other";
    f.provider.value = b.provider || "";
    f.account.value = b.account || "";
    if (b.amountCents != null) f.amount.value = centsToInput(b.amountCents);
    f.billDate.value = b.billDate || "";
    f.dueDate.value = b.dueDate || "";
    billForm.classList.remove("hidden");
    billForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

billForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = billForm.elements;
    const amountCents = inputToCents(f.amount.value);
    if (!(amountCents > 0)) return;
    saveRecord({
        kind: "bill",
        type: f.type.value,
        provider: f.provider.value.trim(),
        account: f.account.value.trim(),
        amountCents,
        billDate: f.billDate.value || f.dueDate.value,
        dueDate: f.dueDate.value,
        paid: f.paid.checked,
    }, billForm, `Saved ${f.provider.value.trim()} bill for ${formatMoney(amountCents)}.`);
});

// ---------- saving ----------
function saveRecord(record, form, message) {
    const list = loadHistory();
    const entry = { id: Date.now(), savedAt: new Date().toISOString(), thumb: images?.thumb || null, ...record };
    list.push(entry);
    try {
        saveHistory(list);
    } catch (err) {
        // Storage full: try again without the photo
        entry.thumb = null;
        try {
            saveHistory(list);
            message += " (Photo not kept: browser storage is full.)";
        } catch (err2) {
            $("saveStatus").className = "mt-3 text-sm text-red-500";
            $("saveStatus").textContent = "Couldn't save: browser storage is full or blocked.";
            return;
        }
    }
    form.classList.add("hidden");
    $("rawWrap").classList.add("hidden");
    preview.classList.add("hidden");
    placeholder.classList.remove("hidden");
    photo.value = "";
    images = null;
    scanButton.disabled = true;
    $("saveStatus").className = "mt-3 text-sm text-teal-700 dark:text-teal-400";
    $("saveStatus").textContent = message;
    renderHistory();
}

function updateRecord(id, change) {
    const list = loadHistory();
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) return;
    if (change === null) list.splice(i, 1);
    else Object.assign(list[i], change);
    try { saveHistory(list); } catch (e) { alert("Couldn't save the change: browser storage is blocked."); }
    renderHistory();
}

// ---------- history ----------
function compareText(now, before, label) {
    if (!before) return now ? `Nothing recorded ${label}` : "";
    const pct = Math.round(((now - before) / before) * 100);
    if (pct === 0) return `Same as ${label}`;
    return `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than ${label} (${formatMoney(before)})`;
}

function renderHistory() {
    const list = loadHistory();
    const now = new Date();
    const thisMonth = monthKey(now);
    const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    if (mode === "groceries") renderGroceries(list.filter((r) => r.kind === "grocery"), thisMonth, lastMonth);
    else renderBills(list.filter((r) => r.kind === "bill"), thisMonth, lastMonth);
}

function smallButton(text, onClick, extra = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.className = "rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800 " + extra;
    b.addEventListener("click", onClick);
    return b;
}

function renderGroceries(receipts, thisMonth, lastMonth) {
    const sumFor = (mk) => receipts.filter((r) => r.date.startsWith(mk)).reduce((s, r) => s + r.totalCents, 0);
    const cur = sumFor(thisMonth);
    $("groceryMonth").textContent = formatMoney(cur);
    $("groceryCompare").textContent = compareText(cur, sumFor(lastMonth), "last month");

    const byCat = {};
    for (const r of receipts.filter((r) => r.date.startsWith(thisMonth))) {
        for (const it of r.items) byCat[it.category] = (byCat[it.category] || 0) + it.cents;
    }
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    $("groceryTop").textContent = top ? top[0] : "—";
    $("groceryTopNote").textContent = top ? formatMoney(top[1]) : "Scan a receipt to see this";

    const ul = $("receiptList");
    ul.innerHTML = "";
    $("receiptsEmpty").classList.toggle("hidden", receipts.length > 0);
    const sorted = [...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    for (const r of sorted) {
        const li = document.createElement("li");
        li.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.className = "flex cursor-pointer items-center justify-between gap-3 list-none";
        summary.innerHTML = `<div><p class="t font-medium"></p><p class="s text-xs text-slate-500 dark:text-neutral-400"></p></div><span class="a font-semibold"></span>`;
        summary.querySelector(".t").textContent = r.store || "Receipt";
        summary.querySelector(".s").textContent = `${prettyDate(r.date)} · ${r.items.length} item${r.items.length === 1 ? "" : "s"}`;
        summary.querySelector(".a").textContent = formatMoney(r.totalCents);
        details.appendChild(summary);

        const body = document.createElement("div");
        body.className = "mt-3 flex gap-3";
        if (r.thumb) {
            const img = document.createElement("img");
            img.src = r.thumb;
            img.alt = "Receipt photo";
            img.className = "h-32 w-24 flex-none rounded-lg object-cover";
            body.appendChild(img);
        }
        const items = document.createElement("ul");
        items.className = "flex-1 space-y-1 text-sm";
        for (const it of r.items) {
            const row = document.createElement("li");
            row.className = "flex justify-between gap-2";
            row.innerHTML = `<span><span class="n"></span> <span class="c text-xs text-slate-500 dark:text-neutral-400"></span></span><span class="p tabular-nums"></span>`;
            // Older saved receipts have no qty, so treat them as 1
            row.querySelector(".n").textContent = (it.qty && it.qty !== 1 ? `${it.qty} × ` : "") + it.name;
            row.querySelector(".c").textContent = it.category;
            row.querySelector(".p").textContent = formatMoney(it.cents);
            items.appendChild(row);
        }
        body.appendChild(items);
        details.appendChild(body);

        const actions = document.createElement("div");
        actions.className = "mt-3 flex justify-end";
        actions.appendChild(smallButton("Delete", () => {
            if (confirm("Delete this receipt?")) updateRecord(r.id, null);
        }, "text-red-500"));
        details.appendChild(actions);

        li.appendChild(details);
        ul.appendChild(li);
    }
}

function dueLabel(bill) {
    if (bill.paid) return ["Paid", "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300"];
    if (!bill.dueDate) return ["Unpaid", "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300"];
    const today = new Date(isoDate() + "T00:00");
    const days = Math.round((new Date(bill.dueDate + "T00:00") - today) / 86400000);
    if (days < 0) return [`Overdue by ${-days} day${days === -1 ? "" : "s"}`, "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"];
    if (days === 0) return ["Due today", "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"];
    if (days <= 7) return [`Due in ${days} day${days === 1 ? "" : "s"}`, "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"];
    return [`Due ${prettyDate(bill.dueDate)}`, "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300"];
}

function renderBills(bills, thisMonth, lastMonth) {
    const unpaid = bills.filter((b) => !b.paid);
    $("billsUnpaid").textContent = formatMoney(unpaid.reduce((s, b) => s + b.amountCents, 0));
    const next = unpaid.filter((b) => b.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    $("billsNext").textContent = next ? `Next: ${next.provider || next.type}, ${dueLabel(next)[0].toLowerCase()}` : "Nothing due";

    const sumFor = (mk) => bills.filter((b) => (b.billDate || "").startsWith(mk)).reduce((s, b) => s + b.amountCents, 0);
    const cur = sumFor(thisMonth);
    $("billsMonth").textContent = formatMoney(cur);
    $("billsCompare").textContent = compareText(cur, sumFor(lastMonth), "last month");

    const ul = $("billList");
    ul.innerHTML = "";
    $("billsEmpty").classList.toggle("hidden", bills.length > 0);
    // Unpaid first (soonest due first), then paid (newest first)
    const sorted = [...bills].sort((a, b) =>
        a.paid !== b.paid ? (a.paid ? 1 : -1)
            : a.paid ? (b.billDate || "").localeCompare(a.billDate || "")
                : (a.dueDate || "9").localeCompare(b.dueDate || "9"));
    for (const b of sorted) {
        const [label, labelCls] = dueLabel(b);
        const li = document.createElement("li");
        li.className = "rounded-2xl border border-slate-200 p-4 dark:border-neutral-800";
        li.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="t font-medium"></p>
                <p class="s text-xs text-slate-500 dark:text-neutral-400"></p>
              </div>
              <span class="a font-semibold"></span>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span class="l rounded-full px-2.5 py-1 text-xs font-medium ${labelCls}"></span>
              <span class="ml-auto flex gap-2 actions"></span>
            </div>`;
        li.querySelector(".t").textContent = `${b.provider || b.type}`;
        li.querySelector(".s").textContent =
            [b.type, b.account && `Acc ${b.account}`, b.billDate && `Billed ${prettyDate(b.billDate)}`].filter(Boolean).join(" · ");
        li.querySelector(".a").textContent = formatMoney(b.amountCents);
        li.querySelector(".l").textContent = label;
        const actions = li.querySelector(".actions");
        actions.appendChild(smallButton(b.paid ? "Mark unpaid" : "Mark paid", () => updateRecord(b.id, { paid: !b.paid })));
        actions.appendChild(smallButton("Delete", () => {
            if (confirm("Delete this bill?")) updateRecord(b.id, null);
        }, "text-red-500"));
        ul.appendChild(li);
    }
}

setMode(mode);
