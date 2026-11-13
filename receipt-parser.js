// Turns raw OCR text from a grocery receipt or utility bill into structured data.
// No DOM access, so it runs in the browser and in Node (for testing).
// Money is returned as whole cents (integers) so totals add up exactly.
(function (root) {
    // ---------- known names (Mauritius) ----------
    const STORES = [
        ["Winners", /winner'?s/i],
        ["Intermart", /inter\s?mart/i],
        ["Super U", /\b(?:super|hyper)\s?u\b/i],
        ["Jumbo", /jumbo/i],
        ["Shoprite", /shop\s?rite/i],
        ["Dreamprice", /dream\s?price/i],
        ["London Way", /london\s?(?:way|supermarket)/i],
        ["Spar", /\bspar\b/i],
        ["Monoprix", /monoprix/i],
        ["Kingsavers", /king\s?savers/i],
    ];

    const BILL_PROVIDERS = [
        { type: "Electricity", name: "CEB", re: /\bCEB\b|central\s+electricity/i },
        { type: "Water", name: "CWA", re: /\bCWA\b|central\s+water/i },
        { type: "Internet", name: "my.t (Mauritius Telecom)", re: /\bmy\.t\b|mauritius\s+telecom/i },
        { type: "Mobile", name: "Emtel", re: /\bemtel\b/i },
        { type: "Mobile", name: "MTML / Chili", re: /\bmtml\b|\bchili\b/i },
    ];

    // Item keyword -> grocery category (English + French)
    const ITEM_CATEGORIES = [
        ["Produce", /tomat|onion|oignon|potato|pomme de terre|banan|apple|pomme|carrot|carotte|lemon|citron|garlic|ail\b|ginger|gingembre|veg|legume|fruit|salad|chou|cabbage|pumpkin|giraumon|lalo|brede/i],
        ["Dairy & eggs", /milk|lait|cheese|fromage|yog|yaourt|butter|beurre|cream|creme|egg|oeuf/i],
        ["Meat & fish", /chicken|poulet|beef|boeuf|mutton|mouton|lamb|agneau|pork|porc|fish|poisson|tuna|thon|sardine|sausage|saucisse|ham|jambon|prawn|crevette|meat|viande/i],
        ["Bakery", /bread|pain|baguette|bun|cake|gateau|biscuit|cookie|croissant|farata|roti/i],
        ["Drinks", /water|eau|juice|jus|coca|cola|pepsi|sprite|fanta|soda|beer|biere|phoenix|wine|vin|tea|the\b|coffee|cafe|drink|boisson|rum|rhum/i],
        ["Household", /soap|savon|deterg|lessive|tissue|papier|toilet|shampoo|bleach|javel|dish|vaisselle|cleaner|nettoy|sponge|eponge|bin bag|sac poubelle|diaper|couche/i],
        ["Pantry", /rice|riz|flour|farine|oil|huile|sugar|sucre|dhal|dal\b|lentil|pasta|pate|noodle|nouille|salt|sel\b|sauce|ketchup|can\b|tin\b|conserve|spice|epice|curry|cereal|cereale|oat|avoine|jam|confiture/i],
        ["Snacks", /chips|crisps|chocolate|chocolat|candy|bonbon|snack|nut|cacahuete/i],
    ];

    const MONTHS = {
        jan: 1, janv: 1, feb: 2, fev: 2, fevr: 2, mar: 3, mars: 3, apr: 4, avr: 4, may: 5, mai: 5,
        jun: 6, juin: 6, jul: 7, juil: 7, aug: 8, aou: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    };

    // ---------- amounts ----------
    // Matches 45.00, 1,234.50, 12,50 (French decimal comma), with optional Rs/MUR.
    const AMOUNT_RE = /(?:rs\.?|mur)?\s*(-)?(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})(?!\d)/gi;

    function amountsIn(line) {
        const out = [];
        for (const m of line.matchAll(AMOUNT_RE)) {
            const whole = parseInt(m[2].replace(/,/g, ""), 10);
            const cents = whole * 100 + parseInt(m[3], 10);
            out.push({ cents: m[1] ? -cents : cents, index: m.index, text: m[0] });
        }
        return out;
    }
    const lastAmount = (line) => amountsIn(line).pop();

    // Price at the very end of a line, allowing a trailing VAT code like "A", "*", "T1" or "TX1"
    const TRAILING_PRICE_RE = /(-)?(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})\s*(?:[A-Z]{1,2}\d?|\*)?\s*$/i;

    // ---------- dates ----------
    function makeISO(y, m, d) {
        if (y < 100) y += 2000;
        const date = new Date(y, m - 1, d);
        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
        if (y < 2000 || y > 2100) return null;
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    function stripAccents(s) {
        return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    }

    // Returns every date found in a line as ISO strings. Mauritius writes dates day-first.
    function datesIn(line) {
        const out = [];
        for (const m of line.matchAll(/\b(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/g)) {
            const iso = makeISO(+m[1], +m[2], +m[3]);
            if (iso) out.push(iso);
        }
        for (const m of line.matchAll(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g)) {
            let d = +m[1], mo = +m[2];
            if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // clearly month-first
            const iso = makeISO(+m[3], mo, d);
            if (iso) out.push(iso);
        }
        for (const m of stripAccents(line).matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]*([A-Za-z]{3,9})\.?[\s\-,]*(\d{2,4})\b/g)) {
            const mo = MONTHS[m[2].toLowerCase()] || MONTHS[m[2].toLowerCase().slice(0, 3)];
            if (!mo) continue;
            const iso = makeISO(+m[3], mo, +m[1]);
            if (iso) out.push(iso);
        }
        return out;
    }

    const splitLines = (text) =>
        text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

    // ---------- totals ----------
    // "total" as OCR often misreads it: T0TAL, TOTA1, TOTAI
    const T = "t[o0]ta[l1i]";
    const TOTAL_RE = new RegExp(String.raw`\b(?:grand\s+${T}|${T}\s+ttc|${T}\s+due|${T}\s+(?:a|à)\s+payer|net\s+(?:${T}|(?:a|à)\s+payer)|amount\s+due|${T})\b`, "i");
    const SUBTOTAL_RE = new RegExp(String.raw`sub\s*-?\s*${T}`, "i");
    const NOT_TOTAL_RE = new RegExp(String.raw`sub\s*-?\s*${T}|${T}\s+(?:items?|qty|quantity|articles?|vat|tva|tax|discount|savings?|points?)|\bvat\b|\btva\b|\btax\b`, "i");
    const PAYMENT_RE = /\bcash\b|tender|\bchange\b|rendu|monnaie|esp[eè]ces|\bcard\b|\bcarte\b|\bvisa\b|mastercard|my\.t money|\bblink\b|\bpaid\b|\bpay[eé]\b/i;

    // Find the receipt total. Returns { cents, lineIndex } or null.
    function findTotal(lines) {
        let best = null;
        lines.forEach((line, i) => {
            if (!TOTAL_RE.test(line) || NOT_TOTAL_RE.test(line)) return;
            let amt = lastAmount(line);
            if (!amt && lines[i + 1]) amt = lastAmount(lines[i + 1]); // amount on the next line
            if (!amt) return;
            const strong = /grand\s+total|ttc|net|due|payer/i.test(line);
            const score = (strong ? 1e12 : 0) + amt.cents;
            if (!best || score > best.score) best = { cents: amt.cents, lineIndex: i, score };
        });
        return best && { cents: best.cents, lineIndex: best.lineIndex };
    }

    // When the "TOTAL" label can't be read: the total is printed several times
    // (subtotal, total, card/cash payment), so take the largest amount that repeats.
    function repeatedTotal(lines) {
        const seen = new Map(); // cents -> first line index
        const counts = new Map();
        lines.forEach((line, i) => {
            if (/\bchange\b|rendu|monnaie|tender/i.test(line)) return;
            for (const a of amountsIn(line)) {
                if (a.cents <= 0) continue;
                counts.set(a.cents, (counts.get(a.cents) || 0) + 1);
                if (!seen.has(a.cents)) seen.set(a.cents, i);
            }
        });
        const repeated = [...counts].filter(([, n]) => n >= 2).map(([c]) => c);
        if (!repeated.length) return null;
        const cents = Math.max(...repeated);
        return { cents, lineIndex: seen.get(cents) };
    }

    // ---------- grocery receipt ----------
    const NON_ITEM_RE = /t[o0]ta[l1i]|\bvat\b|\btva\b|\btax\b|discount|remise|rounding|arrondi|balance|\bqty\b|items?\s*:|\btel\b|phone|\bbrn\b|receipt|invoice|facture|thank|merci|cashier|caissier|till|\bpos\b/i;

    function categoriseItem(name) {
        const plain = stripAccents(name);
        for (const [category, re] of ITEM_CATEGORIES) if (re.test(plain)) return category;
        return "Other";
    }

    // "@" as OCR often misreads it
    const AT = "[@©®]";
    // Explicit quantity in front of a unit price: "3 @", "3@", "2 x", "1.5 *", and OCR'd "3©"
    const QTY_RE = new RegExp(String.raw`(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:${AT}|x|\*)(?=\s|\d|rs|$)`, "i");
    // Leftovers of a garbled quantity at the end of a name: "ea", "e@", "3@", "@", "x", "3e"
    const QTY_JUNK_RE = new RegExp(String.raw`^(?:\d+(?:[.,]\d+)?\s*)?(?:${AT}|x|\*|ea|e${AT}?|a${AT})$|^\d+[ea]$`, "i");

    function cleanItemName(raw) {
        let name = raw
            .replace(AMOUNT_RE, " ")                          // other prices on the line (unit price)
            .replace(/\b\d{6,}\b/g, " ")                      // barcodes / product codes
            .replace(new RegExp(String.raw`\b\d+(?:[.,]\d+)?\s*(?:${AT}|x|\*)(?=\s|$)`, "gi"), " ") // "2 x", "3@"
            .replace(/\b(?:rs|mur)\.?(?=\s|$)/gi, " ")         // stray currency ("Rs" before a price)
            .replace(/[|_~=]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        // Drop trailing quantity junk left by OCR ("FARINE 1KG ea")
        let words = name.split(" ");
        while (words.length > 1 && QTY_JUNK_RE.test(words[words.length - 1])) words.pop();
        if (words.length === 1 && QTY_JUNK_RE.test(words[0])) words = [];
        return words.join(" ");
    }

    // Quantity for an item line. Most reliable: line total ÷ unit price when both
    // are printed, since that works even when OCR mangles "3@" into "ea".
    // Also handles weighed items (0.456 kg). Falls back to an explicit "3 @"/"2 x", then 1.
    function quantityFor(line, priceIndex, lineCents) {
        const before = line.slice(0, priceIndex);
        const unit = amountsIn(before).pop();
        if (unit && unit.cents > 0 && lineCents > 0) {
            const q = lineCents / unit.cents;
            const whole = Math.round(q);
            if (whole >= 1 && Math.abs(whole * unit.cents - lineCents) <= 1) return { qty: whole, unitCents: unit.cents };
            const weight = Math.round(q * 1000) / 1000;
            if (weight > 0 && Math.abs(Math.round(weight * unit.cents) - lineCents) <= 1) return { qty: weight, unitCents: unit.cents };
        }
        const m = QTY_RE.exec(before);
        if (m) {
            const qty = parseFloat(m[1].replace(",", "."));
            if (qty > 0 && qty < 1000) return { qty, unitCents: Math.round(lineCents / qty) };
        }
        return { qty: 1, unitCents: lineCents };
    }

    function detectStore(lines) {
        const head = lines.slice(0, 10).join("\n");
        for (const [name, re] of STORES) if (re.test(head)) return name;
        // Fall back to the first line that looks like a name
        const first = lines.slice(0, 5).find((l) => /[A-Za-z]{3,}/.test(l) && !datesIn(l).length && !/\d{5,}/.test(l));
        return first ? first.replace(/[^A-Za-z0-9&' .\-]/g, "").trim() : "";
    }

    function parseReceipt(text) {
        const lines = splitLines(text);
        const total = findTotal(lines) || repeatedTotal(lines);
        // Items are listed before the subtotal/total block
        const subIndex = lines.findIndex((l) => SUBTOTAL_RE.test(l));
        const stopAt = Math.min(
            total ? total.lineIndex : lines.length,
            subIndex >= 0 ? subIndex : lines.length
        );

        const items = [];
        const hasName = (s) => (s.match(/[A-Za-zÀ-ÿ]/g) || []).length >= 2;
        let pendingName = ""; // a name line with no price, e.g. when "3 @ 46.50  139.50" is on the line below
        for (let i = 0; i < stopAt; i++) {
            const line = lines[i];
            if (NON_ITEM_RE.test(line) || PAYMENT_RE.test(line)) { pendingName = ""; continue; }
            const m = TRAILING_PRICE_RE.exec(line);
            if (!m) {
                const candidate = cleanItemName(line);
                pendingName = hasName(candidate) && !datesIn(line).length ? candidate : "";
                continue;
            }
            const cents = (parseInt(m[2].replace(/,/g, ""), 10) * 100 + parseInt(m[3], 10)) * (m[1] ? -1 : 1);
            let name = cleanItemName(line.slice(0, m.index));
            if (!hasName(name)) {
                // Price line without a name: belongs to the name on the line above
                if (!pendingName) continue;
                name = pendingName;
            }
            pendingName = "";
            if (cents === 0) continue;
            const { qty, unitCents } = quantityFor(line, m.index, cents);
            items.push({ name, qty, unitCents, category: categoriseItem(name), cents });
        }
        // A line equal to the whole total is the total printed again, not an item
        if (total && items.length > 1) {
            for (let i = items.length - 1; i >= 0; i--) if (items[i].cents === total.cents) items.splice(i, 1);
        }

        const itemsCents = items.reduce((sum, it) => sum + it.cents, 0);
        const date = lines.map(datesIn).find((d) => d.length);
        return {
            store: detectStore(lines),
            date: date ? date[0] : null,
            items,
            itemsCents,
            totalCents: total ? total.cents : itemsCents || null,
            totalFound: Boolean(total),
        };
    }

    // ---------- utility bill ----------
    const AMOUNT_DUE_RE = /amount\s+(?:due|payable|to\s+pay)|total\s+(?:amount\s+)?(?:due|payable)|montant\s+(?:a|à)\s+payer|net\s+amount|balance\s+due|total\s+due|to\s+pay|total\s+bill/i;
    const DUE_DATE_RE = /due\s+date|pay(?:able)?\s+(?:before|by|on)|date\s+limite|(?:é|e)ch(?:é|e)ance|last\s+date|due\s+on/i;
    const ACCOUNT_RE = /(?:account|acc\.?|a\/c|customer|client|contract|contrat)\s*(?:no\.?|number|num(?:ber|ero)?|n°|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})/i;

    function valueNear(lines, re, pick) {
        for (let i = 0; i < lines.length; i++) {
            if (!re.test(lines[i])) continue;
            const found = pick(lines[i]) ?? (lines[i + 1] ? pick(lines[i + 1]) : null);
            if (found != null) return found;
        }
        return null;
    }

    function parseBill(text) {
        const lines = splitLines(text);
        const joined = lines.join("\n");
        const provider = BILL_PROVIDERS.find((p) => p.re.test(joined));

        let amountCents = valueNear(lines, AMOUNT_DUE_RE, (l) => lastAmount(l)?.cents ?? null);
        if (amountCents == null) amountCents = findTotal(lines)?.cents ?? null;

        const dueDate = valueNear(lines, DUE_DATE_RE, (l) => datesIn(l)[0] ?? null);
        const allDates = lines.flatMap(datesIn);
        const billDate = allDates.find((d) => d !== dueDate) || null;
        const account = ACCOUNT_RE.exec(joined)?.[1] || "";

        return {
            type: provider ? provider.type : "Other",
            provider: provider ? provider.name : "",
            account,
            amountCents,
            billDate,
            dueDate,
        };
    }

    const api = { parseReceipt, parseBill, amountsIn, datesIn, categoriseItem, ITEM_CATEGORIES };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.ReceiptParser = api;
})(typeof window !== "undefined" ? window : globalThis);
