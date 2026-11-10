# Sales Dashboard

A standalone sales dashboard for a small business. No install, no build step, and no accounts.

## Run it

Open `index.html` in your browser. That's it.

For the most reliable local storage behavior, you can also serve the folder:

```bash
cd "Big pickle"
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## What it does

- **Overview cards** - revenue, number of sales, average sale, and today's revenue with comparisons to the previous period.
- **Revenue chart** - adapts between daily, weekly, monthly, and quarterly buckets depending on the selected time range.
- **Top products** - ranks products or services by revenue for the selected period.
- **Sales table** - search by product, customer, note, or amount; filter by payment method; delete a sale with undo.
- **Add a sale** - amount, date, product, customer, payment method, and notes.
- **CSV export** - exports the current view, or all sales from the settings screen.
- **Settings** - change the business name and currency.

## Sample data

The dashboard starts with sample sales so you can explore it immediately. Use **Clear sample data** in the notice at the top when you are ready to record your own sales. Only sample sales are removed; any real sales you add are kept.

## Where data lives

Sales are saved in your browser's local storage, tied to this page. They stay on your device and are not sent anywhere.

Because browser storage can be cleared, use **Export CSV** to keep a backup. If you open the page in a different browser or on a different device, you will see a fresh dashboard.

## Files

- `index.html` - page structure
- `styles.css` - layout and design
- `app.js` - sales data, calculations, charts, and interactions

No external libraries or internet connection are required.
