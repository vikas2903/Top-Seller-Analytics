/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { useNavigation, useSubmit } from "react-router";
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

export default function Dashboard({
  kpis,
  availableDates,
  tableProducts,
  defaultFilterDate,
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [selectedDate, setSelectedDate] = useState(defaultFilterDate || "");

  useEffect(() => {
    setSelectedDate(defaultFilterDate || availableDates?.[0] || "");
  }, [defaultFilterDate, availableDates]);

  useEffect(() => {
    if (!selectedDate || selectedDate === defaultFilterDate) {
      return;
    }

    submit({ date: selectedDate }, { method: "get" });
  }, [defaultFilterDate, selectedDate, submit]);

  const dayOptions = availableDates || [];
  const hasDayOptions = dayOptions.length > 0;
  const displayDate = selectedDate || defaultFilterDate;
  const isLoadingDate = navigation.state !== "idle";
  const emptyMessage = displayDate
    ? `No product data found in DB for ${displayDate}.`
    : "No orders sync";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-frame">
        <div className="summary-grid">
          <KpiCard
            title="Top Product Yesterday"
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
            value=""
            detail={`Meta field write date: ${formatDateTime(kpis.metaFieldWriteDate)}`}
          />
          <KpiCard
            title="Products Updated in Theme"
            value={String(kpis.productsUpdatedInTheme)}
            detail={kpis.productsUpdatedDetail}
          />
        </div>

        <div
          className="dashboard-card"
          style={{ marginTop: "14px", overflowX: "auto" }}
        >
          {/* <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              marginBottom: "14px",
              flexWrap: "wrap",
            }}
          >
            <div className="summary-title">Products</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label
                htmlFor="day-filter"
                style={{ fontSize: "12px", fontWeight: 700, color: "#31557d" }}
              >
                Day filter
              </label>

              <select
                id="day-filter"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                disabled={!hasDayOptions}
                style={{
                  border: "1px solid #d7e1ef",
                  borderRadius: "6px",
                  padding: "8px 10px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#294b74",
                  background: "#fff",
                }}
              >
                {hasDayOptions ? (
                  dayOptions.map((date) => (
                    <option key={date} value={date}>
                      {date}
                    </option>
                  ))
                ) : (
                  <option value="">No orders sync</option>
                )}
              </select>
            </div>
          </div> */}

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "760px",
            }}
          >
            <thead>
              <tr style={{ background: "#edf3f9" }}>
                <th style={tableHeadStyle}>Image</th>
                <th style={tableHeadStyle}>Product Name</th>
                <th style={tableHeadStyle}>Sold Total Qty</th>
                <th style={tableHeadStyle}>Date</th>
                <th style={tableHeadStyle}>Open Product URL</th>
              </tr>
            </thead>
            <tbody>
              {tableProducts.length > 0 ? (
                tableProducts.map((product) => (
                  <tr key={product.id} style={{ borderTop: "1px solid #edf3f9" }}>
                    <td style={tableCellStyle}>
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          style={{
                            width: "48px",
                            height: "48px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            border: "1px solid #e2ebf5",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "8px",
                            border: "1px solid #e2ebf5",
                            background: "#f7fafd",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#7a8fa6",
                          }}
                        >
                          N/A
                        </div>
                      )}
                    </td>
                    <td style={tableCellStyle}>{product.title}</td>
                    <td style={tableCellStyle}>{product.soldQty}</td>
                    <td style={tableCellStyle}>{product.date}</td>
                    <td style={tableCellStyle}>
                      <a
                        href={product.productAdminUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "#2b77d8",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Open product
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      ...tableCellStyle,
                      textAlign: "center",
                      color: "#7a8fa6",
                    }}
                  >
                    {isLoadingDate ? `Loading product data for ${displayDate}...` : emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const tableHeadStyle = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: "11px",
  fontWeight: 800,
  color: "#4f6886",
};

const tableCellStyle = {
  padding: "12px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#31557d",
  verticalAlign: "middle",
};
