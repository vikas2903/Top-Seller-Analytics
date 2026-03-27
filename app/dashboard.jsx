/* eslint-disable react/prop-types */
import "./styles/app._index.css";

function formatDateTime(value) {
  if (!value) {
    return "Not synced yet";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function KpiCard({ title, value, detail }) {
  return (
    <div className="dashboard-card summary-card">
      <div className="summary-title-row">
        <span className="summary-title">{title}</span>
      </div>
      <div className="summary-value-row">
        <div className="summary-value">{value}</div>
      </div>
      <div className="summary-detail">{detail}</div>
    </div>
  );
}

export default function Dashboard({ kpis }) {
  return (
    <div className="dashboard-shell">
      <div className="dashboard-frame">
        <div className="summary-grid">
          <KpiCard
            title="Top Product Today"
            value={kpis.topProductName}
            detail={kpis.topProductDetail}
          />
          <KpiCard
            title="Total Orders Processed"
            value={String(kpis.totalOrdersProcessed)}
            detail={`For ${kpis.syncDateLabel}`}
          />
          <KpiCard
            title="Last Sync Time"
            value={formatDateTime(kpis.lastSyncTime)}
            detail={`Meta field write date: ${formatDateTime(kpis.metaFieldWriteDate)}`}
          />
          <KpiCard
            title="Products Updated in Theme"
            value={String(kpis.productsUpdatedInTheme)}
            detail={kpis.productsUpdatedDetail}
          />
        </div>
      </div>
    </div>
  );
}
