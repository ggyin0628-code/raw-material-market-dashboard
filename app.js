const state = {
  rows: [],
  selectedId: null,
  refreshTimer: null,
  refreshSeconds: 900,
};

const els = {
  sourceMode: document.querySelector("#sourceMode"),
  lastUpdated: document.querySelector("#lastUpdated"),
  fxRate: document.querySelector("#fxRate"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  signalFilter: document.querySelector("#signalFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  refreshSelect: document.querySelector("#refreshSelect"),
  refreshButton: document.querySelector("#refreshButton"),
  liveCount: document.querySelector("#liveCount"),
  errorCount: document.querySelector("#errorCount"),
  topGainer: document.querySelector("#topGainer"),
  topLoser: document.querySelector("#topLoser"),
  rowCount: document.querySelector("#rowCount"),
  disclaimer: document.querySelector("#disclaimer"),
  materialRows: document.querySelector("#materialRows"),
  detailCategory: document.querySelector("#detailCategory"),
  detailName: document.querySelector("#detailName"),
  detailSignal: document.querySelector("#detailSignal"),
  detailSymbol: document.querySelector("#detailSymbol"),
  detailSource: document.querySelector("#detailSource"),
  detailStatus: document.querySelector("#detailStatus"),
  detailUsage: document.querySelector("#detailUsage"),
  detailHistory: document.querySelector("#detailHistory"),
};

function formatNumber(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: digits,
    minimumFractionDigits: value < 10 ? Math.min(2, digits) : 0,
  }).format(value);
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}

function formatDateTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getCostSignal(row) {
  if (row.status === "STALE") {
    return {
      label: "快取資料",
      tone: "stale",
      note: "真實舊行情，非即時資料",
    };
  }

  if (row.status === "FALLBACK") {
    return {
      label: "備援來源",
      tone: "fallback",
      note: "主來源失敗，使用備援行情",
    };
  }

  if (row.status !== "OK" && row.status !== "LIVE") {
    return {
      label: "資料異常",
      tone: "error",
      note: row.error || "資料源無回應",
    };
  }

  const change = row.changePercent;
  if (typeof change !== "number") {
    return {
      label: "待觀察",
      tone: "neutral",
      note: "缺少漲跌資料",
    };
  }

  if (change >= 2) {
    return {
      label: "成本上升",
      tone: "danger",
      note: "採購前先確認供應商報價有效期",
    };
  }

  if (change <= -2) {
    return {
      label: "可議價",
      tone: "opportunity",
      note: "行情下跌，可詢問新報價",
    };
  }

  return {
    label: "穩定",
    tone: "stable",
    note: "短線波動較小",
  };
}

function setBadge(status) {
  els.sourceMode.className = "badge";
  if (status === "OK" || status === "LIVE") {
    els.sourceMode.classList.add("live");
    els.sourceMode.textContent = status === "OK" ? "OK" : "LIVE";
  } else if (status === "FALLBACK") {
    els.sourceMode.classList.add("fallback");
    els.sourceMode.textContent = "FALLBACK";
  } else if (status === "STALE") {
    els.sourceMode.classList.add("stale");
    els.sourceMode.textContent = "STALE";
  } else if (status === "API_ERROR") {
    els.sourceMode.classList.add("error");
    els.sourceMode.textContent = "API ERROR";
  } else {
    els.sourceMode.classList.add("neutral");
    els.sourceMode.textContent = status;
  }
}

function populateCategories() {
  const categories = [...new Set(state.rows.map((row) => row.category))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const current = els.categoryFilter.value;
  els.categoryFilter.innerHTML = `<option value="all">全部</option>${categories.map((category) => `<option value="${category}">${category}</option>`).join("")}`;
  els.categoryFilter.value = categories.includes(current) ? current : "all";
}

function getFilteredRows() {
  const query = els.searchInput.value.trim().toLowerCase();
  const category = els.categoryFilter.value;
  const signalMode = els.signalFilter.value;
  const filtered = state.rows.filter((row) => {
    const text = `${row.name} ${row.symbol} ${row.category} ${row.usage}`.toLowerCase();
    const categoryMatched = category === "all" || row.category === category;
    const signal = getCostSignal(row);
    const signalMatched = signalMode === "all" || signal.tone === signalMode;
    return categoryMatched && signalMatched && (!query || text.includes(query));
  });

  const sortMode = els.sortSelect.value;
  const signalRank = {
    error: 0,
    danger: 1,
    opportunity: 2,
    stable: 3,
    neutral: 4,
    fallback: 5,
    stale: 6,
  };
  return filtered.sort((a, b) => {
    if (sortMode === "signal") {
      const rankA = signalRank[getCostSignal(a).tone] ?? 9;
      const rankB = signalRank[getCostSignal(b).tone] ?? 9;
      return rankA - rankB || Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
    }
    if (sortMode === "changeDesc") return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
    if (sortMode === "changeAsc") return (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity);
    if (sortMode === "name") return a.name.localeCompare(b.name, "zh-Hant");
    return `${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`, "zh-Hant");
  });
}

function renderSummary() {
  const liveRows = state.rows.filter((row) => row.status === "OK" || row.status === "LIVE" || row.status === "FALLBACK");
  const staleRows = state.rows.filter((row) => row.status === "STALE");
  const errorRows = state.rows.filter((row) => row.status === "API_ERROR");
  const ranked = [...liveRows, ...staleRows].filter((row) => typeof row.changePercent === "number");
  const topGainer = [...ranked].sort((a, b) => b.changePercent - a.changePercent)[0];
  const topLoser = [...ranked].sort((a, b) => a.changePercent - b.changePercent)[0];

  els.liveCount.textContent = liveRows.length;
  els.errorCount.textContent = errorRows.length;
  els.topGainer.textContent = topGainer ? `${topGainer.name} ${formatPercent(topGainer.changePercent)}` : "--";
  els.topLoser.textContent = topLoser ? `${topLoser.name} ${formatPercent(topLoser.changePercent)}` : "--";
}

function renderTable() {
  const rows = getFilteredRows();
  els.rowCount.textContent = `${rows.length} 筆`;
  if (!rows.length) {
    els.materialRows.innerHTML = `<tr><td colspan="7" class="empty">沒有符合條件的原物料</td></tr>`;
    return;
  }

  els.materialRows.innerHTML = rows.map((row) => {
    const changeClass = row.changePercent > 0 ? "up" : row.changePercent < 0 ? "down" : "muted";
    const signal = getCostSignal(row);
    const selected = state.selectedId === row.id ? "selected" : "";
    const rowTone = signal.tone === "danger" ? "risk-row" : signal.tone === "opportunity" ? "chance-row" : "";
    return `
      <tr class="${selected} ${rowTone}" data-id="${row.id}">
        <td class="name-cell">
          <strong>${row.name}</strong>
          <small>${row.symbol} · ${row.source.replace("Yahoo Finance - ", "")}</small>
        </td>
        <td>${row.category}</td>
        <td class="numeric">
          <span class="price">${formatNumber(row.price, 4)}</span>
          <small class="unit">${row.unit}</small>
        </td>
        <td class="numeric ${changeClass}">
          <span class="change-pill">${formatPercent(row.changePercent)}</span>
        </td>
        <td class="numeric twd-cell">TWD ${formatNumber(row.twdEstimate, 2)}</td>
        <td>
          <span class="signal ${signal.tone}">${signal.label}</span>
          <small class="signal-note">${signal.note}</small>
        </td>
        <td>
          <span class="time-text">${row.status === "OK" || row.status === "LIVE" || row.status === "FALLBACK" || row.status === "STALE" ? formatDateTime(row.lastTradeAt) : "API ERROR"}</span>
          <small class="muted">${row.status}</small>
        </td>
      </tr>
    `;
  }).join("");
}

function renderDetail() {
  const selected = state.rows.find((row) => row.id === state.selectedId) || state.rows[0];
  if (!selected) return;
  const signal = getCostSignal(selected);
  state.selectedId = selected.id;
  els.detailCategory.textContent = selected.category;
  els.detailName.textContent = selected.name;
  els.detailSignal.textContent = `${signal.label}｜${signal.note}`;
  els.detailSignal.className = `detail-signal ${signal.tone}`;
  els.detailSymbol.textContent = selected.symbol;
  els.detailSource.textContent = selected.source;
  const detailBadge = selected.status === "OK" || selected.status === "LIVE" ? "live" : selected.status === "FALLBACK" ? "fallback" : selected.status === "STALE" ? "stale" : "error";
  const detailTime = selected.status === "OK" || selected.status === "LIVE" || selected.status === "FALLBACK" || selected.status === "STALE" ? formatDateTime(selected.lastTradeAt) : selected.error || "資料源無回應";
  els.detailStatus.innerHTML = `<span class="badge ${detailBadge}">${selected.status}</span> ${detailTime}`;
  els.detailUsage.textContent = selected.usage;
  els.detailHistory.textContent = selected.history?.length
    ? selected.history.map((point) => `${point.date}: ${formatNumber(point.close, 4)}`).join(" / ")
    : selected.status === "API_ERROR" ? `無資料：${selected.error || "API ERROR"}` : "--";
}

function renderAll() {
  populateCategories();
  renderSummary();
  renderTable();
  renderDetail();
}

function scheduleRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  const seconds = Number(els.refreshSelect.value);
  state.refreshSeconds = seconds;
  if (seconds > 0) {
    state.refreshTimer = setInterval(loadMarketData, seconds * 1000);
  }
}

async function loadMarketData() {
  els.refreshButton.disabled = true;
  els.refreshButton.textContent = "更新中";
  setBadge("連線中");

  try {
    const response = await fetch("/api/market", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.rows = data.rows || [];
    els.disclaimer.textContent = data.disclaimer || "";
    els.lastUpdated.textContent = `更新：${formatDateTime(data.generatedAt)}`;
    els.fxRate.textContent = data.fx?.rate ? `USD/TWD: ${formatNumber(data.fx.rate, 4)} (${data.fx.status})` : `USD/TWD: ${data.fx?.status || "API_ERROR"}`;
    setBadge(data.state || (state.rows.some((row) => row.status === "OK" || row.status === "LIVE") ? "OK" : state.rows.some((row) => row.status === "FALLBACK") ? "FALLBACK" : state.rows.some((row) => row.status === "STALE") ? "STALE" : "API_ERROR"));
    renderAll();
  } catch (error) {
    setBadge("API_ERROR");
    els.lastUpdated.textContent = "更新失敗";
    els.materialRows.innerHTML = `<tr><td colspan="7" class="empty">行情讀取失敗：${error.message}</td></tr>`;
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.textContent = "立即更新";
  }
}

els.materialRows.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  state.selectedId = row.dataset.id;
  renderTable();
  renderDetail();
});

els.searchInput.addEventListener("input", renderTable);
els.categoryFilter.addEventListener("change", renderTable);
els.signalFilter.addEventListener("change", renderTable);
els.sortSelect.addEventListener("change", renderTable);
els.refreshButton.addEventListener("click", loadMarketData);
els.refreshSelect.addEventListener("change", scheduleRefresh);

scheduleRefresh();
loadMarketData();
