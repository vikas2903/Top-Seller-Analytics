import "../styles/app._index.css";
import { boundary } from "@shopify/shopify-app-react-router/server";


const summaryCards = [
  { title: "Total Orders", value: "325", detail: "Today", badge: "OR" },
  { title: "Total Items Sold", value: "1,240", detail: "This Week", badge: "IT" },
  { title: "Total Revenue", value: "$12,560", detail: "Last 30 Days", badge: "$$" },
];

const chartLabels = ["Mar 15", "Mar 17", "Mar 19", "Mar 21", "Mar 22", "Mar 23", "Mar 24"];
const chartData = [160, 360, 320, 660, 430, 500, 340];
const chartMax = 800;
const chartPoints = chartData.map((value, index) => {
  const x = (index / (chartData.length - 1)) * 100;
  const y = 100 - (value / chartMax) * 100;
  return { x, y, label: chartLabels[index] };
});

const linePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
const areaPoints = `0,100 ${linePoints} 100,100`;
const peakPoint = chartPoints[3];

const topProducts = [
  { rank: "1", code: "SN", name: "Classic Sneakers", sold: "150", revenue: "$3,750", trend: "up" },
  { rank: "2", code: "RT", name: "Red T-Shirt", sold: "95", revenue: "$1,425", trend: "down" },
  { rank: "3", code: "DW", name: "Digital Watch", sold: "80", revenue: "$2,400", trend: "up" },
];

const insightNotes = [
  "Sales up 20% in the last 7 days",
  "Classic Sneakers are trending",
  "Red T-Shirt sales dropped 15%",
];

const salesRows = [
  { date: "03/21/2023", orders: "85", itemsSold: "280", revenue: "$3,560" },
  { date: "03/20/2023", orders: "70", itemsSold: "240", revenue: "$2,980" },
  { date: "03/19/2023", orders: "60", itemsSold: "195", revenue: "$2,450" },
];


export  function  additionalData() {
  return (
    <main className="dashboard-shell min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Demo Dashboard</p>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Top seller analytics</h1>
              <p className="text-sm text-slate-500">
                Static demo data only. Replace the arrays in this file with dynamic values later.
              </p>
            </div>
            <div className="rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-sm">
              Store: Demo Fashion Co.
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2.6fr)_minmax(280px,1fr)]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <section key={card.title} className="dashboard-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">{card.title}</p>
                      <div className="mt-3 flex items-end gap-2">
                        <span className="text-4xl font-bold tracking-tight text-slate-900">{card.value}</span>
                        <span className="pb-1 text-sm font-medium text-slate-500">{card.detail}</span>
                      </div>
                    </div>
                    <div className="stat-badge">{card.badge}</div>
                  </div>
                </section>
              ))}

              <section className="dashboard-card md:col-span-2 xl:col-span-1">
                <p className="text-sm font-semibold text-slate-500">Top Product Today</p>
                <div className="mt-4 flex items-center gap-4 rounded-2xl bg-slate-50 p-3">
                  <div className="product-tile">SN</div>
                  <div>
                    <p className="font-semibold text-slate-900">Classic Sneakers</p>
                    <p className="text-sm text-slate-500">
                      Sold: <span className="font-semibold text-sky-700">150</span>
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <section className="dashboard-card">
              <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Sales Trend</h2>
                  <p className="text-sm text-slate-500">Demo performance for the last 7 days</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Today", "7 Days", "30 Days", "Custom"].map((filter, index) => (
                    <button
                      key={filter}
                      type="button"
                      className={
                        index === 0
                          ? "rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                          : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500"
                      }
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="chart-wrap">
                <div className="chart-grid">
                  {[800, 600, 400, 200, 0].map((tick) => (
                    <div key={tick} className="chart-row">
                      <span className="chart-tick">{tick}</span>
                      <div className="chart-line" />
                    </div>
                  ))}
                </div>

                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
                  <defs>
                    <linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#4f9cf9" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#4f9cf9" stopOpacity="0.06" />
                    </linearGradient>
                  </defs>
                  <polygon points={areaPoints} fill="url(#salesArea)" />
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke="#2373d8"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {chartPoints.map((point) => (
                    <circle
                      key={point.label}
                      cx={point.x}
                      cy={point.y}
                      r="1.15"
                      fill="#ffffff"
                      stroke="#2373d8"
                      strokeWidth="0.8"
                    />
                  ))}
                  <line
                    x1={peakPoint.x}
                    y1={peakPoint.y}
                    x2={peakPoint.x}
                    y2="100"
                    stroke="#2373d8"
                    strokeWidth="0.5"
                    strokeDasharray="2 2"
                    opacity="0.8"
                  />
                </svg>

                <div className="chart-tooltip" style={{ left: `${peakPoint.x}%`, top: `${peakPoint.y}%` }}>
                  Mar 21 - 280 Sold
                </div>

                <div className="chart-labels">
                  {chartLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1.55fr)]">
              <section className="dashboard-card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900">Top Products</h2>
                  <span className="text-sm text-slate-500">This week</span>
                </div>
                <div className="space-y-3">
                  {topProducts.map((product) => (
                    <div
                      key={product.rank}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rank-pill">{product.rank}</div>
                        <div className="product-mini-tile">{product.code}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">{product.name}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-600">{product.sold} Sold</p>
                      <p className="w-20 text-right font-bold text-slate-900">{product.revenue}</p>
                      <span className={product.trend === "up" ? "trend-up" : "trend-down"}>
                        {product.trend === "up" ? "UP" : "DN"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="dashboard-card">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900">Insights</h2>
                  <span className="text-sm text-slate-500">Daily snapshot</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="min-w-full text-left">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Orders</th>
                        <th className="px-4 py-3">Items Sold</th>
                        <th className="px-4 py-3">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {salesRows.map((row) => (
                        <tr key={row.date} className="border-t border-slate-100 text-sm text-slate-700">
                          <td className="px-4 py-3">{row.date}</td>
                          <td className="px-4 py-3">{row.orders}</td>
                          <td className="px-4 py-3">{row.itemsSold}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">{row.revenue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>

          <div className="space-y-5">
            <section className="dashboard-card">
              <h2 className="text-xl font-bold text-slate-900">Insights</h2>
              <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                {insightNotes.map((note) => (
                  <div key={note} className="flex gap-3 text-sm text-slate-700">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-sky-500" />
                    <p>{note}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}


