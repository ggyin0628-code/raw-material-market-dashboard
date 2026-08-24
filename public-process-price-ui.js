(function attachPublicProcessPriceUi(root) {
  function formatNumber(value) {
    return typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "--";
  }

  function displayUnit(unit) {
    return String(unit || "").replace(/^[A-Z]+\//, "");
  }

  function hasMonetaryData(item = {}) {
    return item.sourceRole !== "NO_PUBLIC_PRICE_DATA"
      && typeof item.priceMin === "number"
      && Number.isFinite(item.priceMin)
      && (item.priceOpenEnded === true || (typeof item.priceMax === "number" && Number.isFinite(item.priceMax)));
  }

  function rangeText(item = {}) {
    if (item.priceOpenEnded === true) return `${formatNumber(item.priceMin)}+`;
    return item.priceMin === item.priceMax
      ? formatNumber(item.priceMin)
      : `${formatNumber(item.priceMin)}–${formatNumber(item.priceMax)}`;
  }

  function isExplicitCurrency(item = {}) {
    return item.currencyEvidence === "EXPLICIT" && Boolean(item.currency);
  }

  function priceText(item = {}) {
    if (!hasMonetaryData(item)) return "公開金額資料不足";
    const amount = isExplicitCurrency(item) ? `${item.currency === "TWD" ? "NT$" : item.currency} ${rangeText(item)}` : `網站列示：${rangeText(item)}`;
    return `${amount} / ${displayUnit(item.unit)}`.trim();
  }

  function currencyEvidenceText(item = {}) {
    if (!hasMonetaryData(item)) return "幣別：不適用（沒有可接受的公開金額範圍）";
    if (isExplicitCurrency(item)) return `幣別：來源明示 ${item.currency}`;
    if (item.currencyEvidence === "LOCALE_INFERRED") return "幣別：來源頁未明示（台灣網站語境推定，需詢價確認）";
    return "幣別：來源頁未明示（需詢價確認）";
  }

  function smallHoleText(item = {}) {
    if (item.smallHoleFeeMin == null) return "";
    const range = item.smallHoleFeeMin === item.smallHoleFeeMax
      ? formatNumber(item.smallHoleFeeMin)
      : `${formatNumber(item.smallHoleFeeMin)}–${formatNumber(item.smallHoleFeeMax)}`;
    const amount = isExplicitCurrency(item) ? `${item.currency === "TWD" ? "NT$" : item.currency} ${range}` : `網站列示：${range}`;
    return `小圓孔：${amount} / ${displayUnit(item.smallHoleUnit || "hole")}；${item.smallHoleBasis || "來源明列"}`;
  }

  root.publicProcessPriceUi = Object.freeze({
    currencyEvidenceText,
    hasMonetaryData,
    priceText,
    smallHoleText,
  });
})(window);
