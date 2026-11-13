// Loan maths. No DOM access, so it runs in the browser and in Node (for testing).
// Money is whole cents. Each period's interest is rounded to the cent and the
// final instalment absorbs any rounding so the balance ends at exactly zero.
//
// A loan: {
//   principalCents, annualRate (e.g. 6.5 for 6.5% a year), termMonths,
//   method: "reducing" | "flat" | "interestOnly",
//   frequency: "monthly" | "fortnightly" | "weekly",
//   firstPaymentDate: "YYYY-MM-DD"
// }
(function (root) {
    const FREQUENCIES = {
        monthly: { label: "Monthly", perYear: 12, noun: "month" },
        fortnightly: { label: "Every 2 weeks", perYear: 26, noun: "fortnight" },
        weekly: { label: "Weekly", perYear: 52, noun: "week" },
    };

    const METHODS = {
        reducing: "Reducing balance (equal instalments)",
        flat: "Flat rate",
        interestOnly: "Interest only (principal paid at the end)",
    };

    // Typical setup per loan type. Rates are left to the user: use your bank's rate.
    const LOAN_TYPES = {
        "Home loan": { termMonths: 300, method: "reducing" },
        "Car loan": { termMonths: 60, method: "reducing" },
        "Personal loan": { termMonths: 36, method: "reducing" },
        "Education loan": { termMonths: 60, method: "reducing" },
        "Hire purchase": { termMonths: 36, method: "flat" },
        "Business loan": { termMonths: 60, method: "reducing" },
        Other: { termMonths: 12, method: "reducing" },
    };

    const numPayments = (loan) =>
        Math.max(1, Math.round((loan.termMonths / 12) * FREQUENCIES[loan.frequency].perYear));
    const periodRate = (loan) => loan.annualRate / 100 / FREQUENCIES[loan.frequency].perYear;

    // Flat rate: interest on the ORIGINAL amount for the whole term
    const flatTotalInterest = (loan) =>
        Math.round((loan.principalCents * loan.annualRate * loan.termMonths) / 100 / 12);

    // The regular instalment
    function instalment(loan) {
        const P = loan.principalCents, n = numPayments(loan), r = periodRate(loan);
        if (loan.method === "flat") return Math.round((P + flatTotalInterest(loan)) / n);
        if (loan.method === "interestOnly") return Math.round(P * r);
        if (r === 0) return Math.ceil(P / n);
        return Math.round((P * r) / (1 - Math.pow(1 + r, -n)));
    }

    function isoDate(d) {
        const p = (x) => String(x).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // Date of instalment k (1-based). Monthly keeps the same day, moved earlier in short months.
    function paymentDate(loan, k) {
        const [y, m, d] = loan.firstPaymentDate.split("-").map(Number);
        if (loan.frequency === "monthly") {
            const t = new Date(y, m - 1 + (k - 1), 1);
            const daysInMonth = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
            t.setDate(Math.min(d, daysInMonth));
            return isoDate(t);
        }
        const step = loan.frequency === "weekly" ? 7 : 14;
        return isoDate(new Date(y, m - 1, d + (k - 1) * step));
    }

    // Full repayment schedule.
    //   extras:         one-off extra payments [{ afterInstalment, amountCents }] (0 = before the first)
    //   extraPerPeriod: extra paid on top of every instalment ("what if" calculator)
    // Extra payments go straight to the principal, so the loan finishes earlier.
    // For flat-rate loans this assumes the lender stops charging interest once the
    // principal is cleared (check your contract: some charge an early-settlement fee).
    function schedule(loan, { extras = [], extraPerPeriod = 0 } = {}) {
        const n = numPayments(loan), r = periodRate(loan), pmt = instalment(loan);
        const flatInterest = loan.method === "flat" ? flatTotalInterest(loan) : 0;
        let flatInterestLeft = flatInterest;
        let balance = loan.principalCents;
        const rows = [];

        const applyExtras = (k) => {
            for (const e of extras) if (e.afterInstalment === k) balance = Math.max(0, balance - e.amountCents);
        };
        applyExtras(0);

        for (let k = 1; balance > 0 && k <= 5000; k++) {
            let interest;
            if (loan.method === "flat") {
                interest = Math.min(k < n ? Math.round(flatInterest / n) : flatInterestLeft, flatInterestLeft);
                flatInterestLeft -= interest;
            } else {
                interest = Math.round(balance * r);
            }

            let principal = loan.method === "interestOnly" ? 0 : pmt - interest;
            principal += extraPerPeriod;
            if (k >= n || principal >= balance) principal = balance; // last one clears it
            if (principal <= 0 && loan.method !== "interestOnly") principal = Math.min(balance, 1); // safety

            balance -= principal;
            rows.push({ k, date: paymentDate(loan, k), payment: interest + principal, interest, principal, balance });
            applyExtras(k);
        }
        return rows;
    }

    function summarise(rows) {
        const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
        const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
        return {
            count: rows.length,
            totalInterest,
            totalPaid,
            payoffDate: rows.length ? rows[rows.length - 1].date : null,
        };
    }

    // The reducing-balance rate that gives the same instalment. For flat-rate loans this is the
    // real cost of borrowing, usually close to double the advertised flat rate.
    function effectiveAnnualRate(loan) {
        const P = loan.principalCents, n = numPayments(loan), pmt = instalment(loan);
        if (pmt * n <= P) return 0;
        let lo = 0, hi = 1;
        for (let i = 0; i < 100; i++) {
            const mid = (lo + hi) / 2;
            const pv = (pmt * (1 - Math.pow(1 + mid, -n))) / mid;
            if (pv > P) lo = mid; else hi = mid;
        }
        return ((lo + hi) / 2) * FREQUENCIES[loan.frequency].perYear * 100;
    }

    // Where a tracked loan stands. history: [{ type: "payment" | "extra", amountCents?, date }]
    function loanState(loan, history = []) {
        const extras = [];
        let paidCount = 0;
        for (const h of history) {
            if (h.type === "payment") paidCount++;
            else extras.push({ afterInstalment: paidCount, amountCents: h.amountCents });
        }
        const rows = schedule(loan, { extras });
        paidCount = Math.min(paidCount, rows.length);
        const paid = rows.slice(0, paidCount);
        const extrasNow = extras.filter((e) => e.afterInstalment === paidCount).reduce((s, e) => s + e.amountCents, 0);
        const balance = Math.max(0, (paidCount ? paid[paidCount - 1].balance : loan.principalCents) - extrasNow);
        const extrasTotal = extras.reduce((s, e) => s + e.amountCents, 0);
        return {
            rows,
            paidCount,
            balance,
            done: balance === 0,
            next: balance > 0 ? rows[paidCount] || null : null,
            interestPaid: paid.reduce((s, r) => s + r.interest, 0),
            interestLeft: rows.slice(paidCount).reduce((s, r) => s + r.interest, 0),
            principalRepaid: loan.principalCents - balance,
            extrasTotal,
        };
    }

    const api = {
        FREQUENCIES, METHODS, LOAN_TYPES,
        numPayments, instalment, paymentDate, schedule, summarise, effectiveAnnualRate, loanState,
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.LoanEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
